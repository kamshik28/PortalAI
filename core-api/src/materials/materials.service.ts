// src/materials/materials.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { embed } from '../lib/openaiEmbeddings';
import {
  deletePointsByFilter,
  ensureCollectionExists,
  makeStablePointId,
  upsertPoints,
} from '../lib/qdrant';
import pdfParse from 'pdf-parse';

export type UnitType = 'lecture' | 'lab';

export type UploadMaterialInput = {
  courseId: string;
  unitType: UnitType;
  unitIndex: number;
  file: Express.Multer.File;
  replaceExisting?: boolean;
};

type MaterialRow = {
  id: string;
  course_id: string;
  unit_type: UnitType;
  unit_index: number;
  original_name: string;
  storage_path: string;
  mime_type: string | null;
  created_at: string;
  indexed_at: string | null;
  chunk_count: number | null;
};

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'portal-materials';
const COURSE_MATERIAL_QDRANT_VERSION = 1;

function chunkText(text: string, chunkSize = 1200, overlap = 200) {
  const chunks: string[] = [];
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return chunks;

  let i = 0;
  while (i < clean.length) {
    const end = Math.min(i + chunkSize, clean.length);
    chunks.push(clean.slice(i, end));
    if (end === clean.length) break;
    i = Math.max(0, end - overlap);
  }

  return chunks;
}

@Injectable()
export class MaterialsService {
  private async mapRow(row: MaterialRow) {
    const { data: signed } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(row.storage_path, 60 * 60);

    return {
      id: row.id,
      courseId: row.course_id,
      unitType: row.unit_type,
      unitIndex: row.unit_index,
      filename: row.original_name,
      storagePath: row.storage_path,
      mimeType: row.mime_type,
      createdAt: row.created_at,
      signedUrl: signed?.signedUrl ?? null,
      indexedAt: row.indexed_at ?? null,
      chunkCount: row.chunk_count ?? null,
    };
  }

  /**
   * Deletes the Supabase file, the DB row, AND the Qdrant vectors for a
   * material.
   *
   * The Qdrant delete filter uses THREE fields for defence-in-depth:
   *   sourceType = "course_material"  — never touches AIS vectors
   *   courseId   = row.course_id      — scoped to this course
   *   materialId = row.id             — scoped to this exact upload
   *
   * Using only materialId would technically be safe (UUIDs are unique), but
   * the three-field filter makes the intent explicit and prevents an accidental
   * match if a materialId ever appeared in a different context.
   */
  private async deleteRowWithStorage(row: MaterialRow) {
    // 1. Remove Supabase storage file
    if (row.storage_path) {
      await supabaseAdmin.storage.from(BUCKET).remove([row.storage_path]);
    }

    // 2. Remove Qdrant vectors for this material (scoped to course + material).
    try {
      await deletePointsByFilter({
        must: [
          { key: 'sourceType', match: { value: 'course_material' } },
          { key: 'courseId',   match: { value: row.course_id } },
          { key: 'materialId', match: { value: row.id } },
        ],
      });
    } catch (e) {
      // Log but don't fail — stale vectors are less harmful than a broken delete.
      console.error(
        `[QDRANT] failed to delete vectors for material=${row.id}:`,
        e instanceof Error ? e.message : String(e),
      );
    }

    // 3. Remove DB row
    const { error: dbErr } = await supabaseAdmin
      .from('materials')
      .delete()
      .eq('id', row.id);

    if (dbErr) {
      throw new BadRequestException(`DB delete failed: ${dbErr.message}`);
    }
  }

  async listMaterials(courseId: string) {
    const { data, error } = await supabaseAdmin
      .from('materials')
      .select(
        'id, course_id, unit_type, unit_index, original_name, storage_path, mime_type, created_at, indexed_at, chunk_count',
      )
      .eq('course_id', courseId)
      .order('unit_type', { ascending: true })
      .order('unit_index', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException(`DB read failed: ${error.message}`);
    }

    const rows = (data ?? []) as MaterialRow[];
    return Promise.all(rows.map((row) => this.mapRow(row)));
  }

  async deleteMaterial(courseId: string, materialId: string) {
    const { data, error } = await supabaseAdmin
      .from('materials')
      .select(
        'id, course_id, unit_type, unit_index, original_name, storage_path, mime_type, created_at, indexed_at, chunk_count',
      )
      .eq('id', materialId)
      .eq('course_id', courseId)
      .limit(1);

    if (error) {
      throw new BadRequestException(`DB read failed: ${error.message}`);
    }

    const row = (data?.[0] ?? null) as MaterialRow | null;

    if (!row) {
      throw new NotFoundException('Material not found');
    }

    await this.deleteRowWithStorage(row);

    return { success: true };
  }

