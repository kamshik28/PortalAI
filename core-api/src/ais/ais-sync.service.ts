import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import pdfParse from 'pdf-parse';
import { PrismaService } from '../prisma/prisma.service';
import { AisClientService } from './ais-client.service';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { embed } from '../lib/openaiEmbeddings';
import {
  deletePointsByFilter,
  ensureCollectionExists,
  makeStablePointId,
  upsertPoints,
} from '../lib/qdrant';
import { encryptCookie, decryptCookie } from '../lib/cookieCrypto';

type SyncResponse = {
  success: boolean;
  message: string;
};

type AisSubjectRow = {
  id: string;
  userId: string;
  aisSubjectId: string;
  code: string;
  name: string | null;
  sourceUrl: string | null;
  chatCourseId: string | null;
  semesterFolderId: string | null;
  semesterLabel: string | null;
  lastSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type AisDocumentRow = {
  id: string;
  userId: string;
  subjectId: string;
  externalDocId: string | null;
  filename: string;
  sourceUrl: string;
  storagePath: string | null;
  mimeType: string | null;
  textExtracted: boolean;
  contentHash: string | null;
  indexedAt: Date | null;
  qdrantVersion: number | null;
  syncStatus: string | null;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'portal-materials';
const AIS_QDRANT_VERSION = 6;

/**
 * Returns the current semester label as it appears in AIS, e.g. "LS 2025/2026".
 * Slovak academic calendar:
 *   ZS (Zimný / Winter): September – January
 *   LS (Letný / Summer): February – August
 */
export function getCurrentSemesterLabel(): string {
  const now = new Date();
  const month = now.getMonth() + 1; // 1–12
  const year = now.getFullYear();

  if (month >= 9) {
    // Sep–Dec → ZS year/year+1
    return `ZS ${year}/${year + 1}`;
  }
  if (month === 1) {
    // January → ZS (year-1)/year
    return `ZS ${year - 1}/${year}`;
  }
  // Feb–Aug → LS (year-1)/year
  return `LS ${year - 1}/${year}`;
}

function toDbSafeText(value: string | null | undefined): string | null {
  if (value == null) return null;

  const normalized = String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || null;
}

/**
 * Converts any filename into a Supabase-safe ASCII storage slug.
 *
 * Rules applied in order:
 *  1. Decompose Unicode → strip combining diacritical marks (á→a, č→c, š→s…)
 *  2. Drop every character that is not ASCII letter / digit / dot / dash / underscore
 *  3. Collapse runs of underscores/dashes to a single dash
 *  4. Strip leading/trailing dashes or underscores
 *  5. Collapse repeated dots (e.g. "01.." → "01.")
 *  6. Remove a lone trailing dot before the extension
 *  7. Lowercase the whole thing
 *  8. Cap at 120 chars (leaves room for the externalDocId prefix)
 *
 * Real failing examples and their safe equivalents:
 *   "PSS - prednáška 01 18.09."        → "pss-prednasky-01-18.09"
 *   "PSS - cvičenia 01 19.09. - príklady" → "pss-cvicenia-01-19.09-priklady"
 *   "PSS - prezentácia DoTest.sk"       → "pss-prezentacia-dotest.sk"
 *   "PSS - prednáška 05 23.10. (!)"     → "pss-prednasky-05-23.10"
 */
function toStorageSlug(name: string): string {
  return (
    name
      // 1. Strip diacritics: decompose then remove combining marks
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // 2. Replace anything that is not a-z A-Z 0-9 . - _ with a dash
      .replace(/[^a-zA-Z0-9.\-_]/g, '-')
      // 3. Collapse consecutive dashes/underscores
      .replace(/[-_]{2,}/g, '-')
      // 4. Strip leading/trailing dashes
      .replace(/^[-_]+|[-_]+$/g, '')
      // 5. Collapse repeated dots
      .replace(/\.{2,}/g, '.')
      // 6. Remove a trailing dot (e.g. "18.09." → "18.09", ".pdf" preserved later)
      .replace(/\.$/, '')
      // 7. Lowercase
      .toLowerCase()
      // 8. Cap length
      .slice(0, 120) || 'document'
  );
}

function ensurePdfExtension(name: string): string {
  return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
}

function chunkText(text: string, chunkSize = 1200, overlap = 200): string[] {
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

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

@Injectable()
export class AisSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aisClientService: AisClientService,
  ) {}

  private async requireActiveSession(userId: string) {
    const session = await this.prisma.aisSession.findUnique({
      where: { userId },
    });

    if (!session || !session.isActive) {
      throw new BadRequestException('AIS session not connected');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Decrypt the AIS cookie before use.  If decryption fails the session
    // must be considered invalid (e.g. key rotation or corrupted data).
    let rawCookie: string;
    try {
      rawCookie = decryptCookie(session.uisAuthCookie);
    } catch {
      await this.prisma.aisSession.update({
        where: { userId },
        data: { isActive: false },
      });
      throw new BadRequestException(
        'AIS session is no longer usable. Please reconnect to AIS.',
      );
    }

    // Return a session-like object with the decrypted cookie so callers don't
    // need to decrypt themselves.
    return { session: { ...session, uisAuthCookie: rawCookie }, user };
  }

  async helperLoginAndSaveSession(userId: string): Promise<SyncResponse> {
    // The helper-login endpoint launches a real browser via Playwright.
    // This is only safe in a local development environment.
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException(
        'Helper login is not available in production. ' +
          'Paste your UISAuth cookie manually via the Connect flow.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    let browser: any = null;

    try {
      const playwright = await (
        Function('return import("playwright")')() as Promise<any>
      ).catch(() => null);

      if (!playwright?.chromium) {
        throw new BadRequestException(
          'Playwright is not available. Use manual UISAuth connect.',
        );
      }

      browser = await playwright.chromium.launch({
        headless: false,
      });

      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto('https://is.stuba.sk/system/login.pl?lang=sk', {
        waitUntil: 'domcontentloaded',
      });

      const startedAt = Date.now();
      const timeoutMs = 180000;
      let cookieValue: string | null = null;

      while (Date.now() - startedAt < timeoutMs) {
        await page.waitForTimeout(1500);

        const cookies = await context.cookies();
        const sessionCookie = cookies.find(
          (c: any) => c?.name === 'UISAuth' && c?.value,
        );

        if (!sessionCookie?.value) {
          continue;
        }

        const currentUrl = typeof page.url === 'function' ? page.url() : '';
        const html = await page.content().catch(() => '');

        if (
          currentUrl.includes('/auth/') ||
          html.includes('Prihlásený:') ||
          html.includes('Odhlásenie')
        ) {
          cookieValue = String(sessionCookie.value);
          break;
        }
      }

      if (!cookieValue) {
        throw new BadRequestException('AIS login was not completed in time');
      }

      // Validate the captured cookie against a live AIS request BEFORE saving
      // to DB.  This catches cases where the cookie was grabbed too early
      // (pre-auth session token) or is otherwise not usable for server-side
      // HTTP calls.
      let validationHtml: string;
      try {
        validationHtml =
          await this.aisClientService.getDocumentServerIndexHtml(cookieValue);
      } catch {
        throw new BadRequestException(
          'UISAuth cookie bolo zachytené, ale AIS neodpovedal na overovací požiadavok. Skús sa prihlásiť znova.',
        );
      }

      const cookieIsValid =
        validationHtml.includes('Dokumentový server') ||
        validationHtml.includes('Prihlásený:') ||
        validationHtml.includes('Odhlásenie');

      if (!cookieIsValid) {
        throw new BadRequestException(
          'Prihlásenie do AIS nebolo dokončené — overenie zlyhalo. ' +
            'Uisti sa, že si klikol na prihlásenie a počkaj, kým sa AIS načíta.',
        );
      }

      const encryptedCookie = encryptCookie(cookieValue);

      await this.prisma.aisSession.upsert({
        where: { userId },
        update: {
          uisAuthCookie: encryptedCookie,
          isActive: true,
        },
        create: {
          userId,
          uisAuthCookie: encryptedCookie,
          isActive: true,
        },
      });

      return {
        success: true,
        message: 'AIS session uložená. Teraz klikni na "Obnoviť predmety".',
      };
    } finally {
      if (browser) {
        await browser.close().catch(() => undefined);
      }
    }
  }

  async helperLogin(userId: string): Promise<SyncResponse> {
    return this.helperLoginAndSaveSession(userId);
  }

  async syncUserAis(
    userId: string,
    semesterId?: string,
    semesterLabel?: string,
  ): Promise<SyncResponse> {
    const { session } = await this.requireActiveSession(userId);

    // Resolve semester folder ID.
    // Priority: caller-supplied semesterId → env override → dynamic discovery.
    let semesterFolderId =
      semesterId ?? (process.env.AIS_SEMESTER_FOLDER_ID ?? '');

    // Resolve human-readable label (used to tag subjects in the DB).
    let resolvedSemesterLabel = semesterLabel ?? '';

    if (!semesterFolderId) {
      const autoLabel = getCurrentSemesterLabel();
      resolvedSemesterLabel = resolvedSemesterLabel || autoLabel;
      console.log('AIS DYNAMIC SEMESTER LABEL:', autoLabel);

      const indexHtml = await this.aisClientService.getDocumentServerIndexHtml(
        session.uisAuthCookie,
      );

      // Step 1: Verify the session is actually valid before searching for
      // the semester.  An expired/invalid cookie causes AIS to redirect to
      // the login page (302 → 200 login HTML) which contains none of these
      // markers.  Distinguishing this from a "semester label not found" case
      // is critical for giving the user the right error message.
      const indexSessionValid =
        indexHtml.includes('Dokumentový server') ||
        indexHtml.includes('Prihlásený:') ||
        indexHtml.includes('Odhlásenie');

      if (!indexSessionValid) {
        // Mark session inactive so the UI status reflects reality.
        await this.prisma.aisSession.update({
          where: { userId },
          data: { isActive: false },
        });
        throw new BadRequestException(
          'AIS session vypršala alebo je neplatná. Prihlás sa znova do AIS.',
        );
      }

      // Step 2: Prefer to search within the Courses branch so we don't
      // accidentally match a semester folder from an unrelated AIS branch.
      const coursesBranchId =
        this.aisClientService.findCoursesBranchFolderId(indexHtml);

      let semestersHtml = indexHtml;
      if (coursesBranchId) {
        try {
          semestersHtml = await this.aisClientService.getFolderHtmlById(
            session.uisAuthCookie,
            coursesBranchId,
          );
        } catch {
          semestersHtml = indexHtml;
        }
      }

// 1. Try parsing semesters from the Courses/Predmety branch page
      let parsedSemesters =
        this.aisClientService.parseAvailableSemesters(semestersHtml);

// 2. Fallback: if that page produced 0 semesters, use the main index page
      if (parsedSemesters.length === 0) {
        console.warn(
          'AIS SEMESTERS: courses branch page returned 0 semesters, falling back to index page',
        );
        parsedSemesters =
          this.aisClientService.parseAvailableSemesters(indexHtml);
      }

      console.log(
        'AIS PARSED SEMESTERS:',
        parsedSemesters.map((s) => `${s.label} -> ${s.id}`),
      );

// 3. Keep only relevant semesters for the current academic year
      const relevantSemesters = this.aisClientService.filterRelevantSemesters(
        parsedSemesters,
        autoLabel,
      );

      console.log(
        'AIS RELEVANT SEMESTERS:',
        relevantSemesters.map((s) => `${s.label} -> ${s.id}`),
      );

// 4. Prefer exact current-semester match, then fallback sensibly
      const discoveredSemester =
        relevantSemesters.find(
          (s) => s.label.toLowerCase() === autoLabel.toLowerCase(),
        ) ??
        relevantSemesters[0] ??
        parsedSemesters.find(
          (s) => s.label.toLowerCase() === autoLabel.toLowerCase(),
        ) ??
        parsedSemesters.find((s) =>
          s.label.toLowerCase().includes(autoLabel.toLowerCase()),
        ) ??
        null;

      if (!discoveredSemester) {
        throw new BadRequestException(
          `Semester "${autoLabel}" nebol nájdený na AIS dokumentovom serveri.`,
        );
      }

      semesterFolderId = discoveredSemester.id;
      resolvedSemesterLabel = discoveredSemester.label;

      console.log(
        `AIS SEMESTER FOLDER DISCOVERED: ${resolvedSemesterLabel} -> id=${semesterFolderId}`,
      );
    } else {
      // Folder ID supplied by caller.  If no label was given, fall back to
      // the computed current-semester label as a best guess.
      if (!resolvedSemesterLabel) {
        resolvedSemesterLabel = getCurrentSemesterLabel();
      }
      console.log('AIS SEMESTER FOLDER ID (supplied):', semesterFolderId);
    }

    const html = await this.aisClientService.getFolderHtmlById(
      session.uisAuthCookie,
      semesterFolderId,
      0,
    );

    const htmlLooksValid = html.includes('Dokumentový server');

    if (!htmlLooksValid) {
      throw new BadRequestException(
        'Semester subjects folder page was not loaded correctly. Check AIS session.',
      );
    }

    const parsedSubjects =
      this.aisClientService.parseSubjectFoldersFromSemesterFolderHtml(html);

    console.log(
      'AIS DISCOVERED SEMESTER SUBJECTS COUNT:',
      parsedSubjects.length,
    );

    const validAisSubjectIds = new Set(
      parsedSubjects.map((subject) => subject.aisSubjectId),
    );

    for (const subject of parsedSubjects) {
      await this.prisma.aisSubject.upsert({
        where: {
          userId_aisSubjectId: {
            userId,
            aisSubjectId: subject.aisSubjectId,
          },
        },
        update: {
          code: toDbSafeText(subject.code) ?? `AIS_${subject.aisSubjectId}`,
          name: toDbSafeText(subject.name),
          sourceUrl: subject.sourceUrl,
          // Always refresh semester tagging so a re-discovery of the same
          // AIS subject in a different semester updates the label correctly.
          semesterFolderId,
          semesterLabel: resolvedSemesterLabel || null,
          lastSyncAt: new Date(),
        },
        create: {
          userId,
          aisSubjectId: subject.aisSubjectId,
          code: toDbSafeText(subject.code) ?? `AIS_${subject.aisSubjectId}`,
          name: toDbSafeText(subject.name),
          sourceUrl: subject.sourceUrl,
          semesterFolderId,
          semesterLabel: resolvedSemesterLabel || null,
          lastSyncAt: new Date(),
          chatCourseId: randomUUID(),
        },
      });
    }

    // ── Clean up stale subjects from THIS semester only ─────────────────
    // We must NOT touch subjects from other semesters — their aisSubjectIds
    // are entirely different AIS folder IDs and are irrelevant here.
    const existingSubjectsForSemester = await this.prisma.aisSubject.findMany({
      where: { userId, semesterFolderId },
      include: {
        _count: {
          select: {
            documents: true,
          },
        },
      },
    });

    const subjectIdsToDelete = existingSubjectsForSemester
      .filter(
        (subject) =>
          !validAisSubjectIds.has(subject.aisSubjectId) &&
          subject._count.documents === 0,
      )
      .map((subject) => subject.id);

    if (subjectIdsToDelete.length > 0) {
      await this.prisma.aisSubject.deleteMany({
        where: {
          id: {
            in: subjectIdsToDelete,
          },
        },
      });

      console.log('AIS CLEANUP REMOVED SUBJECTS:', subjectIdsToDelete.length);
    }

    await this.prisma.aisSession.update({
      where: { userId },
      data: { lastSyncAt: new Date() },
    });

    return {
      success: true,
      message:
        `AIS semester discover done. Semester: ${resolvedSemesterLabel || semesterFolderId}. ` +
        `Subjects found: ${parsedSubjects.length}. Removed old empty subjects: ${subjectIdsToDelete.length}`,
    };
  }

  async syncSubject(userId: string, subjectId: string): Promise<SyncResponse> {
    return this.syncSubjectDocuments(userId, subjectId);
  }

  async syncSubjectDocuments(
    userId: string,
    subjectId: string,
  ): Promise<SyncResponse> {
    const { session } = await this.requireActiveSession(userId);

    const subject = (await this.prisma.aisSubject.findFirst({
      where: { id: subjectId, userId },
    })) as AisSubjectRow | null;

    if (!subject) {
      throw new NotFoundException('Subject not found');
    }

    // Ensure the subject has a stable chatCourseId (UUID) for Flowise routing.
    let finalChatCourseId = subject.chatCourseId;
    if (!finalChatCourseId) {
      const patched = await this.prisma.aisSubject.update({
        where: { id: subject.id },
        data: { chatCourseId: randomUUID() },
      });
      finalChatCourseId = patched.chatCourseId;
    }
    finalChatCourseId = finalChatCourseId ?? `ais_${subject.id}`;

    // ── 1. Fetch document list from AIS ────────────────────────────────────
    const firstPageHtml = await this.aisClientService.getFolderHtmlById(
      session.uisAuthCookie,
      subject.aisSubjectId,
      0,
    );

    const pageIndexes = this.aisClientService.parseFolderPageIndexes(
      firstPageHtml,
      subject.aisSubjectId,
    );
    console.log(`AIS SUBJECT ${subject.code} PAGES:`, pageIndexes);

    const allDocsMap = new Map<
      string,
      {
        externalDocId: string;
        filename: string;
        sourceUrl: string;
        enteredBy: string | null;
        documentDate: string | null;
      }
    >();

    for (const pageOn of pageIndexes) {
      const pageHtml =
        pageOn === 0
          ? firstPageHtml
          : await this.aisClientService.getFolderHtmlById(
              session.uisAuthCookie,
              subject.aisSubjectId,
              pageOn,
            );

      const parsedDocuments = this.aisClientService.parseDocumentsFromFolderHtml(
        pageHtml,
        subject.aisSubjectId,
      );
      console.log(`AIS ${subject.code} page=${pageOn} docs=${parsedDocuments.length}`);
      for (const doc of parsedDocuments) {
        allDocsMap.set(doc.externalDocId, doc);
      }
    }

    const allDocuments = Array.from(allDocsMap.values());
    console.log(`AIS ${subject.code} total docs from AIS: ${allDocuments.length}`);

    // ── 2. Full replace: wipe old DB rows and Qdrant vectors ───────────────
    //
    // This is the single source of truth for "no duplicates":
    //   • Every sync starts from a blank slate for this subject.
    //   • AIS is authoritative; the local state is a pure mirror.
    //   • Running sync twice produces exactly the same result.
    //   • Documents removed from AIS disappear locally after the next sync.

    const deletedRows = await this.prisma.aisDocument.deleteMany({
      where: { subjectId: subject.id, userId },
    });
    console.log(
      `[AIS-SYNC] ${subject.code}: deleted ${deletedRows.count} old DB document rows`,
    );

    // ensureCollectionExists is also called at startup (AppService.onModuleInit)
    // but kept here as a safety net.
    await ensureCollectionExists();

    // Wipe all Qdrant vectors for this subject before re-indexing.
    // The filter uses THREE fields — sourceType + userId + subjectId — so it
    // is strictly scoped and never touches vectors belonging to:
    //   • other users (different userId)
    //   • other subjects of the same user (different subjectId)
    //   • course material vectors (different sourceType)
    // Note: qdrantVersion is NOT used in the filter — we wipe all versions
    // so bumping AIS_QDRANT_VERSION never leaves orphan points.
    console.log(
      `[QDRANT] wiping AIS vectors: ` +
      `sourceType=ais userId=*** subjectId=${subject.id} code=${subject.code}`,
    );
    await deletePointsByFilter({
      must: [
        { key: 'sourceType', match: { value: 'ais' } },
        { key: 'userId',     match: { value: userId } },
        { key: 'subjectId',  match: { value: subject.id } },
      ],
    });

    // ── 3. Pre-create stub DB records for every discovered doc ───────────────
    // This ensures failed docs are always visible in the UI, even if download
    // or upload fails later. syncStatus starts as 'discovered' and is updated
    // at each processing stage.
    const stubMap = new Map<string, string>(); // externalDocId → DB record id
    for (const doc of allDocuments) {
      const dbSafeFilename =
        toDbSafeText(doc.filename) ?? `AIS document ${doc.externalDocId}`;
      const stub = await this.prisma.aisDocument.create({
        data: {
          userId,
          subjectId: subject.id,
          externalDocId: doc.externalDocId,
          filename: dbSafeFilename,
          sourceUrl: doc.sourceUrl,
          textExtracted: false,
          syncStatus: 'discovered',
          lastSeenAt: new Date(),
        },
      });
      stubMap.set(doc.externalDocId, stub.id);
    }

    // ── 4. Download, store, parse and index each document ─────────────────
    let indexedCount = 0;
    let noTextCount = 0;
    let parseFailedCount = 0;
    let unsupportedCount = 0;
    let indexFailedCount = 0;
    let failedCount = 0; // download / upload failures (thrown exceptions)

    for (const doc of allDocuments) {
      const preCreatedDocId = stubMap.get(doc.externalDocId)!;
      try {
        const outcome = await this.syncOneDocument({
          doc,
          userId,
          subject,
          finalChatCourseId,
          uisAuthCookie: session.uisAuthCookie,
          preCreatedDocId,
        });
        if (outcome === 'indexed') indexedCount++;
        else if (outcome === 'no_text') noTextCount++;
        else if (outcome === 'parse_failed') parseFailedCount++;
        else if (outcome === 'unsupported') unsupportedCount++;
        else if (outcome === 'failed_indexing') indexFailedCount++;
      } catch (e) {
        failedCount++;
        // Mark the pre-created stub as failed_upload so it stays visible.
        try {
          await this.prisma.aisDocument.update({
            where: { id: preCreatedDocId },
            data: { syncStatus: 'failed_upload' },
          });
        } catch { /* ignore — stub update failure is not critical */ }
        console.error(
          `AIS DOC FAILED (continuing): id=${doc.externalDocId} ` +
            `file="${doc.filename}" url=${doc.sourceUrl}`,
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    console.log(
      `[AIS-SYNC] done: ${subject.code} subjectId=${subject.id} — ` +
        `total=${allDocuments.length} indexed=${indexedCount} ` +
        `no_text=${noTextCount} parse_failed=${parseFailedCount} ` +
        `unsupported=${unsupportedCount} index_failed=${indexFailedCount} ` +
        `failed=${failedCount}`,
    );

    // ── 5. Persist sync metadata ───────────────────────────────────────────
    await this.prisma.aisSubject.update({
      where: { id: subject.id },
      data: { lastSyncAt: new Date() },
    });

    await this.prisma.aisSession.update({
      where: { userId },
      data: { lastSyncAt: new Date(), activeAisSubjectId: subject.id },
    });

    const parts: string[] = [
      `Predmet: ${subject.code}`,
      `Z AIS: ${allDocuments.length} dok.`,
      `Zaindexovaných: ${indexedCount}`,
    ];
    if (noTextCount > 0) parts.push(`Naskenovaných (bez textu): ${noTextCount}`);
    if (parseFailedCount > 0) parts.push(`Chyba parsingu: ${parseFailedCount}`);
    if (unsupportedCount > 0) parts.push(`Nepodporovaný formát: ${unsupportedCount}`);
    if (indexFailedCount > 0) parts.push(`Chyba indexovania: ${indexFailedCount}`);
    if (failedCount > 0) parts.push(`Chyba sťahovania/uploadu: ${failedCount}`);

    return {
      success: true,
      message: `Sync dokončený. ${parts.join('. ')}.`,
    };
  }

  // ─── Per-document sync ────────────────────────────────────────────────────
  // Takes a pre-created stub record ID (preCreatedDocId) so even failed docs
  // remain visible in the DB with their final syncStatus.
  // THROWS only when download or Supabase upload fails — caller marks the stub
  // as 'failed_upload' and increments failedCount.

  private async syncOneDocument(args: {
    doc: {
      externalDocId: string;
      filename: string;
      sourceUrl: string;
      enteredBy: string | null;
      documentDate: string | null;
    };
    userId: string;
    subject: AisSubjectRow;
    finalChatCourseId: string;
    uisAuthCookie: string;
    preCreatedDocId: string;
  }): Promise<'indexed' | 'no_text' | 'unsupported' | 'parse_failed' | 'failed_indexing'> {
    const { doc, userId, subject, finalChatCourseId, uisAuthCookie, preCreatedDocId } = args;

    const dbSafeFilename =
      toDbSafeText(doc.filename) ?? `AIS document ${doc.externalDocId}`;

    // ── Step 1: Download from AIS ─────────────────────────────────────────
    // Errors here are intentionally NOT caught — they propagate to the outer
    // loop which marks the stub as 'failed_upload'.
    console.log(`AIS DOWNLOAD: "${doc.filename}" — ${doc.sourceUrl}`);

    const downloaded = await this.aisClientService.downloadDocument(
      uisAuthCookie,
      doc.sourceUrl,
    );

    const fileBuffer = downloaded.buffer;
    const detectedMimeType = downloaded.contentType ?? null;
    const contentHash = sha256(downloaded.buffer);

    const slug = toStorageSlug(doc.filename || `ais_document_${doc.externalDocId}`);
    const likelyPdf =
      !detectedMimeType ||
      detectedMimeType.includes('pdf') ||
      detectedMimeType.includes('octet-stream');
    const safeFileName = likelyPdf ? ensurePdfExtension(slug) : slug;

    const storagePath = [
      'ais',
      userId,
      subject.aisSubjectId,
      `${doc.externalDocId}_${safeFileName}`,
    ].join('/');

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: detectedMimeType ?? undefined,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(
        `Supabase upload failed for "${doc.filename}": ${uploadError.message}`,
      );
    }

    console.log(`AIS STORED: "${doc.filename}" → ${storagePath}`);

    // ── Step 2: Update stub with upload info ──────────────────────────────
    await this.prisma.aisDocument.update({
      where: { id: preCreatedDocId },
      data: {
        storagePath,
        mimeType: detectedMimeType,
        contentHash,
        syncStatus: 'uploaded',
        lastSeenAt: new Date(),
      },
    });

    // ── Step 3: Check MIME type support ───────────────────────────────────
    const mightBePdf =
      !detectedMimeType ||
      detectedMimeType.includes('pdf') ||
      detectedMimeType.includes('octet-stream');

    if (!mightBePdf) {
      console.warn(`AIS SKIP non-PDF (${detectedMimeType}): "${doc.filename}"`);
      await this.prisma.aisDocument.update({
        where: { id: preCreatedDocId },
        data: { syncStatus: 'unsupported' },
      });
      return 'unsupported';
    }

    // ── Step 4: Parse PDF ─────────────────────────────────────────────────
    let chunks: string[] = [];
    try {
      const parsed = await pdfParse(fileBuffer);
      const extractedText = String(parsed?.text ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      chunks = chunkText(extractedText);
    } catch (parseErr) {
      console.error(
        `AIS PARSE FAILED: "${doc.filename}" — ` +
          (parseErr instanceof Error ? parseErr.message : String(parseErr)),
      );
      await this.prisma.aisDocument.update({
        where: { id: preCreatedDocId },
        data: { textExtracted: false, syncStatus: 'failed_extraction' },
      });
      return 'parse_failed';
    }

    if (chunks.length === 0) {
      console.warn(
        `AIS PDF NO TEXT: "${doc.filename}" — stored but not indexable`,
      );
      await this.prisma.aisDocument.update({
        where: { id: preCreatedDocId },
        data: { textExtracted: true, syncStatus: 'no_text' },
      });
      return 'no_text';
    }

    // ── Step 5: Embed and index into Qdrant ───────────────────────────────
    console.log(
      `[AIS-SYNC] embedding: "${dbSafeFilename}" ` +
      `chunks=${chunks.length} subjectId=${subject.id}`,
    );
    try {
      const vectors = await embed(chunks);

      const points = chunks.map((chunk, idx) => {
        const sourceLabel = [subject.code, dbSafeFilename]
          .filter(Boolean)
          .join(' — ')
          .concat(` [chunk ${idx + 1}]`);

        return {
          // Stable point ID — re-syncing produces identical IDs for identical
          // (userId, subjectId, externalDocId, sourceUrl, version, chunkIdx).
          // The full-wipe before every sync means stale IDs are always cleaned
          // up, so the version bump in the seed is informational only.
          id: makeStablePointId([
            'ais',
            userId,
            subject.id,
            doc.externalDocId,
            doc.sourceUrl,
            AIS_QDRANT_VERSION,
            idx,
          ]),
          vector: vectors[idx],
          payload: {
            // Content field (Flowise: contentPayloadKey = "text")
            text: chunk,

            // Top-level filter fields — MUST NOT be nested inside metadata.
            sourceType: 'ais',             // isolates from course_material vectors
            courseId: finalChatCourseId,   // used by Flowise AIS chat filter
            userId,                        // per-user isolation
            subjectId: subject.id,         // per-subject isolation
            qdrantVersion: AIS_QDRANT_VERSION,

            // Citation / display metadata (not used in filters)
            metadata: {
              source: sourceLabel,
              filename: dbSafeFilename,
              subjectCode: subject.code,
              subjectName: subject.name ?? null,
              chunkIndex: idx,
            },
          },
        };
      });

      await upsertPoints(points);

      await this.prisma.aisDocument.update({
        where: { id: preCreatedDocId },
        data: {
          textExtracted: true,
          indexedAt: new Date(),
          qdrantVersion: AIS_QDRANT_VERSION,
          syncStatus: 'indexed',
          lastSeenAt: new Date(),
        },
      });

      console.log(
        `[QDRANT] upsert ok: "${dbSafeFilename}" ` +
        `points=${points.length} sourceType=ais ` +
        `userId=*** subjectId=${subject.id}`,
      );
      return 'indexed';
    } catch (indexErr) {
      // indexedAt is NOT set — the document shows as "not indexed" in the UI.
      // The next re-sync will retry (full wipe + re-index).
      console.error(
        `[QDRANT] index failed: "${doc.filename}" — ` +
          (indexErr instanceof Error ? indexErr.message : String(indexErr)),
      );
      await this.prisma.aisDocument.update({
        where: { id: preCreatedDocId },
        data: { textExtracted: true, syncStatus: 'failed_indexing' },
      });
      return 'failed_indexing';
    }
  }
}
