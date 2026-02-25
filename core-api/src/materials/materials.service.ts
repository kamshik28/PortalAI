// src/materials/materials.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { embed } from '../lib/openaiEmbeddings';
import {
  ensureCollectionExists,
  makePointId,
  upsertPoints,
} from '../lib/qdrant';

// pdf-parse (як у тебе)
import pdfParse from 'pdf-parse';

export type UnitType = 'lecture' | 'lab';

export type UploadMaterialInput = {
  courseId: string;
  unitType: UnitType;
  unitIndex: number;
  file: Express.Multer.File;
};

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'portal-materials';

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
  async uploadMaterial(input: UploadMaterialInput) {
    const { courseId, unitType, unitIndex, file } = input;

    if (!file?.buffer?.length) throw new BadRequestException('Empty file');

    // 1) Extract text from PDF
    let extractedText = '';
    try {
      const parsed: any = await pdfParse(file.buffer);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      extractedText = String(parsed?.text ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: any) {
      extractedText = '';
    }

    // 2) Upload PDF to Supabase Storage
    const fileId = randomUUID();
    const originalName = file.originalname || 'material.pdf';

    const safeName = originalName.replace(/[^\w.-]+/g, '_').slice(0, 120);

    const storagePath = `${courseId}/${unitType}/${unitIndex}/${fileId}_${safeName}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, file.buffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (upErr) {
      throw new BadRequestException(`Supabase upload failed: ${upErr.message}`);
    }

    // 3) Signed URL
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 60);

    if (signErr || !signed?.signedUrl) {
      throw new BadRequestException(
        `Supabase signed url failed: ${signErr?.message ?? 'unknown'}`,
      );
    }

    // 4) Save record in DB (під твою таблицю: original_name, mime_type)
    const materialId = randomUUID();

    const row: any = {
      id: materialId,
      course_id: courseId,
      unit_type: unitType,
      unit_index: unitIndex,
      original_name: originalName,
      storage_path: storagePath,
      mime_type: file.mimetype || 'application/pdf',
      created_at: new Date().toISOString(),
      // якщо в тебе нема колонки extracted_text — НЕ пхаємо її
      // extracted_text: extractedText,
    };

    const { error: dbErr } = await supabaseAdmin.from('materials').insert(row);

    if (dbErr) {
      await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
      throw new BadRequestException(`DB insert failed: ${dbErr.message}`);
    }

    // 5) Index into Qdrant (реально додає POINTS)
    // якщо текст пустий (скан) — можна пропустити, але тоді пошук нічого не знайде
    const chunks = chunkText(extractedText);

    if (chunks.length) {
      try {
        await ensureCollectionExists();

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const vectors = await embed(chunks);

        const points = chunks.map((chunk, idx) => ({
          id: makePointId(),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
          vector: vectors[idx],
          payload: {
            materialId,
            courseId,
            unitType,
            unitIndex,
            storagePath,
            originalName,
            chunkIndex: idx,
            text: chunk,
          },
        }));

        await upsertPoints(points);

        console.log(
          `[QDRANT] upsert ok: material=${materialId}, points=${points.length}`,
        );
      } catch (e: any) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        console.error('[QDRANT] index failed:', e?.message ?? e);
        // Я навмисно НЕ валю upload, щоб PDF не “втратився”
        // але ти побачиш в логах, що індексація не пройшла
      }
    } else {
      console.warn(
        `[PDF] extracted text empty, skipping qdrant index. material=${materialId}`,
      );
    }

    return {
      fileUrl: signed.signedUrl, // щоб фронт не страждав
      material: {
        id: materialId,
        courseId,
        unitType,
        unitIndex,
        originalName,
        storagePath,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
        createdAt: row.created_at,
        signedUrl: signed.signedUrl,
        chunks: chunks.length,
        textLength: extractedText.length,
      },
    };
  }
}
