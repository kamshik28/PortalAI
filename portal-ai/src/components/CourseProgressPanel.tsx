// src/components/CourseProgressPanel.tsx
//
// Displays the student's learning progress for a specific course:
//   - Estimated level (beginner / intermediate / advanced)
//   - Average score, total quizzes, total questions
//   - Weak and strong topics
//   - Recent quiz history (last 20 attempts)

"use client";

import { useEffect, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ProgressData = {
    estimatedLevel: string;
    scoreAvg: number;
    totalQuizzes: number;
    totalQuestions: number;
    correctAnswers: number;
    weakTopics: string[];
    strongTopics: string[];
    lastActivityAt: string | null;
    noData?: boolean;
};

type QuizAttemptSummary = {
    id: string;
    quizType: string;
    topic: string | null;
    totalQuestions: number;
    correctAnswers: number;
    score: number;
    startedAt: string;
    finishedAt: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function levelLabel(level: string): string {
    return level === "advanced" ? "Expert" : level === "intermediate" ? "Pokročilý" : "Začiatočník";
}

function levelColor(level: string): string {
    if (level === "advanced") return "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300";
    if (level === "intermediate") return "border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300";
    return "border-blue-500/30 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300";
}

function scoreBarColor(pct: number): string {
    if (pct >= 80) return "bg-emerald-500";
    if (pct >= 50) return "bg-amber-500";
    return "bg-red-500";
}

function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString("sk-SK", { day: "numeric", month: "short", year: "numeric" });
}

function formatScore(n: number): string {
    return n % 1 === 0 ? String(n) : n.toFixed(1);
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
    return (
        <svg className="h-5 w-5 animate-spin text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CourseProgressPanel({ courseId }: { courseId: string }) {
    const [progress, setProgress] = useState<ProgressData | null>(null);
    const [history, setHistory] = useState<QuizAttemptSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [progRes, histRes] = await Promise.all([
                fetch(`/api/student/courses/${courseId}/progress`),
                fetch(`/api/student/courses/${courseId}/quiz-history`),
            ]);

            if (progRes.ok) {
                const data = await progRes.json().catch(() => null) as ProgressData | null;
                if (data) setProgress(data);
            } else {
                setError("Nepodarilo sa načítať pokrok.");
            }

            if (histRes.ok) {
                const data = await histRes.json().catch(() => null) as { attempts?: QuizAttemptSummary[] } | null;
                setHistory(data?.attempts ?? []);
            }
        } catch {
            setError("Chyba siete.");
        } finally {
            setLoading(false);
        }
    }, [courseId]);

    useEffect(() => { void loadData(); }, [loadData]);

    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Spinner /> Načítavam pokrok…
            </div>
        );
    }

    if (error) {
        return (
            <div className="space-y-3">
                <div className="rounded-xl border border-red-500/30 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</div>
                <button type="button" onClick={loadData}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Skúsiť znova
                </button>
            </div>
        );
    }

    if (!progress || progress.noData) {
        return (
            <div className="rounded-xl border border-border bg-muted/30 px-5 py-8 text-center space-y-2">
                <p className="text-2xl">📊</p>
                <p className="text-sm font-medium text-foreground">Zatiaľ žiadne dáta</p>
                <p className="text-xs text-muted-foreground">
                    Absolvuj prvý kvíz, aby sa tu zobrazil tvoj pokrok.
                </p>
            </div>
        );
    }

    const pct = Math.round(progress.scoreAvg * 100);

    return (
        <div className="space-y-5">
            {/* Level + score */}
            <div className="grid gap-3 sm:grid-cols-2">
                {/* Level card */}
                <div className="rounded-xl border border-border bg-card shadow-sm dark:shadow-none px-5 py-4 flex flex-col gap-2">
                    <p className="text-xs text-muted-foreground">Odhadovaná úroveň</p>
                    <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${levelColor(progress.estimatedLevel)}`}>
                            {levelLabel(progress.estimatedLevel)}
                        </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-auto">
                        Na základe {progress.totalQuizzes} kvíz{progress.totalQuizzes === 1 ? "u" : "ov"} ({progress.totalQuestions} otázok)
                    </p>
                </div>

                {/* Score card */}
                <div className="rounded-xl border border-border bg-card shadow-sm dark:shadow-none px-5 py-4 flex flex-col gap-3">
                    <p className="text-xs text-muted-foreground">Priemerné skóre</p>
                    <div className="flex items-end gap-2">
                        <span className="text-3xl font-bold text-foreground tabular-nums">{pct}%</span>
                        <span className="text-xs text-muted-foreground mb-1">
                            {formatScore(progress.correctAnswers)} / {progress.totalQuestions} bodov
                        </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${scoreBarColor(pct)}`}
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Topics */}
            {(progress.strongTopics.length > 0 || progress.weakTopics.length > 0) && (
                <div className="grid gap-3 sm:grid-cols-2">
                    {/* Strong */}
                    {progress.strongTopics.length > 0 && (
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/5 px-4 py-3">
                            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-2">✓ Silné témy</p>
                            <div className="flex flex-wrap gap-1.5">
                                {progress.strongTopics.map((t) => (
                                    <span key={t} className="text-xs px-2 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 truncate max-w-[180px]" title={t}>
                                        {t}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Weak */}
                    {progress.weakTopics.length > 0 && (
                        <div className="rounded-xl border border-red-500/20 bg-red-50 dark:bg-red-500/5 px-4 py-3">
                            <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-2">✗ Slabé témy</p>
                            <div className="flex flex-wrap gap-1.5">
                                {progress.weakTopics.map((t) => (
                                    <span key={t} className="text-xs px-2 py-0.5 rounded-full border border-red-500/20 bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300 truncate max-w-[180px]" title={t}>
                                        {t}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Quiz history */}
            {history.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">História kvízov</p>
                    <div className="space-y-1.5">
                        {history.map((attempt) => {
                            const aPct = attempt.totalQuestions > 0
                                ? Math.round((attempt.correctAnswers / attempt.totalQuestions) * 100)
                                : 0;
                            const color =
                                aPct >= 80 ? "text-emerald-700 dark:text-emerald-300"
                                : aPct >= 50 ? "text-amber-700 dark:text-amber-300"
                                : "text-red-700 dark:text-red-300";
                            return (
                                <div key={attempt.id}
                                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
                                    <div className="flex flex-col gap-0.5 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs px-1.5 py-0.5 rounded-full border border-border text-muted-foreground capitalize">
                                                {attempt.quizType}
                                            </span>
                                            {attempt.topic && (
                                                <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={attempt.topic}>
                                                    {attempt.topic}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                            {formatDate(attempt.startedAt)} · {attempt.totalQuestions} otázok
                                        </span>
                                    </div>
                                    <div className={`text-sm font-semibold tabular-nums shrink-0 ${color}`}>
                                        {formatScore(attempt.correctAnswers)} / {attempt.totalQuestions}
                                        <span className="text-xs font-normal text-muted-foreground ml-1">({aPct}%)</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Last activity */}
            {progress.lastActivityAt && (
                <p className="text-xs text-muted-foreground text-right">
                    Posledná aktivita: {formatDate(progress.lastActivityAt)}
                </p>
            )}

            {/* Refresh */}
            <button type="button" onClick={loadData}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                ↻ Obnoviť
            </button>
        </div>
    );
}
