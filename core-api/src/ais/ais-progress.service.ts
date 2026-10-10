// src/ais/ais-progress.service.ts
//
// Persists quiz attempts and aggregates learning progress for AIS subjects.
// The active AIS subject is ALWAYS resolved server-side from AisSession —
// nothing is trusted from request bodies.

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { openaiChat } from '../lib/openaiChat';

const P = '[ais-progress]';

// ── Types (shared with AisQuizPanel on the frontend) ─────────────────────────

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
  source?: string;           // filename used as topic key
  evaluation?: EvaluationResult;
};

export type SubmitAttemptPayload = {
  quizType: 'mcq' | 'open' | 'mixed';
  topic?: string;
  questions: QuizQuestion[];
  answers: AnswerPayload[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function estimateLevel(scoreAvg: number, totalQuestions: number): string {
  if (totalQuestions < 5) return 'beginner'; // not enough data
  if (scoreAvg >= 0.8) return 'advanced';
  if (scoreAvg >= 0.5) return 'intermediate';
  return 'beginner';
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class AisProgressService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Resolve active AIS subject ────────────────────────────────────────────

  /** Returns the AIS subject ID currently active for this user.
   *  Throws ForbiddenException if the user has no active AIS subject. */
  private async requireActiveSubject(userId: string): Promise<{ aisSubjectId: string; subjectCode: string }> {
    const session = await this.prisma.aisSession.findUnique({
      where: { userId },
      select: { isActive: true, activeAisSubjectId: true },
    });

    if (!session?.isActive || !session.activeAisSubjectId) {
      throw new ForbiddenException(
        'Nemáš aktívny AIS predmet. Najprv synchronizuj predmet v AIS sekcii.',
      );
    }

    const subject = await this.prisma.aisSubject.findUnique({
      where: { id: session.activeAisSubjectId },
      select: { id: true, code: true, userId: true },
    });

    if (!subject || subject.userId !== userId) {
      throw new ForbiddenException('Aktívny predmet nepatrí tvojmu účtu.');
    }

    return { aisSubjectId: subject.id, subjectCode: subject.code };
  }

  // ── Open-answer re-evaluation (server-side fallback) ─────────────────────

  private async evaluateOpen(
    question: string,
    studentAnswer: string,
    modelAnswer: string,
    explanation?: string,
  ): Promise<EvaluationResult> {
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
      `Vráť JSON:`;

    try {
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

      const p = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as Record<string, unknown>;
      const status = p['status'];
      const validStatus: EvaluationResult['status'] =
        status === 'correct' ? 'correct'
        : status === 'partially_correct' ? 'partially_correct'
        : 'incorrect';
      const score: 0 | 0.5 | 1 =
        validStatus === 'correct' ? 1 : validStatus === 'partially_correct' ? 0.5 : 0;

      return {
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
    } catch {
      return { status: 'incorrect', score: 0, feedback: 'Hodnotenie nedostupné.', matchedConcepts: [], missingConcepts: [] };
    }
  }

  // ── Submit quiz attempt ───────────────────────────────────────────────────

  async submitAttempt(userId: string, payload: SubmitAttemptPayload) {
    const { aisSubjectId, subjectCode } = await this.requireActiveSubject(userId);

    const { quizType, topic, questions, answers } = payload;

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new BadRequestException('Kvíz neobsahuje žiadne otázky.');
    }
    if (!Array.isArray(answers)) {
      throw new BadRequestException('Chýbajú odpovede.');
    }

    console.log(
      `${P} submitAttempt: userId=*** aisSubjectId=${aisSubjectId} code=${subjectCode} ` +
      `questions=${questions.length} quizType=${quizType}`,
    );

    // Build evaluation map — re-evaluate open answers if frontend didn't
    const evaluations = new Map<number, EvaluationResult>();

    const openAnswers = answers.filter(
      (a) => a.questionType === 'open' && (a.userAnswer ?? '').trim(),
    );

    await Promise.all(
      openAnswers.map(async (a) => {
        if (a.evaluation) {
          evaluations.set(a.questionId, a.evaluation);
          return;
        }
        const q = questions.find((q) => q.id === a.questionId);
        if (!q?.modelAnswer) return;
        try {
          const ev = await this.evaluateOpen(
            q.question,
            a.userAnswer!,
            q.modelAnswer,
            q.explanation,
          );
          evaluations.set(a.questionId, ev);
        } catch {
          evaluations.set(a.questionId, {
            status: 'incorrect', score: 0,
            feedback: 'Hodnotenie nedostupné.',
            matchedConcepts: [], missingConcepts: [],
          });
        }
      }),
    );

    // ── Persist to database ───────────────────────────────────────────────────
    // Wrapped in try/catch so encoding or constraint errors produce a clear log
    // and a structured HTTP 500 instead of an unhandled rejection.

    let correctAnswers = 0;
    const now = new Date();

    let attempt: { id: string };
    try {
      attempt = await this.prisma.aisQuizAttempt.create({
        data: {
          userId,
          aisSubjectId,
          quizType,
          topic: topic ?? null,
          totalQuestions: questions.length,
          correctAnswers: 0,
          score: 0,
          startedAt: now,
          finishedAt: now,
        },
      });
    } catch (err) {
      console.error(`${P} DB error creating AisQuizAttempt:`, (err as Error)?.message ?? err);
      throw new InternalServerErrorException(
        'Nepodarilo sa uložiť kvízový pokus do databázy. ' +
        'Skontroluj kódovanie databázy (musí byť UTF8). ' +
        `Detaily: ${(err as Error)?.message ?? 'neznáma chyba'}`,
      );
    }

    const answerRecords = answers.map((a) => {
      const ev = a.questionType === 'open' ? evaluations.get(a.questionId) : null;
      const isCorrect = a.questionType === 'mcq' ? (a.isCorrect ?? false) : null;

      if (a.questionType === 'mcq' && a.isCorrect) correctAnswers += 1;
      if (a.questionType === 'open' && ev) correctAnswers += ev.score;

      return {
        attemptId: attempt.id,
        questionText: (a.questionText ?? '').slice(0, 2000),
        questionType: a.questionType,
        userAnswer: a.userAnswer?.slice(0, 4000) ?? null,
        correctAnswer: a.correctAnswer?.slice(0, 2000) ?? null,
        isCorrect,
        aiEvalStatus: ev?.status ?? null,
        aiScore: ev?.score ?? null,
        aiFeedback: ev?.feedback?.slice(0, 2000) ?? null,
        matchedConcepts: (ev?.matchedConcepts ?? []) as string[],
        missingConcepts: (ev?.missingConcepts ?? []) as string[],
        topic: a.source ?? null,
      };
    });

    try {
      await this.prisma.aisQuizAnswer.createMany({ data: answerRecords });
    } catch (err) {
      console.error(`${P} DB error saving AisQuizAnswers for attempt ${attempt.id}:`, (err as Error)?.message ?? err);
      // Clean up the orphaned attempt
      await this.prisma.aisQuizAttempt.delete({ where: { id: attempt.id } }).catch(() => {});
      throw new InternalServerErrorException(
        'Nepodarilo sa uložiť odpovede kvízu. ' +
        `Detaily: ${(err as Error)?.message ?? 'neznáma chyba'}`,
      );
    }

    const score = questions.length > 0 ? correctAnswers / questions.length : 0;

    await this.prisma.aisQuizAttempt.update({
      where: { id: attempt.id },
      data: { correctAnswers, score },
    });

    let progress: Awaited<ReturnType<typeof this.recalculateProgress>>;
    try {
      progress = await this.recalculateProgress(userId, aisSubjectId);
    } catch (err) {
      console.error(`${P} DB error recalculating progress for aisSubjectId=${aisSubjectId}:`, (err as Error)?.message ?? err);
      throw new InternalServerErrorException(
        'Kvíz bol uložený, ale obnova pokroku zlyhala. ' +
        `Detaily: ${(err as Error)?.message ?? 'neznáma chyba'}`,
      );
    }

    console.log(
      `${P} submitAttempt DONE: attemptId=${attempt.id} score=${score.toFixed(2)} ` +
      `level=${progress.estimatedLevel} totalQuizzes=${progress.totalQuizzes}`,
    );

    return {
      attemptId: attempt.id,
      score,
      correctAnswers,
      totalQuestions: questions.length,
      progress,
    };
  }

  // ── Progress recalculation ────────────────────────────────────────────────

  private async recalculateProgress(userId: string, aisSubjectId: string) {
    const attempts = await this.prisma.aisQuizAttempt.findMany({
      where: { userId, aisSubjectId, finishedAt: { not: null } },
      include: {
        answers: {
          select: { questionType: true, isCorrect: true, aiScore: true, topic: true },
        },
      },
    });

    const totalQuizzes = attempts.length;
    const totalQuestions = attempts.reduce((s, a) => s + a.totalQuestions, 0);
    const correctAnswers = attempts.reduce((s, a) => s + a.correctAnswers, 0);
    const scoreAvg = totalQuestions > 0 ? correctAnswers / totalQuestions : 0;

    // Per-topic accuracy analysis (topic = source filename)
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
      if (total < 2) continue; // too few data points
      const acc = earned / total;
      if (acc < 0.5) weakTopics.push(topic);
      else if (acc >= 0.8) strongTopics.push(topic);
    }

    const estimatedLevel = estimateLevel(scoreAvg, totalQuestions);

    await this.prisma.aisSubjectProgress.upsert({
      where: { userId_aisSubjectId: { userId, aisSubjectId } },
      create: {
        userId, aisSubjectId, estimatedLevel, scoreAvg,
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

  // ── Read endpoints ────────────────────────────────────────────────────────

  async getProgress(userId: string) {
    const { aisSubjectId, subjectCode } = await this.requireActiveSubject(userId);

    const progress = await this.prisma.aisSubjectProgress.findUnique({
      where: { userId_aisSubjectId: { userId, aisSubjectId } },
    });

    // Also fetch subject metadata for display
    const subject = await this.prisma.aisSubject.findUnique({
      where: { id: aisSubjectId },
      select: { code: true, name: true, semesterLabel: true },
    });

    const base = {
      aisSubjectId,
      subjectCode: subject?.code ?? subjectCode,
      subjectName: subject?.name ?? null,
      semesterLabel: subject?.semesterLabel ?? null,
    };

    if (!progress) {
      return {
        ...base,
        estimatedLevel: 'beginner',
        scoreAvg: 0,
        totalQuizzes: 0,
        totalQuestions: 0,
        correctAnswers: 0,
        weakTopics: [] as string[],
        strongTopics: [] as string[],
        lastActivityAt: null,
        noData: true,
        levelNote: 'Zatiaľ nemáš dostatok dát na presný odhad úrovne. Absolvuj aspoň 1–2 kvízy.',
      };
    }

    const levelNote =
      progress.totalQuestions < 5
        ? 'Odhad úrovne je predbežný — absolvuj viac kvízov pre presnejší výsledok.'
        : null;

    return {
      ...base,
      estimatedLevel: progress.estimatedLevel,
      scoreAvg: progress.scoreAvg,
      totalQuizzes: progress.totalQuizzes,
      totalQuestions: progress.totalQuestions,
      correctAnswers: progress.correctAnswers,
      weakTopics: (progress.weakTopics as string[]) ?? [],
      strongTopics: (progress.strongTopics as string[]) ?? [],
      lastActivityAt: progress.lastActivityAt,
      noData: false,
      levelNote,
    };
  }

  async getQuizHistory(userId: string) {
    const { aisSubjectId } = await this.requireActiveSubject(userId);

    const attempts = await this.prisma.aisQuizAttempt.findMany({
      where: { userId, aisSubjectId },
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

    return { aisSubjectId, attempts };
  }
}
