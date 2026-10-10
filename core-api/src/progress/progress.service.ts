// src/progress/progress.service.ts
//
// Handles student learning progress for regular (teacher-created) courses:
//   - Quiz generation from course materials in Qdrant
//   - Open-answer semantic evaluation via OpenAI
//   - Quiz attempt persistence (QuizAttempt + QuizAnswer)
//   - Progress recalculation (StudentCourseProgress)

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { embed } from '../lib/openaiEmbeddings';
import { openaiChat } from '../lib/openaiChat';
import { searchPoints, QdrantScoredPoint } from '../lib/qdrant';

const P = '[progress]';

// ── Types ─────────────────────────────────────────────────────────────────────

type QuizQuestion = {
  id: number;
  type: 'mcq' | 'open';
  question: string;
  options?: { A: string; B: string; C: string; D: string };
  answer?: string;
  modelAnswer?: string;
  explanation?: string;
  source?: string;
};

type EvaluationResult = {
  status: 'correct' | 'partially_correct' | 'incorrect';
  score: 0 | 0.5 | 1;
  feedback: string;
  matchedConcepts: string[];
  missingConcepts: string[];
};

type AnswerPayload = {
  questionId: number;
  questionText: string;
  questionType: 'mcq' | 'open';
  userAnswer?: string;
  correctAnswer?: string;
  isCorrect?: boolean;
  source?: string;
  // Pre-evaluated open answers (optional — server re-evaluates if missing)
  evaluation?: EvaluationResult;
};

