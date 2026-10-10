// src/components/CourseQuizPanel.tsx
//
// Interactive quiz panel for students inside a regular (teacher-created) course.
// Calls POST /api/student/courses/[courseId]/quiz/generate for quiz generation,
// POST /api/student/courses/[courseId]/quiz/evaluate-open for per-question eval,
// and POST /api/student/courses/[courseId]/quiz/submit to persist the attempt.
//
// Phases:
//   idle        → configuration form
//   loading     → spinner while generating
//   error       → error banner (retryable)
//   running     → one question at a time
//   evaluating  → AI evaluates open answers
//   submitting  → persisting attempt to DB
//   done        → summary with score + updated progress snapshot

"use client";

import { useRef, useEffect, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type QuizQuestion = {
    id: number;
    type: "mcq" | "open";
    question: string;
    options?: { A: string; B: string; C: string; D: string };
    answer?: string;
    modelAnswer?: string;
    explanation?: string;
    source?: string;
};

type QuizData = {
    courseId: string;
    course: { name: string; code: string | null };
    questions: QuizQuestion[];
    meta?: { sourceFiles: string[]; retrievedChunks: number };
};

type EvaluationResult = {
    status: "correct" | "partially_correct" | "incorrect";
    score: 0 | 0.5 | 1;
    feedback: string;
    matchedConcepts: string[];
    missingConcepts: string[];
};

type QuestionAnswer = {
    questionId: number;
    type: "mcq" | "open";
    selected?: string;
    submitted?: boolean;
    correct?: boolean;
    studentAnswer?: string;
    submittedOpen?: boolean;
    evaluation?: EvaluationResult;
    evalError?: boolean;
};

type ProgressSnapshot = {
    estimatedLevel: string;
    scoreAvg: number;
    totalQuizzes: number;
};

type Phase =
    | { name: "idle" }
    | { name: "loading" }
    | { name: "error"; message: string }
    | { name: "running"; quiz: QuizData; currentIdx: number; answers: QuestionAnswer[] }
    | { name: "evaluating"; quiz: QuizData; answers: QuestionAnswer[] }
    | { name: "submitting"; quiz: QuizData; answers: QuestionAnswer[] }
    | { name: "done"; quiz: QuizData; answers: QuestionAnswer[]; progress?: ProgressSnapshot };

// ── UI helpers ────────────────────────────────────────────────────────────────

function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
    const cls = size === "sm" ? "h-3 w-3" : size === "lg" ? "h-6 w-6" : "h-4 w-4";
    return (
        <svg className={`${cls} animate-spin`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
    );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    return (
        <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-violet-500 transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
    );
}

function EvalBadge({ status }: { status: EvaluationResult["status"] }) {
    if (status === "correct")
        return <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">✓ Správne</span>;
    if (status === "partially_correct")
        return <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">◑ Čiastočne</span>;
    return <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border border-red-500/30 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300">✗ Nesprávne</span>;
}

function LevelBadge({ level }: { level: string }) {
    const map: Record<string, string> = {
        beginner:     "border-blue-500/30 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
        intermediate: "border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
        advanced:     "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    };
    const label: Record<string, string> = { beginner: "Začiatočník", intermediate: "Pokročilý", advanced: "Expert" };
    const cls = map[level] ?? "border-border bg-muted text-muted-foreground";
    return (
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
            {label[level] ?? level}
        </span>
    );
}

// ── Score helpers ─────────────────────────────────────────────────────────────

function calcScore(questions: QuizQuestion[], answers: QuestionAnswer[]): { earned: number; total: number } {
    let earned = 0;
    let total = 0;
    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const a = answers[i];
        if (!a) continue;
        total += 1;
        if (q.type === "mcq") {
            if (a.submitted && a.correct) earned += 1;
        } else {
            earned += a.evaluation?.score ?? 0;
        }
    }
    return { earned, total };
}

function formatScore(n: number): string {
    return n % 1 === 0 ? String(n) : n.toFixed(1);
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function apiGenerateQuiz(
    courseId: string,
    count: number,
    questionType: "mixed" | "mcq" | "open",
    topic: string,
): Promise<QuizData> {
    const res = await fetch(`/api/student/courses/${courseId}/quiz/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, questionType, topic: topic.trim() || undefined }),
    });
    const data = await res.json().catch(() => null) as Record<string, unknown> | null;

    if (!res.ok) {
        const msg = typeof data?.message === "string" ? data.message : `Chyba ${res.status}`;
        throw new Error(msg);
    }
    if (!Array.isArray((data as QuizData | null)?.questions)) {
        throw new Error("Server nevrátil platný kvíz.");
    }
    return data as unknown as QuizData;
}

async function apiEvaluateOpen(
    courseId: string,
    q: QuizQuestion,
    studentAnswer: string,
): Promise<EvaluationResult> {
    const res = await fetch(`/api/student/courses/${courseId}/quiz/evaluate-open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            question: q.question,
            studentAnswer,
            modelAnswer: q.modelAnswer ?? "",
            explanation: q.explanation,
        }),
    });
    if (!res.ok) throw new Error(`Hodnotenie zlyhalo (${res.status})`);
    return await res.json() as EvaluationResult;
}