  async uploadMaterial(input: UploadMaterialInput) {
    const {
      courseId,
      unitType,
      unitIndex,
      file,
      replaceExisting = false,
    } = input;

    if (!file?.buffer?.length) {
      throw new BadRequestException('Empty file');
    }

    const { data: existingData, error: existingErr } = await supabaseAdmin
      .from('materials')
      .select(
        'id, course_id, unit_type, unit_index, original_name, storage_path, mime_type, created_at',
      )
      .eq('course_id', courseId)
      .eq('unit_type', unitType)
      .eq('unit_index', unitIndex)
      .order('created_at', { ascending: false });

    if (existingErr) {
      throw new BadRequestException(`DB read failed: ${existingErr.message}`);
    }

    const existingRows = (existingData ?? []) as MaterialRow[];

    if (existingRows.length > 0 && !replaceExisting) {
      throw new BadRequestException('For this slot a PDF already exists');
    }

    if (existingRows.length > 0 && replaceExisting) {
      // Delete old DB rows, Supabase files, AND Qdrant vectors.
      for (const row of existingRows) {
        await this.deleteRowWithStorage(row);
      }
    }

    let extractedText = '';
    try {
      const parsed: any = await pdfParse(file.buffer);
      extractedText = String(parsed?.text ?? '')
        .replace(/\s+/g, ' ')
        .trim();
    } catch {
      extractedText = '';
    }

    const materialId = randomUUID();
    const originalName = file.originalname || 'material.pdf';
    const safeName = originalName.replace(/[^\w.-]+/g, '_').slice(0, 120);
    const storagePath = `${courseId}/${unitType}/${unitIndex}/${materialId}_${safeName}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, file.buffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (upErr) {
      throw new BadRequestException(`Supabase upload failed: ${upErr.message}`);
    }

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 60);

    if (signErr || !signed?.signedUrl) {
      throw new BadRequestException(
        `Supabase signed url failed: ${signErr?.message ?? 'unknown'}`,
      );
    }

    const row = {
      id: materialId,
      course_id: courseId,
      unit_type: unitType,
      unit_index: unitIndex,
      original_name: originalName,
      storage_path: storagePath,
      mime_type: file.mimetype || 'application/pdf',
      created_at: new Date().toISOString(),
    };

    const { error: dbErr } = await supabaseAdmin.from('materials').insert(row);

    if (dbErr) {
      await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
      throw new BadRequestException(`DB insert failed: ${dbErr.message}`);
    }

    const chunks = chunkText(extractedText);

    if (chunks.length) {
      console.log(
        `[COURSE-MATERIAL] indexing: materialId=${materialId} ` +
        `courseId=${courseId} chunks=${chunks.length}`,
      );
      try {
        // ensureCollectionExists is also called at startup (AppService.onModuleInit)
        // but we call it here as a safety net in case this service starts before
        // the application-level hook fires.
        await ensureCollectionExists();
        const vectors = await embed(chunks);

        const unitLabel =
          unitType === 'lecture' ? 'Prednáška' : 'Cvičenie';

        const points = chunks.map((chunk, idx) => ({
          // Stable point ID: re-uploading the same materialId + chunkIndex
          // produces the same point ID, preventing duplicates on re-index.
          id: makeStablePointId([
            'course_material',
            courseId,
            materialId,
            String(idx),
          ]),
          vector: vectors[idx],
          payload: {
            // --- Content field (Flowise: contentPayloadKey = "text") ---
            text: chunk,

            // --- Top-level filter fields ---
            // MUST stay at top level — Qdrant filters only match top-level keys.
            sourceType: 'course_material', // isolates from AIS vectors
            materialId,                    // enables delete-by-materialId
            courseId,                      // Flowise filter + student quiz filter
            qdrantVersion: COURSE_MATERIAL_QDRANT_VERSION,

            // --- Flowise metadata field (metadataPayloadKey = "metadata") ---
            metadata: {
              source: `${unitLabel} ${unitIndex} — ${originalName} [chunk ${idx + 1}]`,
              originalName,
              unitType,
              unitIndex,
              chunkIndex: idx,
            },
          },
        }));

        await upsertPoints(points);

        // Record that indexing succeeded so the UI can show the status badge.
        await supabaseAdmin
          .from('materials')
          .update({
            indexed_at: new Date().toISOString(),
            chunk_count: points.length,
          })
          .eq('id', materialId);

        console.log(
          `[QDRANT] upsert ok: materialId=${materialId} courseId=${courseId} ` +
          `points=${points.length} sourceType=course_material`,
        );
      } catch (e: any) {
        // Indexing failure leaves indexed_at=null so the UI shows "not indexed".
        // The teacher must delete and re-upload to retry.
        console.error(
          `[QDRANT] index failed: materialId=${materialId} courseId=${courseId} ` +
          `error=${e?.message ?? String(e)}`,
        );
      }
    } else {
      console.warn(
        `[COURSE-MATERIAL] PDF text empty — Qdrant indexing skipped. ` +
        `materialId=${materialId} courseId=${courseId} file="${originalName}"`,
      );
    }

    return {
      fileUrl: signed.signedUrl,
      material: {
        id: materialId,
        courseId,
        unitType,
        unitIndex,
        filename: originalName,
        storagePath,
        createdAt: row.created_at,
        signedUrl: signed.signedUrl,
        chunks: chunks.length,
        textLength: extractedText.length,
        indexed: chunks.length > 0,
        chunkCount: chunks.length,
      },
    };
  }
}