type SubmitAttemptPayload = {
  quizType: 'mcq' | 'open' | 'mixed';
  topic?: string;
  questions: QuizQuestion[];
  answers: AnswerPayload[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function estimateLevel(scoreAvg: number, totalQuestions: number): string {
  if (totalQuestions < 5) return 'beginner'; // not enough data
  if (scoreAvg >= 0.8)   return 'advanced';
  if (scoreAvg >= 0.5)   return 'intermediate';
  return 'beginner';
}

function extractChunk(item: QdrantScoredPoint): { id: string; filename: string; text: string; chunkIndex: number | null } | null {
  const payload = item.payload && typeof item.payload === 'object'
    ? (item.payload as Record<string, unknown>)
    : {};
  const nested = payload['metadata'] && typeof payload['metadata'] === 'object'
    ? (payload['metadata'] as Record<string, unknown>)
    : {};

  const filename =
    typeof payload['filename'] === 'string' ? payload['filename']
    : typeof nested['filename'] === 'string' ? nested['filename']
    : typeof nested['originalName'] === 'string' ? nested['originalName']
    : null;

  const text =
    typeof payload['text'] === 'string' ? payload['text']
    : typeof payload['pageContent'] === 'string' ? payload['pageContent']
    : typeof nested['text'] === 'string' ? nested['text']
    : typeof nested['pageContent'] === 'string' ? nested['pageContent']
    : '';

  if (!text) return null;

  // For course materials, use metadata.source as the display label
  const displayName =
    typeof nested['source'] === 'string' ? nested['source']
    : filename ?? 'neznámy zdroj';

  const chunkIndex =
    typeof payload['chunkIndex'] === 'number' ? payload['chunkIndex']
    : typeof nested['chunkIndex'] === 'number' ? nested['chunkIndex']
    : null;

  return { id: String(item.id), filename: displayName, text, chunkIndex };
}

function validateQuestion(q: unknown, idx: number): QuizQuestion | null {
  if (!q || typeof q !== 'object') return null;
  const obj = q as Record<string, unknown>;
  const type = obj['type'] === 'mcq' ? 'mcq' : obj['type'] === 'open' ? 'open' : null;
  if (!type) return null;
  const question = typeof obj['question'] === 'string' ? obj['question'].trim() : '';
  if (!question) return null;

  const base: QuizQuestion = {
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
    const answer = typeof obj['answer'] === 'string' && ['A', 'B', 'C', 'D'].includes(obj['answer'])
      ? obj['answer'] : null;
    if (!answer) return null;
    return { ...base, options: { A, B, C, D }, answer };
  }

  const modelAnswer = typeof obj['modelAnswer'] === 'string' ? obj['modelAnswer'].trim() : '';
  if (!modelAnswer) return null;
  return { ...base, modelAnswer };
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Enrollment guard ───────────────────────────────────────────────────────

  private async requireEnrollment(studentId: string, courseId: string): Promise<void> {
    const enrollment = await this.prisma.courseEnrollment.findFirst({
      where: { studentId, courseId },
      select: { id: true },
    });
    if (!enrollment) {
      throw new ForbiddenException('You are not enrolled in this course');
    }
  }

  // ── Quiz generation ────────────────────────────────────────────────────────

  async generateQuiz(
    studentId: string,
    courseId: string,
    count: number,
    questionType: 'mcq' | 'open' | 'mixed',
    topic?: string,
  ) {
    await this.requireEnrollment(studentId, courseId);

    // Verify course exists
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, name: true, code: true },
    });
    if (!course) throw new NotFoundException('Course not found');

    console.log(`${P} generateQuiz: studentId=*** courseId=${courseId} count=${count} type=${questionType}`);

    // Build diverse search queries to get chunks from multiple source files
    const courseLabel = [course.name, course.code].filter(Boolean).join(' ');
    const queries = topic
      ? [`${topic} ${courseLabel}`.trim()]
      : [
          `${courseLabel} prednáška materiál obsah výuka`,
          `otázky téma cvičenie kurz ${course.code ?? ''}`.trim(),
        ];

    const topKPerQuery = topic ? 30 : 20;
    const embeddings = await embed(queries);

    // Qdrant filter for course materials only
    const qdrantFilter = {
      must: [
        { key: 'sourceType', match: { value: 'course_material' } },
        { key: 'courseId',   match: { value: courseId } },
      ],
    };

    // Search with deduplication
    const seenIds = new Set<string>();
    const allRaw: QdrantScoredPoint[] = [];
    for (const vector of embeddings) {
      const results = await searchPoints({ vector, limit: topKPerQuery, filter: qdrantFilter });
      for (const r of results) {
        const id = String(r.id);
        if (!seenIds.has(id)) { seenIds.add(id); allRaw.push(r); }
      }
    }

    console.log(`${P} retrieved ${allRaw.length} unique chunks for courseId=${courseId}`);

    if (allRaw.length === 0) {
      throw new BadRequestException(
        'Kurz nemá žiadne naindexované materiály. Kontaktuj svojho učiteľa.',
      );
    }

    // Extract and group by filename/source
    type Chunk = { id: string; filename: string; text: string; chunkIndex: number | null };
    const chunks: Chunk[] = allRaw.map(extractChunk).filter((c): c is Chunk => c !== null);

    const byFile = new Map<string, Chunk[]>();
    for (const chunk of chunks) {
      if (!byFile.has(chunk.filename)) byFile.set(chunk.filename, []);
      byFile.get(chunk.filename)!.push(chunk);
    }

    const uniqueFiles = [...byFile.keys()];
    console.log(`${P} source files: ${uniqueFiles.length} [${uniqueFiles.join(', ')}]`);

    // Balance selection across files
    const targetChunks = Math.max(count * 3, 12);
    const maxPerFile = Math.max(2, Math.ceil(targetChunks / byFile.size));
    const selectedChunks: Chunk[] = [];
    for (const fileChunks of byFile.values()) {
      selectedChunks.push(...fileChunks.slice(0, maxPerFile));
    }
    // Fill remaining slots from highest-scoring unused chunks
    if (selectedChunks.length < targetChunks) {
      const selectedIds = new Set(selectedChunks.map((c) => c.id));
      const remaining = chunks.filter((c) => !selectedIds.has(c.id)).sort((a, b) =>
        (allRaw.find((r) => String(r.id) === b.id)?.score ?? 0) -
        (allRaw.find((r) => String(r.id) === a.id)?.score ?? 0),
      );
      selectedChunks.push(...remaining.slice(0, targetChunks - selectedChunks.length));
    }

    console.log(`${P} selected ${selectedChunks.length} chunks from ${uniqueFiles.length} file(s)`);

    // Build context
    const context = selectedChunks
      .map((c) => `[ZDROJ: ${c.filename}]\n${c.text.slice(0, 1200)}`)
      .join('\n\n---\n\n');

    const typeLabel =
      questionType === 'mcq' ? 'výber z možností (MCQ)'
      : questionType === 'open' ? 'otvorené otázky'
      : 'zmiešané (MCQ aj otvorené)';

    const topicLine = topic ? `Zameraj sa na tému: "${topic}". ` : '';

    const mcqEx = '{"id":1,"type":"mcq","question":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"answer":"B","explanation":"...","source":"Prednáška 1 — file.pdf [chunk 1]"}';
    const openEx = '{"id":2,"type":"open","question":"...","modelAnswer":"...","explanation":"...","source":"Prednáška 2 — file2.pdf [chunk 3]"}';

    const systemPrompt =
      'Si odborný pedagóg. Generuješ kvízové otázky výlučne z poskytnutého kontextu. ' +
      'Odpovedaj v slovenčine. Vrátaj VÝLUČNE validný JSON — žiadny iný text.';

    const userPrompt =
      `Kontext (materiály kurzu ${courseLabel}):\n\n${context}\n\n---\n` +
      `Úloha: Vygeneruj presne ${count} otázok. Typ: ${typeLabel}. ${topicLine}` +
      `Ak existujú otázky z viacerých zdrojov, preferuj rozloženie cez rôzne súbory.\n` +
      `Každá otázka musí mať pole "source" — skopíruj hodnotu z [ZDROJ:...] pre daný úsek.\n` +
      `Schéma MCQ: ${mcqEx}\n` +
      `Schéma otvorená: ${openEx}\n\n` +
      `Vráť: {"questions":[...]}`;

    console.log(`${P} calling gpt-4o-mini for quiz generation`);

    const completion = await openaiChat.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      // @ts-ignore
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
    });

    const rawText = completion.choices[0]?.message?.content ?? '';
    let parsed: unknown;
    try { parsed = JSON.parse(rawText); }
    catch { throw new BadRequestException('Nepodarilo sa parsovať JSON z OpenAI. Skús znova.'); }

    const rawQs = Array.isArray((parsed as Record<string, unknown>)?.['questions'])
      ? ((parsed as Record<string, unknown>)['questions'] as unknown[])
      : [];

    const questions = rawQs
      .map((q, i) => validateQuestion(q, i))
      .filter((q): q is QuizQuestion => q !== null);

    questions.forEach((q, i) => { q.id = i + 1; });

    if (questions.length === 0) {
      throw new BadRequestException('Nepodarilo sa vygenerovať platné otázky. Skús znova.');
    }

    // Warn if single-file result despite multi-file context
    if (uniqueFiles.length > 1) {
      const usedSources = new Set(questions.map((q) => q.source).filter(Boolean));
      if (usedSources.size <= 1) {
        console.warn(`${P} warning: quiz used only one source file despite ${uniqueFiles.length} available`);
      } else {
        console.log(`${P} source distribution: [${[...usedSources].join(', ')}]`);
      }
    }

    console.log(`${P} generateQuiz DONE: ${questions.length} questions`);

    return {
      courseId,
      course: { name: course.name, code: course.code },
      questions,
      meta: { sourceFiles: uniqueFiles, retrievedChunks: allRaw.length },
    };
  }

  // ── Open-answer evaluation ─────────────────────────────────────────────────

  async evaluateOpenAnswer(
    studentId: string,
    courseId: string,
    data: { question: string; studentAnswer: string; modelAnswer: string; explanation?: string },
  ): Promise<EvaluationResult> {
    await this.requireEnrollment(studentId, courseId);

    const { question, studentAnswer, modelAnswer, explanation } = data;
    if (!question?.trim() || !studentAnswer?.trim() || !modelAnswer?.trim()) {
      throw new BadRequestException('question, studentAnswer and modelAnswer are required');
    }

    console.log(`${P} evaluateOpenAnswer: courseId=${courseId} answerLen=${studentAnswer.trim().length}`);

    const systemPrompt =
      'Si pedagóg, ktorý hodnotí odpovede študentov sémanticky. ' +
      'Prijmi synonymá a parafrázy — hodnoť obsah, nie presné znenie. ' +
      'Odpovedaj v slovenčine. Vrátaj VÝLUČNE validný JSON.\n' +
      'Schéma: {"status":"correct"|"partially_correct"|"incorrect","score":0|0.5|1,' +
      '"feedback":"...","matchedConcepts":["..."],"missingConcepts":["..."]}';

    const userPrompt =
      `Otázka: ${question.trim()}\n\n` +
      `Vzorová odpoveď: ${modelAnswer.trim()}\n\n` +
      (explanation ? `Vysvetlenie: ${explanation.trim()}\n\n` : '') +
      `Odpoveď študenta: ${studentAnswer.trim()}\n\n` +
      `Pravidlá:\n` +
      `- "correct" (1): kľúčové myšlienky vzoru, synonymá OK\n` +
      `- "partially_correct" (0.5): niektoré správne časti, ale chýbajú dôležité info\n` +
      `- "incorrect" (0): nesúvisí s otázkou alebo zásadne nesprávne\n` +
      `- feedback: 1–2 vety pre študenta\n` +
      `- matchedConcepts: správne pojmy, ktoré uviedol\n` +
      `- missingConcepts: dôležité pojmy, ktoré chýbali\nVráť JSON:`;

    const completion = await openaiChat.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      // @ts-ignore
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
    });

    const rawText = completion.choices[0]?.message?.content ?? '';
    try {
      const p = JSON.parse(rawText) as Record<string, unknown>;
      const status = p['status'];
      const validStatus: EvaluationResult['status'] =
        status === 'correct' ? 'correct'
        : status === 'partially_correct' ? 'partially_correct'
        : 'incorrect';
      const score: 0 | 0.5 | 1 =
        validStatus === 'correct' ? 1
        : validStatus === 'partially_correct' ? 0.5
        : 0;

      const result: EvaluationResult = {
        status: validStatus,
        score,
        feedback: typeof p['feedback'] === 'string' ? p['feedback'] : 'Hodnotenie nedostupné.',
        matchedConcepts: Array.isArray(p['matchedConcepts'])
          ? (p['matchedConcepts'] as unknown[]).filter((s): s is string => typeof s === 'string')
          : [],
        missingConcepts: Array.isArray(p['missingConcepts'])
          ? (p['missingConcepts'] as unknown[]).filter((s): s is string => typeof s === 'string')
          : [],
      };
      console.log(`${P} evaluateOpen: status=${result.status} score=${result.score}`);
      return result;
    } catch {
      return { status: 'incorrect', score: 0, feedback: 'Hodnotenie nedostupné.', matchedConcepts: [], missingConcepts: [] };
    }
  }

  // ── Submit quiz attempt ────────────────────────────────────────────────────

  async submitAttempt(studentId: string, courseId: string, payload: SubmitAttemptPayload) {
    await this.requireEnrollment(studentId, courseId);

    const { quizType, topic, questions, answers } = payload;
    console.log(`${P} submitAttempt: studentId=*** courseId=${courseId} questions=${questions.length}`);

    // Evaluate any open answers that weren't pre-evaluated by the frontend
    const evaluations = new Map<number, EvaluationResult>();

    const openAnswers = answers.filter((a) => a.questionType === 'open' && a.userAnswer?.trim());
    await Promise.all(
      openAnswers.map(async (a) => {
        if (a.evaluation) {
          evaluations.set(a.questionId, a.evaluation);
          return;
        }
        const q = questions.find((q) => q.id === a.questionId);
        if (!q?.modelAnswer) return;
        try {
          const ev = await this.evaluateOpenAnswer(studentId, courseId, {
            question: q.question,
            studentAnswer: a.userAnswer!,
            modelAnswer: q.modelAnswer,
            explanation: q.explanation,
          });
          evaluations.set(a.questionId, ev);
        } catch {
          evaluations.set(a.questionId, { status: 'incorrect', score: 0, feedback: 'Hodnotenie nedostupné.', matchedConcepts: [], missingConcepts: [] });
        }
      }),
    );

    // Calculate scores
    let correctAnswers = 0;
    const now = new Date();

    const attempt = await this.prisma.quizAttempt.create({
      data: {
        studentId,
        courseId,
        quizType,
        topic: topic ?? null,
        totalQuestions: questions.length,
        correctAnswers: 0, // updated below
        score: 0,          // updated below
        startedAt: now,
        finishedAt: now,
      },
    });

    // Save answers
    const answerRecords = answers.map((a) => {
      const ev = a.questionType === 'open' ? evaluations.get(a.questionId) : null;
      const isCorrect = a.questionType === 'mcq' ? (a.isCorrect ?? false) : null;
      const aiScore = ev?.score ?? null;

      // Earn points
      if (a.questionType === 'mcq' && a.isCorrect) correctAnswers += 1;
      if (a.questionType === 'open' && ev) correctAnswers += ev.score;

      return {
        attemptId: attempt.id,
        questionText: a.questionText.slice(0, 2000),
        questionType: a.questionType,
        userAnswer: a.userAnswer?.slice(0, 4000) ?? null,
        correctAnswer: a.correctAnswer?.slice(0, 2000) ?? null,
        isCorrect,
        aiEvalStatus: ev?.status ?? null,
        aiScore,
        aiFeedback: ev?.feedback?.slice(0, 2000) ?? null,
        matchedConcepts: (ev?.matchedConcepts ?? []) as string[],
        missingConcepts: (ev?.missingConcepts ?? []) as string[],
        topic: a.source ?? null,
      };
    });

    await this.prisma.quizAnswer.createMany({ data: answerRecords });

    const score = questions.length > 0 ? correctAnswers / questions.length : 0;

    // Update attempt with final scores
    await this.prisma.quizAttempt.update({
      where: { id: attempt.id },
      data: { correctAnswers, score },
    });

    // Recalculate progress
    const updatedProgress = await this.recalculateProgress(studentId, courseId);

    console.log(`${P} submitAttempt DONE: attemptId=${attempt.id} score=${score.toFixed(2)} level=${updatedProgress.estimatedLevel}`);

    return {
      attemptId: attempt.id,
      score,
      correctAnswers,
      totalQuestions: questions.length,
      evaluations: Object.fromEntries(evaluations),
      progress: updatedProgress,
    };
  }

  // ── Progress recalculation ─────────────────────────────────────────────────

  private async recalculateProgress(studentId: string, courseId: string) {
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { studentId, courseId, finishedAt: { not: null } },
      include: { answers: { select: { questionType: true, isCorrect: true, aiScore: true, topic: true } } },
    });

    const totalQuizzes = attempts.length;
    const totalQuestions = attempts.reduce((s, a) => s + a.totalQuestions, 0);
    const correctAnswers = attempts.reduce((s, a) => s + a.correctAnswers, 0);
    const scoreAvg = totalQuestions > 0 ? correctAnswers / totalQuestions : 0;

    // Topic analysis: group answers by topic, compute per-topic accuracy
    const topicMap = new Map<string, { total: number; earned: number }>();
    for (const attempt of attempts) {
      for (const ans of attempt.answers) {
        if (!ans.topic) continue;
        if (!topicMap.has(ans.topic)) topicMap.set(ans.topic, { total: 0, earned: 0 });
        const t = topicMap.get(ans.topic)!;
        t.total++;
        if (ans.questionType === 'mcq' && ans.isCorrect) t.earned += 1;
        if (ans.questionType === 'open' && ans.aiScore != null) t.earned += ans.aiScore;
      }
    }

    const weakTopics: string[] = [];
    const strongTopics: string[] = [];
    for (const [topic, { total, earned }] of topicMap) {
      if (total < 2) continue;
      const acc = earned / total;
      if (acc < 0.5) weakTopics.push(topic);
      else if (acc >= 0.8) strongTopics.push(topic);
    }

    const estimatedLevel = estimateLevel(scoreAvg, totalQuestions);

    await this.prisma.studentCourseProgress.upsert({
      where: { studentId_courseId: { studentId, courseId } },
      create: {
        studentId, courseId, estimatedLevel, scoreAvg,
        totalQuizzes, totalQuestions,
        correctAnswers,
        weakTopics: weakTopics as unknown as object,
        strongTopics: strongTopics as unknown as object,
        lastActivityAt: new Date(),
      },
      update: {
        estimatedLevel, scoreAvg, totalQuizzes, totalQuestions,
        correctAnswers,
        weakTopics: weakTopics as unknown as object,
        strongTopics: strongTopics as unknown as object,
        lastActivityAt: new Date(),
      },
    });

    return { estimatedLevel, scoreAvg, totalQuizzes, totalQuestions, correctAnswers, weakTopics, strongTopics };
  }

  // ── Read endpoints ─────────────────────────────────────────────────────────

  async getProgress(studentId: string, courseId: string) {
    await this.requireEnrollment(studentId, courseId);

    const progress = await this.prisma.studentCourseProgress.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });

    if (!progress) {
      return {
        estimatedLevel: 'beginner',
        scoreAvg: 0,
        totalQuizzes: 0,
        totalQuestions: 0,
        correctAnswers: 0,
        weakTopics: [] as string[],
        strongTopics: [] as string[],
        lastActivityAt: null,
        noData: true,
      };
    }

    return {
      estimatedLevel: progress.estimatedLevel,
      scoreAvg: progress.scoreAvg,
      totalQuizzes: progress.totalQuizzes,
      totalQuestions: progress.totalQuestions,
      correctAnswers: progress.correctAnswers,
      weakTopics: (progress.weakTopics as string[]) ?? [],
      strongTopics: (progress.strongTopics as string[]) ?? [],
      lastActivityAt: progress.lastActivityAt,
      noData: false,
    };
  }

  async getQuizHistory(studentId: string, courseId: string) {
    await this.requireEnrollment(studentId, courseId);

    const attempts = await this.prisma.quizAttempt.findMany({
      where: { studentId, courseId },
      orderBy: { startedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        quizType: true,
        topic: true,
        totalQuestions: true,
        correctAnswers: true,
        score: true,
        startedAt: true,
        finishedAt: true,
      },
    });

    return { attempts };
  }
}