async function apiSubmitAttempt(
    courseId: string,
    quiz: QuizData,
    answers: QuestionAnswer[],
    questionType: "mixed" | "mcq" | "open",
    topic: string,
): Promise<ProgressSnapshot | undefined> {
    const answerPayloads = quiz.questions.map((q, i) => {
        const a = answers[i];
        return {
            questionId: q.id,
            questionText: q.question,
            questionType: q.type,
            userAnswer: q.type === "mcq" ? a?.selected : a?.studentAnswer,
            correctAnswer: q.type === "mcq" ? q.answer : q.modelAnswer,
            isCorrect: q.type === "mcq" ? (a?.correct ?? false) : undefined,
            source: q.source,
            evaluation: q.type === "open" ? a?.evaluation : undefined,
        };
    });

    const res = await fetch(`/api/student/courses/${courseId}/quiz/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            quizType: questionType,
            topic: topic.trim() || undefined,
            questions: quiz.questions,
            answers: answerPayloads,
        }),
    });

    if (!res.ok) return undefined;
    const data = await res.json().catch(() => null) as Record<string, unknown> | null;
    const prog = data?.progress as Record<string, unknown> | undefined;
    if (!prog) return undefined;
    return {
        estimatedLevel: typeof prog.estimatedLevel === "string" ? prog.estimatedLevel : "beginner",
        scoreAvg: typeof prog.scoreAvg === "number" ? prog.scoreAvg : 0,
        totalQuizzes: typeof prog.totalQuizzes === "number" ? prog.totalQuizzes : 1,
    };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CourseQuizPanel({
    courseId,
    courseName,
}: {
    courseId: string;
    courseName?: string;
}) {
    const [phase, setPhase] = useState<Phase>({ name: "idle" });
    const [count, setCount] = useState(5);
    const [questionType, setQuestionType] = useState<"mixed" | "mcq" | "open">("mixed");
    const [topic, setTopic] = useState("");
    const topRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (phase.name !== "idle") topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, [phase.name]);

    // ── Generate ──────────────────────────────────────────────────────────────

    const generateQuiz = useCallback(async () => {
        setPhase({ name: "loading" });
        try {
            const quiz = await apiGenerateQuiz(courseId, count, questionType, topic);
            if (quiz.questions.length === 0) {
                setPhase({ name: "error", message: "Kvíz neobsahuje žiadne otázky. Skús znova." });
                return;
            }
            setPhase({
                name: "running",
                quiz,
                currentIdx: 0,
                answers: quiz.questions.map((q) => ({ questionId: q.id, type: q.type })),
            });
        } catch (e) {
            setPhase({ name: "error", message: e instanceof Error ? e.message : "Neznáma chyba." });
        }
    }, [courseId, count, questionType, topic]);

    // ── Finish — evaluate open answers, then submit ───────────────────────────

    const finishQuiz = useCallback(async (p: Phase & { name: "running" }) => {
        const { quiz, answers } = p;
        setPhase({ name: "evaluating", quiz, answers });

        const nextAnswers = [...answers];
        const openIndexes = quiz.questions
            .map((q, i) => ({ q, i }))
            .filter(({ q }) => q.type === "open");

        // Parallel AI evaluation for open questions
        if (openIndexes.length > 0) {
            await Promise.all(
                openIndexes.map(async ({ q, i }) => {
                    const a = nextAnswers[i];
                    const studentAnswer = (a?.studentAnswer ?? "").trim();
                    if (!studentAnswer) {
                        nextAnswers[i] = {
                            ...a,
                            evaluation: { status: "incorrect", score: 0, feedback: "Bez odpovede.", matchedConcepts: [], missingConcepts: [] },
                        };
                        return;
                    }
                    try {
                        const result = await apiEvaluateOpen(courseId, q, studentAnswer);
                        nextAnswers[i] = { ...a, evaluation: result };
                    } catch {
                        nextAnswers[i] = {
                            ...a,
                            evalError: true,
                            evaluation: { status: "incorrect", score: 0, feedback: "Hodnotenie nedostupné.", matchedConcepts: [], missingConcepts: [] },
                        };
                    }
                }),
            );
        }

        // Submit attempt and get updated progress
        setPhase({ name: "submitting", quiz, answers: nextAnswers });
        const progress = await apiSubmitAttempt(courseId, quiz, nextAnswers, questionType, topic).catch(() => undefined);

        setPhase({ name: "done", quiz, answers: nextAnswers, progress });
    }, [courseId, questionType, topic]);

    // ── Running helpers ───────────────────────────────────────────────────────

    function patchAnswer(p: Phase & { name: "running" }, idx: number, patch: Partial<QuestionAnswer>) {
        const next = [...p.answers];
        next[idx] = { ...next[idx], ...patch };
        setPhase({ ...p, answers: next });
    }

    function canAdvance(p: Phase & { name: "running" }): boolean {
        const q = p.quiz.questions[p.currentIdx];
        const a = p.answers[p.currentIdx];
        if (q.type === "mcq") return a?.submitted === true;
        return a?.submittedOpen === true;
    }

    // ── Renders ───────────────────────────────────────────────────────────────

    function renderIdle() {
        return (
            <div className="space-y-5">
                <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">Generovať kvíz</h3>
                    <p className="text-xs text-muted-foreground">
                        Kvíz bude vygenerovaný z materiálov kurzu
                        {courseName ? <> <span className="font-medium text-foreground">{courseName}</span></> : null}.
                        Výsledky sa automaticky uložia do tvojho postupu.
                    </p>
                </div>

                {/* Count */}
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Počet otázok</label>
                    <div className="flex items-center gap-3">
                        <input type="range" min={2} max={10} step={1} value={count}
                            onChange={(e) => setCount(Number(e.target.value))}
                            className="flex-1 accent-violet-500" />
                        <span className="w-6 text-center text-sm font-semibold text-foreground">{count}</span>
                    </div>
                </div>

                {/* Type */}
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Typ otázok</label>
                    <div className="flex gap-2 flex-wrap">
                        {(["mixed", "mcq", "open"] as const).map((t) => (
                            <button key={t} type="button" onClick={() => setQuestionType(t)}
                                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                    questionType === t
                                        ? "border-violet-500/50 bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                                        : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                                }`}>
                                {t === "mixed" ? "Zmiešané" : t === "mcq" ? "Výber z možností" : "Otvorené"}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Topic */}
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                        Téma <span className="text-muted-foreground/70">(voliteľné)</span>
                    </label>
                    <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
                        placeholder="Napr. normálne formy, rekurzia…"
                        maxLength={200}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500/40" />
                </div>

                <button type="button" onClick={generateQuiz}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-600 bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 active:scale-[0.98] dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20">
                    Spustiť kvíz
                </button>
            </div>
        );
    }

    function renderLoading(msg = "Generujem kvíz z materiálov kurzu…") {
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <Spinner size="lg" />
                <p className="text-sm text-muted-foreground">{msg}</p>
                <p className="text-xs text-muted-foreground">Môže to trvať 10–20 sekúnd</p>
            </div>
        );
    }

    function renderError(p: Phase & { name: "error" }) {
        return (
            <div className="space-y-4">
                <div className="rounded-xl border border-red-500/30 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
                    {p.message}
                </div>
                <button type="button" onClick={() => setPhase({ name: "idle" })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors">
                    ← Späť
                </button>
            </div>
        );
    }

    function renderRunning(p: Phase & { name: "running" }) {
        const { quiz, currentIdx, answers } = p;
        const total = quiz.questions.length;
        const q = quiz.questions[currentIdx];
        const a = answers[currentIdx] ?? { questionId: q.id, type: q.type };
        const isLast = currentIdx === total - 1;
        const advance = canAdvance(p);

        return (
            <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                        Otázka <span className="text-foreground font-semibold">{currentIdx + 1}</span> / {total}
                    </span>
                    <button type="button" onClick={() => setPhase({ name: "idle" })}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                        ✕ Ukončiť
                    </button>
                </div>

                <ProgressBar current={currentIdx} total={total} />

                {/* Question card */}
                <div className="rounded-xl border border-border bg-muted/20 px-5 py-4 space-y-4">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${
                        q.type === "mcq"
                            ? "border-blue-500/30 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                            : "border-purple-500/30 bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300"
                    }`}>
                        {q.type === "mcq" ? "Výber z možností" : "Otvorená otázka"}
                    </span>

                    <p className="text-sm font-medium text-foreground leading-relaxed">{q.question}</p>

                    {q.source && (
                        <p className="text-xs text-muted-foreground">Zdroj: <span className="text-muted-foreground">{q.source}</span></p>
                    )}

                    {/* MCQ */}
                    {q.type === "mcq" && q.options && (
                        <div className="space-y-2">
                            {(["A", "B", "C", "D"] as const).map((letter) => {
                                const isSelected = a.selected === letter;
                                const isCorrect  = a.submitted && q.answer === letter;
                                const isWrong    = a.submitted && isSelected && q.answer !== letter;
                                return (
                                    <button key={letter} type="button"
                                        disabled={a.submitted === true}
                                        onClick={() => { if (!a.submitted) patchAnswer(p, currentIdx, { selected: letter }); }}
                                        className={`w-full text-left flex items-start gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${
                                            isWrong    ? "border-red-500/50 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300 cursor-default"
                                            : isCorrect ? "border-emerald-500/50 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 cursor-default"
                                            : isSelected ? "border-sky-500/50 bg-sky-50 text-foreground dark:border-white/30 dark:bg-white/8 cursor-default"
                                            : a.submitted ? "border-border text-muted-foreground cursor-default"
                                            : "border-border text-foreground hover:border-border hover:bg-muted cursor-pointer"
                                        }`}>
                                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                                            isWrong ? "border-red-600 text-red-600 dark:border-red-400 dark:text-red-400"
                                            : isCorrect ? "border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400"
                                            : isSelected ? "border-sky-600 text-sky-600 dark:border-white dark:text-white"
                                            : "border-border text-muted-foreground"
                                        }`}>{letter}</span>
                                        <span className="flex-1 leading-relaxed">{q.options?.[letter]}</span>
                                        {isCorrect && <span className="shrink-0 text-emerald-600 dark:text-emerald-400">✓</span>}
                                        {isWrong   && <span className="shrink-0 text-red-600 dark:text-red-400">✗</span>}
                                    </button>
                                );
                            })}

                            {!a.submitted ? (
                                <button type="button" disabled={!a.selected}
                                    onClick={() => {
                                        const correct = a.selected === q.answer;
                                        patchAnswer(p, currentIdx, { submitted: true, correct });
                                    }}
                                    className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-4 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-40 transition-colors">
                                    Odoslať odpoveď
                                </button>
                            ) : (
                                <div className={`rounded-lg border px-3 py-2.5 text-sm ${
                                    a.correct
                                        ? "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                                        : "border-red-500/30 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
                                }`}>
                                    {a.correct ? "✓ Správne!" : `✗ Nesprávne — správna odpoveď: ${q.answer}`}
                                    {q.explanation && <p className="mt-1 text-xs opacity-80">{q.explanation}</p>}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Open */}
                    {q.type === "open" && (
                        <div className="space-y-3">
                            <textarea
                                rows={4}
                                disabled={a.submittedOpen === true}
                                value={a.studentAnswer ?? ""}
                                onChange={(e) => patchAnswer(p, currentIdx, { studentAnswer: e.target.value })}
                                placeholder="Napíš svoju odpoveď…"
                                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500/40 resize-none disabled:opacity-60 disabled:cursor-default transition"
                            />
                            {!a.submittedOpen ? (
                                <button type="button"
                                    disabled={!(a.studentAnswer ?? "").trim()}
                                    onClick={() => patchAnswer(p, currentIdx, { submittedOpen: true })}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-4 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-40 transition-colors">
                                    Odoslať odpoveď
                                </button>
                            ) : (
                                <div className="rounded-lg border border-purple-500/20 bg-purple-50 px-3 py-2 text-xs text-purple-700 dark:bg-purple-500/8 dark:text-purple-300">
                                    ✓ Odpoveď zaznamenaná — AI vyhodnotí po skončení kvízu
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-between gap-2">
                    <button type="button" disabled={currentIdx === 0}
                        onClick={() => setPhase({ ...p, currentIdx: currentIdx - 1 })}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-default transition-colors">
                        ← Predchádzajúca
                    </button>

                    {isLast ? (
                        <button type="button" disabled={!advance}
                            onClick={() => finishQuiz(p)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-violet-600 bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-default transition-colors dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20">
                            Zobraziť výsledky →
                        </button>
                    ) : (
                        <button type="button" disabled={!advance}
                            onClick={() => setPhase({ ...p, currentIdx: currentIdx + 1 })}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-default transition-colors">
                            Ďalšia →
                        </button>
                    )}
                </div>

                {/* Dot navigator */}
                {total > 1 && (
                    <div className="flex justify-center gap-1.5 flex-wrap">
                        {quiz.questions.map((_, i) => {
                            const ans = answers[i];
                            const done = ans?.submitted || ans?.submittedOpen;
                            const wrong = ans?.submitted && ans?.correct === false;
                            const correct = ans?.submitted && ans?.correct === true;
                            return (
                                <button key={i} type="button"
                                    onClick={() => setPhase({ ...p, currentIdx: i })}
                                    title={`Otázka ${i + 1}`}
                                    className={`h-2 w-2 rounded-full transition-colors ${
                                        i === currentIdx ? "bg-foreground"
                                        : wrong ? "bg-red-500 dark:bg-red-400"
                                        : correct ? "bg-emerald-500 dark:bg-emerald-400"
                                        : done ? "bg-purple-500 dark:bg-purple-400"
                                        : "bg-muted-foreground/30"
                                    }`} />
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    function renderDone(p: Phase & { name: "done" }) {
        const { quiz, answers, progress } = p;
        const { earned, total } = calcScore(quiz.questions, answers);
        const pct = total > 0 ? Math.round((earned / total) * 100) : null;

        const scoreColor =
            pct === null ? "neutral"
            : pct >= 80 ? "green"
            : pct >= 50 ? "amber"
            : "red";

        const scoreMsg =
            pct === null ? null
            : pct >= 80 ? "Výborný výsledok! 🎉"
            : pct >= 50 ? "Dobrý základ — pokračuj v štúdiu."
            : "Zopakuj si materiál a skús znova.";

        return (
            <div className="space-y-5">
                {/* Score card */}
                <div className={`rounded-xl border px-5 py-4 text-center space-y-1.5 ${
                    scoreColor === "green"   ? "border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/8"
                    : scoreColor === "amber" ? "border-amber-500/30 bg-amber-50 dark:bg-amber-500/8"
                    : scoreColor === "red"   ? "border-red-500/30 bg-red-50 dark:bg-red-500/8"
                    : "border-border bg-muted/30"
                }`}>
                    {quiz.course.name && (
                        <p className="text-xs text-muted-foreground">
                            {quiz.course.code && <span className="font-mono font-semibold text-foreground">{quiz.course.code} — </span>}
                            {quiz.course.name}
                        </p>
                    )}
                    <p className={`text-4xl font-bold tabular-nums ${
                        scoreColor === "green" ? "text-emerald-700 dark:text-emerald-300"
                        : scoreColor === "amber" ? "text-amber-700 dark:text-amber-300"
                        : "text-red-700 dark:text-red-300"
                    }`}>
                        {formatScore(earned)} / {total}
                    </p>
                    {pct !== null && <p className="text-xs text-muted-foreground">{pct}% úspešnosť</p>}
                    {scoreMsg && <p className="text-sm font-medium text-foreground mt-1">{scoreMsg}</p>}

                    {quiz.meta && quiz.meta.sourceFiles.length > 1 && (
                        <p className="text-[11px] text-muted-foreground mt-2">
                            Zdroje: {quiz.meta.sourceFiles.join(", ")}
                        </p>
                    )}
                </div>

                {/* Progress snapshot */}
                {progress && (
                    <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                        <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Tvoj celkový pokrok</p>
                            <div className="flex items-center gap-2">
                                <LevelBadge level={progress.estimatedLevel} />
                                <span className="text-xs text-muted-foreground">
                                    {Math.round(progress.scoreAvg * 100)}% priemerné skóre · {progress.totalQuizzes} kvíz{progress.totalQuizzes === 1 ? "" : "ov"}
                                </span>
                            </div>
                        </div>
                        <span className="text-xs text-muted-foreground">Uložené ✓</span>
                    </div>
                )}

                {/* Q&A review */}
                <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Prehľad odpovedí</p>
                    {quiz.questions.map((q, i) => {
                        const a = answers[i];
                        return (
                            <div key={q.id} className="rounded-xl border border-border bg-muted/20 px-4 py-3 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-medium text-foreground leading-relaxed flex-1">
                                        <span className="text-muted-foreground mr-1.5">{i + 1}.</span>
                                        {q.question}
                                    </p>
                                    {q.type === "mcq" && a?.submitted && (
                                        <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border ${
                                            a.correct
                                                ? "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                                                : "border-red-500/30 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
                                        }`}>
                                            {a.correct ? "✓ Správne" : "✗ Nesprávne"}
                                        </span>
                                    )}
                                    {q.type === "open" && a?.evaluation && <EvalBadge status={a.evaluation.status} />}
                                    {q.type === "open" && !a?.evaluation && (
                                        <span className="shrink-0 text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                                            Bez odpovede
                                        </span>
                                    )}
                                </div>

                                {/* MCQ detail */}
                                {q.type === "mcq" && q.options && (
                                    <div className="space-y-0.5 text-xs">
                                        {a?.selected && (
                                            <p className="text-muted-foreground">
                                                Tvoja odpoveď:{" "}
                                                <span className={a.correct ? "text-emerald-700 dark:text-emerald-300 font-medium" : "text-red-700 dark:text-red-300 font-medium"}>
                                                    {a.selected}) {q.options[a.selected as keyof typeof q.options]}
                                                </span>
                                            </p>
                                        )}
                                        {!a?.correct && q.answer && (
                                            <p className="text-muted-foreground">
                                                Správna odpoveď:{" "}
                                                <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                                                    {q.answer}) {q.options[q.answer as keyof typeof q.options]}
                                                </span>
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Open detail */}
                                {q.type === "open" && (
                                    <div className="space-y-2">
                                        {a?.studentAnswer && (
                                            <div className="text-xs space-y-0.5">
                                                <p className="text-muted-foreground">Tvoja odpoveď:</p>
                                                <p className="text-foreground leading-relaxed whitespace-pre-wrap">{a.studentAnswer}</p>
                                            </div>
                                        )}
                                        {q.modelAnswer && (
                                            <div className="text-xs space-y-0.5">
                                                <p className="text-muted-foreground">Vzorová odpoveď:</p>
                                                <p className="text-foreground leading-relaxed">{q.modelAnswer}</p>
                                            </div>
                                        )}
                                        {a?.evaluation && (
                                            <div className={`rounded-lg border px-3 py-2 text-xs space-y-1 ${
                                                a.evaluation.status === "correct"
                                                    ? "border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/8"
                                                    : a.evaluation.status === "partially_correct"
                                                      ? "border-amber-500/20 bg-amber-50 dark:bg-amber-500/8"
                                                      : "border-red-500/20 bg-red-50 dark:bg-red-500/8"
                                            }`}>
                                                <p className={`font-medium ${
                                                    a.evaluation.status === "correct" ? "text-emerald-700 dark:text-emerald-300"
                                                    : a.evaluation.status === "partially_correct" ? "text-amber-700 dark:text-amber-300"
                                                    : "text-red-700 dark:text-red-300"
                                                }`}>
                                                    {a.evaluation.status === "correct" ? "✓ Správne"
                                                    : a.evaluation.status === "partially_correct" ? "◑ Čiastočne správne"
                                                    : "✗ Nesprávne"}{" "}
                                                    <span className="text-muted-foreground font-normal">({formatScore(a.evaluation.score)} b)</span>
                                                </p>
                                                <p className="text-foreground">{a.evaluation.feedback}</p>
                                                {a.evaluation.matchedConcepts.length > 0 && (
                                                    <p className="text-muted-foreground">✓ Správne pojmy: {a.evaluation.matchedConcepts.join(", ")}</p>
                                                )}
                                                {a.evaluation.missingConcepts.length > 0 && (
                                                    <p className="text-muted-foreground">✗ Chýbajúce pojmy: {a.evaluation.missingConcepts.join(", ")}</p>
                                                )}
                                                {a.evalError && (
                                                    <p className="text-muted-foreground">⚠ Hodnotenie prebehlo s chybou.</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {q.explanation && (
                                    <p className="text-xs text-muted-foreground leading-relaxed">{q.explanation}</p>
                                )}
                                {q.source && (
                                    <p className="text-[11px] text-muted-foreground">Zdroj: {q.source}</p>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-wrap">
                    <button type="button" onClick={() => setPhase({ name: "idle" })}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-violet-600 bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-700 transition-colors dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20">
                        Nový kvíz
                    </button>
                    <button type="button" onClick={() => {
                        setPhase({
                            name: "running",
                            quiz: p.quiz,
                            currentIdx: 0,
                            answers: p.quiz.questions.map((q) => ({ questionId: q.id, type: q.type })),
                        });
                    }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border px-5 py-2.5 text-sm text-muted-foreground hover:bg-muted transition-colors">
                        Zopakovať kvíz
                    </button>
                </div>
            </div>
        );
    }

    // ── Main render ───────────────────────────────────────────────────────────

    return (
        <div ref={topRef}>
            {phase.name === "idle"        && renderIdle()}
            {phase.name === "loading"     && renderLoading()}
            {phase.name === "error"       && renderError(phase)}
            {phase.name === "running"     && renderRunning(phase)}
            {phase.name === "evaluating"  && renderLoading("Vyhodnocujem otvorené odpovede…")}
            {phase.name === "submitting"  && renderLoading("Ukladám výsledky…")}
            {phase.name === "done"        && renderDone(phase)}
        </div>
    );
}
