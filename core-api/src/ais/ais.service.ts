import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AisSyncService, getCurrentSemesterLabel } from './ais-sync.service';
import { AisClientService } from './ais-client.service';
import { embed } from '../lib/openaiEmbeddings';
import { openaiChat } from '../lib/openaiChat';
import { searchPoints, QdrantScoredPoint } from '../lib/qdrant';
import { encryptCookie, decryptCookie } from '../lib/cookieCrypto';

type ConnectResponse = {
  success: true;
  session: {
    id: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
};

type GenericResponse = {
  success: boolean;
  message: string;
};

type SemestersResponse = {
  semesters: Array<{ id: string; label: string }>;
  currentLabel: string;
  currentSemesterId: string | null;
};

type StatusResponse = {
  connected: boolean;
  lastSyncAt: Date | null;
  subjectsCount: number;
  documentsCount: number;
};

type SubjectListResponse = {
  subjects: Array<{
    id: string;
    aisSubjectId: string;
    code: string;
    name: string | null;
    sourceUrl: string | null;
    chatCourseId: string;
    semesterFolderId: string | null;
    semesterLabel: string | null;
    lastSyncAt: Date | null;
    documentsCount: number;
  }>;
};

type DocumentListResponse = {
  subject: {
    id: string;
    code: string;
    name: string | null;
    chatCourseId: string;
  };
  documents: Array<{
    id: string;
    filename: string;
    storagePath: string | null;
    mimeType: string | null;
    textExtracted: boolean;
    indexedAt: Date | null;
    syncStatus: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

type ActiveSubjectResponse = {
  activeSubject: {
    id: string;
    code: string;
    name: string | null;
    chatCourseId: string;
    lastSyncAt: Date | null;
    documentsCount: number;
  } | null;
};

type SearchChunksResponse = {
  subject: {
    id: string;
    code: string;
    name: string | null;
    chatCourseId: string;
  };
  query: string;
  topK: number;
  matches: Array<{
    id: string;
    score: number;
    filename: string | null;
    text: string;
    chunkIndex: number | null;
    sourceUrl: string | null;
  }>;
  contextText: string;
};

// ── Quiz types ─────────────────────────────────────────────────────────────

type QuizQuestionInternal = {
  id: number;
  type: 'mcq' | 'open';
  question: string;
  // MCQ
  options?: { A: string; B: string; C: string; D: string };
  answer?: string;
  // Open
  modelAnswer?: string;
  // Common
  explanation?: string;
  source?: string;
};

type GenerateQuizResponse = {
  quizId: string;
  subject: { code: string; name: string | null };
  questions: QuizQuestionInternal[];
  meta: {
    indexedDocCount: number;
    retrievedChunks: number;
    sourceFiles: string[];
  };
};

type EvaluateOpenResponse = {
  status: 'correct' | 'partially_correct' | 'incorrect';
  score: 0 | 0.5 | 1;
  feedback: string;
  matchedConcepts: string[];
  missingConcepts: string[];
};

type AisSubjectWithCount = {
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
  _count: {
    documents: number;
  };
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


@Injectable()
export class AisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aisSyncService: AisSyncService,
    private readonly aisClientService: AisClientService,
  ) {}

  async connect(
    userId: string,
    uisAuthCookie: string,
  ): Promise<ConnectResponse> {
    const cookie = String(uisAuthCookie || '').trim();

    if (!cookie) {
      throw new BadRequestException('uisAuthCookie is required');
    }

    // Verify the cookie resolves to an active AIS session before persisting it.
    try {
      const html =
        await this.aisClientService.getDocumentServerIndexHtml(cookie);
      const looksValid =
        html.includes('Prihlásený:') ||
        html.includes('Odhlásenie') ||
        html.includes('Dokumentový server');
      if (!looksValid) {
        throw new BadRequestException(
          'UISAuth cookie je neplatný alebo vypršal. Skopíruj novú hodnotu z prehliadača.',
        );
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException(
        'Nepodarilo sa overiť AIS session. Skontroluj hodnotu UISAuth cookie.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const encryptedCookie = encryptCookie(cookie);

    const session = await this.prisma.aisSession.upsert({
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
      session: {
        id: session.id,
        isActive: session.isActive,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
    };
  }

  async helperLogin(userId: string): Promise<GenericResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.aisSyncService.helperLoginAndSaveSession(userId);
  }

  async sync(
    userId: string,
    semesterId?: string,
    semesterLabel?: string,
  ): Promise<GenericResponse> {
    return this.aisSyncService.syncUserAis(userId, semesterId, semesterLabel);
  }

  async getSemesters(userId: string): Promise<SemestersResponse> {
    const session = await this.prisma.aisSession.findUnique({
      where: { userId },
    });

    if (!session?.isActive || !session.uisAuthCookie) {
      throw new BadRequestException('AIS not connected');
    }

    let rawCookie: string;
    try {
      rawCookie = decryptCookie(session.uisAuthCookie);
    } catch (e) {
      await this.prisma.aisSession.update({
        where: { userId },
        data: { isActive: false },
      });
      throw new BadRequestException(
        'AIS session is no longer usable. Please reconnect to AIS.',
      );
    }

    const indexHtml = await this.aisClientService.getDocumentServerIndexHtml(
      rawCookie,
    );

    const indexValid =
      indexHtml.includes('Dokumentový server') ||
      indexHtml.includes('Prihlásený:') ||
      indexHtml.includes('Odhlásenie');

    if (!indexValid) {
      throw new BadRequestException(
        'AIS session vypršala alebo je neplatná. Prihlás sa znova do AIS.',
      );
    }

    const currentLabel = getCurrentSemesterLabel();

    // 1. Try to restrict discovery to the Courses / Predmety branch
    const coursesBranchId =
      this.aisClientService.findCoursesBranchFolderId(indexHtml);

    let semestersHtml = indexHtml;
    if (coursesBranchId) {
      try {
        semestersHtml = await this.aisClientService.getFolderHtmlById(
          rawCookie,
          coursesBranchId,
        );
      } catch (e) {
        console.warn(
          'AIS SEMESTERS: failed to fetch Courses branch, falling back to index.',
          e instanceof Error ? e.message : String(e),
        );
        semestersHtml = indexHtml;
      }
    }

    // 2. Parse semesters from the branch page
    let parsedSemesters =
      this.aisClientService.parseAvailableSemesters(semestersHtml);

    // 3. Fallback to full index if branch page produced nothing
    if (parsedSemesters.length === 0) {
      console.warn(
        'AIS SEMESTERS: courses branch page returned 0 semesters, falling back to index page',
      );
      parsedSemesters =
        this.aisClientService.parseAvailableSemesters(indexHtml);
    }

    console.log(
      'AIS PARSED SEMESTERS (GET):',
      parsedSemesters.map((s) => `${s.label} -> ${s.id}`),
    );

    // 4. Keep only relevant semesters for current academic year
    let relevantSemesters = this.aisClientService.filterRelevantSemesters(
      parsedSemesters,
      currentLabel,
    );

    // 5. Safety fallback: if filtering removed everything, return parsed semesters
    if (relevantSemesters.length === 0) {
      console.warn(
        `AIS RELEVANT SEMESTERS (GET): 0 after filtering for "${currentLabel}", falling back to parsed semesters`,
      );
      relevantSemesters = parsedSemesters;
    }

    console.log(
      'AIS RELEVANT SEMESTERS (GET):',
      relevantSemesters.map((s) => `${s.label} -> ${s.id}`),
    );

    const currentSemester =
      relevantSemesters.find(
        (s) => s.label.toLowerCase() === currentLabel.toLowerCase(),
      ) ??
      relevantSemesters.find((s) =>
        s.label.toLowerCase().includes(currentLabel.toLowerCase()),
      ) ??
      relevantSemesters[0] ??
      null;

    return {
      semesters: relevantSemesters,
      currentLabel,
      currentSemesterId: currentSemester?.id ?? null,
    };
  }

  async syncSubject(
    userId: string,
    subjectId: string,
  ): Promise<GenericResponse> {
    const subject = await this.prisma.aisSubject.findFirst({
      where: {
        id: subjectId,
        userId,
      },
    });

    if (!subject) {
      throw new NotFoundException('Subject not found');
    }

    return this.aisSyncService.syncSubjectDocuments(userId, subjectId);
  }

  async getStatus(userId: string): Promise<StatusResponse> {
    const session = await this.prisma.aisSession.findUnique({
      where: { userId },
    });

    const subjectsCount = await this.prisma.aisSubject.count({
      where: { userId },
    });

    const documentsCount = await this.prisma.aisDocument.count({
      where: { userId },
    });

    return {
      connected: Boolean(session?.isActive),
      lastSyncAt: session?.lastSyncAt ?? null,
      subjectsCount,
      documentsCount,
    };
  }

  async getSubjects(
    userId: string,
    semesterId?: string,
  ): Promise<SubjectListResponse> {
    // When a semesterId (AIS folder ID) is supplied, restrict to subjects
    // that were discovered under that specific semester folder.  This is
    // the key fix that prevents B-PSS from appearing in every semester view.
    const where: Record<string, unknown> = { userId };
    if (semesterId) {
      where['semesterFolderId'] = semesterId;
    }

    const subjects = (await this.prisma.aisSubject.findMany({
      where,
      orderBy: { code: 'asc' },
      include: {
        _count: {
          select: { documents: true },
        },
      },
    })) as AisSubjectWithCount[];

    return {
      subjects: subjects.map((s) => ({
        id: s.id,
        aisSubjectId: s.aisSubjectId,
        code: s.code,
        name: s.name ?? null,
        sourceUrl: s.sourceUrl ?? null,
        chatCourseId: s.chatCourseId ?? `ais_${s.id}`,
        semesterFolderId: s.semesterFolderId ?? null,
        semesterLabel: s.semesterLabel ?? null,
        lastSyncAt: s.lastSyncAt ?? null,
        documentsCount: s._count.documents,
      })),
    };
  }

  async getDocuments(
    userId: string,
    subjectId: string,
  ): Promise<DocumentListResponse> {
    const subject = (await this.prisma.aisSubject.findFirst({
      where: {
        id: subjectId,
        userId,
      },
    })) as AisSubjectRow | null;

    if (!subject) {
      throw new NotFoundException('Subject not found');
    }

    const documents = await this.prisma.aisDocument.findMany({
      where: { userId, subjectId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      subject: {
        id: subject.id,
        code: subject.code,
        name: subject.name ?? null,
        chatCourseId: subject.chatCourseId ?? `ais_${subject.id}`,
      },
      documents: documents.map((d) => ({
        id: d.id,
        filename: d.filename,
        storagePath: d.storagePath ?? null,
        mimeType: d.mimeType ?? null,
        textExtracted: d.textExtracted,
        indexedAt: d.indexedAt ?? null,
        syncStatus: (d as any).syncStatus ?? null,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
    };
  }

  async getActiveSubject(userId: string): Promise<ActiveSubjectResponse> {
    const session = await this.prisma.aisSession.findUnique({
      where: { userId },
    });

    if (!session?.isActive || !session.activeAisSubjectId) {
      return { activeSubject: null };
    }

    const subject = await this.prisma.aisSubject.findFirst({
      where: {
        id: session.activeAisSubjectId,
        userId,
      },
      include: {
        _count: {
          select: { documents: true },
        },
      },
    });

    if (!subject) {
      return { activeSubject: null };
    }

    return {
      activeSubject: {
        id: subject.id,
        code: subject.code,
        name: subject.name ?? null,
        chatCourseId: subject.chatCourseId ?? `ais_${subject.id}`,
        lastSyncAt: subject.lastSyncAt ?? null,
        documentsCount: (subject as any)._count?.documents ?? 0,
      },
    };
  }

  // ── Quiz generation & evaluation ──────────────────────────────────────────

  async generateQuiz(
    userId: string,
    count: number,
    questionType: 'mcq' | 'open' | 'mixed',
    topic?: string,
  ): Promise<GenerateQuizResponse> {
    const P = '[ais-quiz]';

    // 1. Resolve active AIS subject from JWT user — never from request body
    const session = await this.prisma.aisSession.findUnique({ where: { userId } });
    if (!session?.isActive || !session.activeAisSubjectId) {
      throw new BadRequestException(
        'Nemáš aktívny AIS predmet. Synchronizuj predmet v kroku 3.',
      );
    }

    const subject = await this.prisma.aisSubject.findFirst({
      where: { id: session.activeAisSubjectId, userId },
      select: { id: true, code: true, name: true, chatCourseId: true },
    });
    if (!subject) throw new NotFoundException('AIS subject not found');

    console.log(`${P} generateQuiz: userId=*** subjectId=${subject.id} code=${subject.code}`);

    // 2. Check indexed documents
    const indexedDocs = await this.prisma.aisDocument.findMany({
      where: { userId, subjectId: session.activeAisSubjectId, indexedAt: { not: null } },
      select: { filename: true },
    });

    console.log(
      `${P} indexed documents: ${indexedDocs.length} ` +
        `[${indexedDocs.map((d) => d.filename).join(', ')}]`,
    );

    if (indexedDocs.length === 0) {
      throw new BadRequestException(
        'Predmet nemá žiadne zaindexované dokumenty. Synchronizuj predmet v kroku 3.',
      );
    }

    // 3. Build search queries — two broad queries to maximise document coverage.
    //    When a topic is given, use it directly (single high-topK search).
    const subjectLabel = [subject.name, subject.code].filter(Boolean).join(' ');
    const queries = topic
      ? [`${topic} ${subjectLabel}`.trim()]
      : [
          `${subjectLabel} prednáška materiál obsah výuka`,
          `otázky téma cvičenie štúdium ${subject.code}`,
        ];

    const topKPerQuery = topic ? 30 : 20;
    console.log(
      `${P} embedding ${queries.length} quer${queries.length === 1 ? 'y' : 'ies'}, ` +
        `topK=${topKPerQuery} each`,
    );

    const embeddings = await embed(queries);

    // 4. Run searches and merge results (dedup by Qdrant point id)
    const qdrantFilter = {
      must: [
        { key: 'sourceType', match: { value: 'ais' } },
        { key: 'userId',     match: { value: userId } },
        { key: 'subjectId',  match: { value: session.activeAisSubjectId } },
      ],
    };

    const seenIds = new Set<string>();
    const allRaw: QdrantScoredPoint[] = [];

    for (const vector of embeddings) {
      const results = await searchPoints({ vector, limit: topKPerQuery, filter: qdrantFilter });
      for (const r of results) {
        const id = String(r.id);
        if (!seenIds.has(id)) { seenIds.add(id); allRaw.push(r); }
      }
    }

    console.log(`${P} retrieved ${allRaw.length} unique chunks`);

    if (allRaw.length === 0) {
      throw new BadRequestException(
        'Qdrant nevrátil žiadne výsledky. Skontroluj, či sú dokumenty naindexované.',
      );
    }

    // 5. Extract chunk data from Qdrant payload (mirrors searchChunks extraction)
    type Chunk = { id: string; score: number; filename: string; text: string; chunkIndex: number | null };

    function extractChunk(item: QdrantScoredPoint): Chunk | null {
      const payload = item.payload && typeof item.payload === 'object'
        ? (item.payload as Record<string, unknown>)
        : {};
      const nested =
        payload['metadata'] && typeof payload['metadata'] === 'object'
          ? (payload['metadata'] as Record<string, unknown>)
          : {};

      const filename =
        typeof payload['filename'] === 'string' ? payload['filename']
        : typeof nested['filename'] === 'string' ? nested['filename']
        : null;

      const text =
        typeof payload['text'] === 'string' ? payload['text']
        : typeof payload['pageContent'] === 'string' ? payload['pageContent']
        : typeof nested['text'] === 'string' ? nested['text']
        : typeof nested['pageContent'] === 'string' ? nested['pageContent']
        : '';

      if (!text || !filename) return null; // skip incomplete chunks

      const chunkIndex =
        typeof payload['chunkIndex'] === 'number' ? payload['chunkIndex']
        : typeof nested['chunkIndex'] === 'number' ? nested['chunkIndex']
        : null;

      return { id: String(item.id), score: item.score ?? 0, filename, text, chunkIndex };
    }

    const chunks: Chunk[] = allRaw.map(extractChunk).filter((c): c is Chunk => c !== null);

    // 6. Group by filename
    const byFile = new Map<string, Chunk[]>();
    for (const chunk of chunks) {
      const key = chunk.filename;
      if (!byFile.has(key)) byFile.set(key, []);
      byFile.get(key)!.push(chunk);
    }

    const uniqueSourceFiles = [...byFile.keys()];
    console.log(
      `${P} unique source files in retrieved chunks: ${uniqueSourceFiles.length} ` +
        `[${uniqueSourceFiles.join(', ')}]`,
    );

    // 7. Select balanced chunks: distribute fairly across files
    //    Target ~2–4 chunks per file, enough to generate `count` questions.
    const targetChunks = Math.max(count * 3, 12);
    const maxPerFile = Math.max(2, Math.ceil(targetChunks / byFile.size));

    const selectedChunks: Chunk[] = [];
    // First pass: take up to maxPerFile from each file (already sorted by score from Qdrant)
    for (const fileChunks of byFile.values()) {
      selectedChunks.push(...fileChunks.slice(0, maxPerFile));
    }
    // If we still need more, fill from highest-scoring remaining chunks
    if (selectedChunks.length < targetChunks) {
      const selectedIds = new Set(selectedChunks.map((c) => c.id));
      const remaining = chunks
        .filter((c) => !selectedIds.has(c.id))
        .sort((a, b) => b.score - a.score);
      selectedChunks.push(...remaining.slice(0, targetChunks - selectedChunks.length));
    }

    console.log(
      `${P} selected ${selectedChunks.length} chunks from ${uniqueSourceFiles.length} file(s)`,
    );

    // 8. Build context string for LLM — each chunk tagged with its source file
    const context = selectedChunks
      .map((c, i) => `[ZDROJ: ${c.filename}${c.chunkIndex != null ? ` časť ${c.chunkIndex}` : ''}]\n${c.text.slice(0, 1200)}`)
      .join('\n\n---\n\n');

    // 9. Call OpenAI for structured quiz JSON
    const typeLabel =
      questionType === 'mcq' ? 'výber z možností (MCQ)'
      : questionType === 'open' ? 'otvorené otázky'
      : 'zmiešané (MCQ aj otvorené)';

    const topicLine = topic ? `Zameraj sa na tému: "${topic}". ` : '';

    const systemPrompt =
      'Si odborný pedagóg. Generuješ kvízové otázky výlučne z poskytnutého kontextu. ' +
      'Vždy odpoveď v slovenčine. Vrátaj VÝLUČNE validný JSON objekt — žiadny iný text. ' +
      'JSON musí mať kľúč "questions" s poľom objektov podľa schémy.';

    const mcqSchema =
      '{"id":1,"type":"mcq","question":"...","options":{"A":"...","B":"...","C":"...","D":"..."},' +
      '"answer":"B","explanation":"...","source":"nazov_suboru.pdf"}';
    const openSchema =
      '{"id":2,"type":"open","question":"...","modelAnswer":"...","explanation":"...","source":"nazov_suboru.pdf"}';

    const userPrompt =
      `Kontext (materiály predmetu ${subject.code}):\n\n${context}\n\n` +
      `---\n` +
      `Úloha: Vygeneruj presne ${count} kvízových otázok. ` +
      `Typ: ${typeLabel}. ${topicLine}` +
      `Ak existujú otázky z viacerých zdrojov, preferuj rozloženie cez rôzne súbory. ` +
      `Každá otázka musí mať pole "source" s názvom zdrojového súboru.\n\n` +
      `Schéma MCQ: ${mcqSchema}\n` +
      `Schéma otvorená: ${openSchema}\n\n` +
      `Vráť: {"questions":[...]} — bez akéhokoľvek ďalšieho textu.`;

    console.log(`${P} calling gpt-4o-mini for quiz generation, count=${count}`);

    const completion = await openaiChat.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — response_format is not in older type definitions
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
    });

    const rawText = completion.choices[0]?.message?.content ?? '';
    console.log(`${P} gpt-4o-mini response length=${rawText.length}`);

    // 10. Parse and validate quiz JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new BadRequestException('Nepodarilo sa parsovať JSON z OpenAI. Skús znova.');
    }

    const rawQuestions: unknown[] = Array.isArray((parsed as Record<string, unknown>)?.questions)
      ? ((parsed as Record<string, unknown>).questions as unknown[])
      : [];

    function validateQuestion(q: unknown, idx: number): QuizQuestionInternal | null {
      if (q === null || typeof q !== 'object') return null;
      const obj = q as Record<string, unknown>;
      const type = obj['type'] === 'mcq' ? 'mcq' : obj['type'] === 'open' ? 'open' : null;
      if (!type) return null;
      const question = typeof obj['question'] === 'string' ? obj['question'].trim() : '';
      if (!question) return null;

      const base: QuizQuestionInternal = {
        id: typeof obj['id'] === 'number' ? obj['id'] : idx + 1,
        type,
        question,
        explanation: typeof obj['explanation'] === 'string' ? obj['explanation'] : undefined,
        source: typeof obj['source'] === 'string' ? obj['source'] : undefined,
      };

      if (type === 'mcq') {
        const opts = obj['options'] as Record<string, unknown> | undefined;
        if (!opts || typeof opts !== 'object') return null;
        const A = typeof opts['A'] === 'string' ? opts['A'] : '';
        const B = typeof opts['B'] === 'string' ? opts['B'] : '';
        const C = typeof opts['C'] === 'string' ? opts['C'] : '';
        const D = typeof opts['D'] === 'string' ? opts['D'] : '';
        if (!A || !B || !C || !D) return null;
        const answer = typeof obj['answer'] === 'string' && ['A','B','C','D'].includes(obj['answer'])
          ? obj['answer'] : null;
        if (!answer) return null;
        return { ...base, options: { A, B, C, D }, answer };
      }

      const modelAnswer = typeof obj['modelAnswer'] === 'string' ? obj['modelAnswer'].trim() : '';
      if (!modelAnswer) return null;
      return { ...base, modelAnswer };
    }

    const questions: QuizQuestionInternal[] = rawQuestions
      .map((q, i) => validateQuestion(q, i))
      .filter((q): q is QuizQuestionInternal => q !== null);

    questions.forEach((q, i) => { q.id = i + 1; });

    // Warn if all questions came from one file despite multi-file context
    if (uniqueSourceFiles.length > 1) {
      const usedSources = new Set(questions.map((q) => q.source).filter(Boolean));
      if (usedSources.size <= 1) {
        console.warn(
          `${P} warning: generated quiz used only one source file despite ` +
            `multi-document context (${uniqueSourceFiles.length} source files provided)`,
        );
      } else {
        console.log(`${P} source distribution: [${[...usedSources].join(', ')}]`);
      }
    }

    console.log(`${P} generateQuiz DONE: ${questions.length} valid questions`);

    return {
      quizId: `ais_quiz_${userId.slice(0, 8)}_${Date.now()}`,
      subject: { code: subject.code, name: subject.name },
      questions,
      meta: {
        indexedDocCount: indexedDocs.length,
        retrievedChunks: allRaw.length,
        sourceFiles: uniqueSourceFiles,
      },
    };
  }

  async evaluateOpenAnswer(
    userId: string,
    data: {
      question: string;
      studentAnswer: string;
      modelAnswer: string;
      explanation?: string;
      quizId?: string;
    },
  ): Promise<EvaluateOpenResponse> {
    const P = '[ais-quiz]';

    // Auth scope check: user must have an active AIS session
    const session = await this.prisma.aisSession.findUnique({ where: { userId } });
    if (!session?.isActive) {
      throw new BadRequestException('No active AIS session');
    }

    const { question, studentAnswer, modelAnswer, explanation } = data;

    if (!question?.trim() || !studentAnswer?.trim() || !modelAnswer?.trim()) {
      throw new BadRequestException('question, studentAnswer and modelAnswer are required');
    }

    console.log(
      `${P} evaluateOpenAnswer: quizId=${data.quizId ?? 'n/a'} ` +
        `studentAnswerLen=${studentAnswer.trim().length}`,
    );

    const systemPrompt =
      'Si pedagóg, ktorý hodnotí odpovede študentov. ' +
      'Hodnoť sémantický obsah, nie presné znenie — prijmi synonymá a parafrázy. ' +
      'Vždy odpovedaj v slovenčine. Vrátaj VÝLUČNE validný JSON bez akéhokoľvek ďalšieho textu.\n' +
      'Schéma: {"status":"correct"|"partially_correct"|"incorrect","score":0|0.5|1,' +
      '"feedback":"...","matchedConcepts":["..."],"missingConcepts":["..."]}';

    const userPrompt =
      `Otázka: ${question.trim()}\n\n` +
      `Vzorová odpoveď: ${modelAnswer.trim()}\n\n` +
      (explanation ? `Vysvetlenie: ${explanation.trim()}\n\n` : '') +
      `Odpoveď študenta: ${studentAnswer.trim()}\n\n` +
      `Pravidlá hodnotenia:\n` +
      `- "correct" (score 1): odpoveď obsahuje kľúčové myšlienky vzoru, synonymá sú v poriadku\n` +
      `- "partially_correct" (score 0.5): odpoveď má niektoré správne časti, ale chýbajú dôležité informácie\n` +
      `- "incorrect" (score 0): odpoveď je nesúvisí s otázkou alebo je zásadne nesprávna\n` +
      `- "feedback": 1–2 vety, zrozumiteľné pre študenta, bez odhalenia interných systémov\n` +
      `- "matchedConcepts": kľúčové pojmy, ktoré študent správne uviedol (prázdne pole ak žiadne)\n` +
      `- "missingConcepts": dôležité pojmy, ktoré chýbali (prázdne pole ak žiadne)\n\n` +
      `Vráť JSON:`;

    const completion = await openaiChat.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
    });

    const rawText = completion.choices[0]?.message?.content ?? '';

    let result: EvaluateOpenResponse;
    try {
      const parsed = JSON.parse(rawText) as Record<string, unknown>;
      const status = parsed['status'];
      const validStatus =
        status === 'correct' || status === 'partially_correct' || status === 'incorrect'
          ? status
          : 'incorrect';

      const score =
        validStatus === 'correct' ? 1 : validStatus === 'partially_correct' ? 0.5 : 0;

      result = {
        status: validStatus,
        score,
        feedback: typeof parsed['feedback'] === 'string' ? parsed['feedback'] : 'Hodnotenie nedostupné.',
        matchedConcepts: Array.isArray(parsed['matchedConcepts'])
          ? (parsed['matchedConcepts'] as unknown[]).filter((s): s is string => typeof s === 'string')
          : [],
        missingConcepts: Array.isArray(parsed['missingConcepts'])
          ? (parsed['missingConcepts'] as unknown[]).filter((s): s is string => typeof s === 'string')
          : [],
      };
    } catch {
      result = {
        status: 'incorrect',
        score: 0,
        feedback: 'Hodnotenie sa nepodarilo spracovať.',
        matchedConcepts: [],
        missingConcepts: [],
      };
    }

    console.log(`${P} evaluateOpenAnswer: status=${result.status} score=${result.score}`);
    return result;
  }

  async searchChunks(
    userId: string,
    _courseId: string, // kept for API compatibility — we always use the active subject
    query: string,
    topK = 5,
  ): Promise<SearchChunksResponse> {
    const cleanQuery = String(query || '').trim();

    if (!cleanQuery) {
      throw new BadRequestException('query is required');
    }

    // Always search within the active AIS subject — do not trust the caller's
    // courseId so that the dev RAG test also reflects exactly what the chat sees.
    const session = await this.prisma.aisSession.findUnique({
      where: { userId },
    });

    if (!session?.isActive || !session.activeAisSubjectId) {
      throw new BadRequestException(
        'Žiaden aktívny AIS predmet. Najprv synchronizuj predmet.',
      );
    }

    const subject = await this.prisma.aisSubject.findFirst({
      where: {
        id: session.activeAisSubjectId,
        userId,
      },
      select: {
        id: true,
        code: true,
        name: true,
        chatCourseId: true,
      },
    });

    if (!subject) {
      throw new NotFoundException('AIS subject not found');
    }

    const vectors = await embed([cleanQuery]);
    const vector = vectors[0];

    // Filter: AIS vectors for this user AND this specific subject.
    // Scoping by subjectId prevents results bleeding across subjects when
    // multiple subjects are indexed simultaneously.
    const rawResults = await searchPoints({
      vector,
      limit: topK,
      filter: {
        must: [
          { key: 'sourceType', match: { value: 'ais' } },
          { key: 'userId', match: { value: userId } },
          { key: 'subjectId', match: { value: session.activeAisSubjectId } },
        ],
      },
    });

    const matches = rawResults.map((item, index) => {
      const payload =
        item?.payload && typeof item.payload === 'object'
          ? (item.payload as Record<string, unknown>)
          : {};

      const nestedMetadataRaw = payload['metadata'];
      const nestedMetadata =
        nestedMetadataRaw && typeof nestedMetadataRaw === 'object'
          ? (nestedMetadataRaw as Record<string, unknown>)
          : {};

      const filename =
        typeof payload['filename'] === 'string'
          ? payload['filename']
          : typeof nestedMetadata['filename'] === 'string'
            ? nestedMetadata['filename']
            : null;

      const text =
        typeof payload['text'] === 'string'
          ? payload['text']
          : typeof payload['pageContent'] === 'string'
            ? payload['pageContent']
            : typeof nestedMetadata['text'] === 'string'
              ? nestedMetadata['text']
              : typeof nestedMetadata['pageContent'] === 'string'
                ? nestedMetadata['pageContent']
                : '';

      const chunkIndex =
        typeof payload['chunkIndex'] === 'number'
          ? payload['chunkIndex']
          : typeof nestedMetadata['chunkIndex'] === 'number'
            ? nestedMetadata['chunkIndex']
            : null;

      const sourceUrl =
        typeof payload['sourceUrl'] === 'string'
          ? payload['sourceUrl']
          : typeof nestedMetadata['sourceUrl'] === 'string'
            ? nestedMetadata['sourceUrl']
            : null;

      return {
        id:
          typeof item?.id === 'string' || typeof item?.id === 'number'
            ? String(item.id)
            : `match-${index}`,
        score: typeof item?.score === 'number' ? item.score : 0,
        filename: filename ?? null,
        text,
        chunkIndex,
        sourceUrl: sourceUrl ?? null,
      };
    });

    return {
      subject: {
        id: subject.id,
        code: subject.code,
        name: subject.name ?? null,
        chatCourseId: subject.chatCourseId ?? '',
      },
      query: cleanQuery,
      topK,
      matches,
      contextText: matches.map((m) => m.text).join('\n\n'),
    };
  }
}
