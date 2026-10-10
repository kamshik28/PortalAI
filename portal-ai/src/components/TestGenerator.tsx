// src/components/TestGenerator.tsx
// Teacher-only component — renders a form to generate test questions via
// Flowise, then displays the AI-generated result with source references.

"use client";

import { useState, FormEvent } from "react";
import {
    ClipboardListIcon,
    LoaderIcon,
    AlertCircleIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    CopyIcon,
    CheckIcon,
} from "lucide-react";
import toast from "react-hot-toast";

type SourceDoc = {
    pageContent?: string;
    metadata?: { source?: string; [key: string]: unknown };
};

type DebugInfo = {
    flowiseChatId: string | null;
    sourceCount: number;
    sources: string[];
    ragUsed: boolean;
    agentName: string | null;
    allAgents: string[];
    toolsUsed: string[];
    // v2 execution trace fields
    executedNodeNames: string[];
    executedNodeIds: string[];
    testGeneratorReached: boolean;
    retrieverOrKnowledgeReached: boolean;
    intentSent: string;
    courseId: string;
    note: string | null;
};

type GenerateResult = {
    text: string;
    sourceDocuments: SourceDoc[];
    debug: DebugInfo | null;
    // True when the backend guard rejected the test because 0 sources were returned.
    ragRejected?: boolean;
    rejectionMessage?: string | null;
};

// ── Minimal markdown → HTML converter ──────────────────────────────────────
// Handles the subset Flowise typically returns: headings, bold, italic,
// numbered/bullet lists, horizontal rules, and line breaks.
// Safe: no <script> injection — all content comes from Flowise, not users.
function markdownToHtml(md: string): string {
    return (
        md
            // Code blocks (```) — render as <pre><code>
            .replace(/```[\w]*\n?([\s\S]*?)```/g, "<pre class=\"bg-white/5 rounded-lg p-3 my-3 overflow-x-auto text-xs\"><code>$1</code></pre>")
            // Inline code
            .replace(/`([^`]+)`/g, "<code class=\"bg-white/10 rounded px-1 py-0.5 text-xs font-mono\">$1</code>")
            // Headings
            .replace(/^### (.+)$/gm, "<h3 class=\"text-sm font-semibold text-white mt-4 mb-1\">$1</h3>")
            .replace(/^## (.+)$/gm, "<h2 class=\"text-base font-semibold text-white mt-5 mb-2\">$1</h2>")
            .replace(/^# (.+)$/gm, "<h1 class=\"text-lg font-bold text-white mt-5 mb-2\">$1</h1>")
            // Bold + italic
            .replace(/\*\*\*(.+?)\*\*\*/g, "<strong class=\"font-semibold text-white\"><em>$1</em></strong>")
            .replace(/\*\*(.+?)\*\*/g, "<strong class=\"font-semibold text-white\">$1</strong>")
            .replace(/\*(.+?)\*/g, "<em class=\"italic text-neutral-300\">$1</em>")
            // Horizontal rule
            .replace(/^---$/gm, "<hr class=\"border-white/10 my-4\" />")
            // Numbered list items (e.g. "1. Question text")
            .replace(
                /^(\d+)\. (.+)$/gm,
                "<div class=\"mt-3 mb-1\"><span class=\"font-semibold text-emerald-400\">$1.</span> <span class=\"text-neutral-100\">$2</span></div>",
            )
            // Answer option lines (A) B) C) D))
            .replace(
                /^([A-D]\)) (.+)$/gm,
                "<div class=\"ml-4 text-neutral-300\"><span class=\"font-mono text-neutral-400\">$1</span> $2</div>",
            )
            // Bullet list items
            .replace(/^[*-] (.+)$/gm, "<div class=\"ml-2 mt-1 text-neutral-300\">• $1</div>")
            // Double newline → paragraph gap
            .replace(/\n\n/g, "<br/>")
            // Single newline → line break
            .replace(/\n/g, "<br/>")
    );
}

export default function TestGenerator({ courseId }: { courseId: string }) {
    const [count, setCount] = useState(5);
    const [questionType, setQuestionType] = useState<"mcq" | "open" | "mixed">("mixed");
    const [topic, setTopic] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<GenerateResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showSources, setShowSources] = useState(false);
    const [showDebug, setShowDebug] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleGenerate = async (e: FormEvent) => {
        e.preventDefault();
        if (!courseId || loading) return;

        setLoading(true);
        setResult(null);
        setError(null);

        try {
            const res = await fetch(`/api/teacher/courses/${courseId}/generate-test`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ count, questionType, topic: topic.trim() }),
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data: any = await res.json().catch(() => null);

            if (!res.ok) {
                const msg: string =
                    data?.message ?? "Generovanie testu zlyhalo. Skús znova.";
                setError(msg);
                toast.error(msg);
                return;
            }

            // Backend RAG guard: 0 sources → rejected, debug panel still shown.
            if (data?.ragRejected) {
                setResult({
                    text: "",
                    sourceDocuments: [],
                    debug: (data.debug as DebugInfo) ?? null,
                    ragRejected: true,
                    rejectionMessage:
                        typeof data.message === "string"
                            ? data.message
                            : "Test nebol vygenerovaný z materiálov kurzu.",
                });
                setShowDebug(true); // open debug automatically so teacher can diagnose
                return;
            }

            if (!data?.text) {
                setError("AI nevrátilo žiadny výsledok. Skontroluj, či má kurz nahrané materiály.");
                return;
            }

            setResult({
                text: data.text as string,
                sourceDocuments: (data.sourceDocuments ?? []) as SourceDoc[],
                debug: (data.debug as DebugInfo) ?? null,
            });
            setShowDebug(false);
        } catch {
            const msg = "Nepodarilo sa spojiť so serverom.";
            setError(msg);
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async () => {
        if (!result?.text) return;
        try {
            await navigator.clipboard.writeText(result.text);
            setCopied(true);
            toast.success("Skopírované do schránky");
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Kopírovanie zlyhalo");
        }
    };

    return (
        <div className="space-y-5">
            {/* ── Form ── */}
            <form onSubmit={handleGenerate} className="grid gap-4 sm:grid-cols-12">
                {/* Question count */}
                <div className="sm:col-span-3 space-y-1.5">
                    <label className="block text-sm font-medium text-neutral-300">
                        Počet otázok
                    </label>
                    <select
                        className="select-dark"
                        value={count}
                        onChange={(e) => setCount(Number(e.target.value))}
                        disabled={loading}
                    >
                        {[3, 5, 8, 10, 15, 20].map((n) => (
                            <option key={n} value={n}>
                                {n}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Question type */}
                <div className="sm:col-span-4 space-y-1.5">
                    <label className="block text-sm font-medium text-neutral-300">
                        Typ otázok
                    </label>
                    <select
                        className="select-dark"
                        value={questionType}
                        onChange={(e) =>
                            setQuestionType(e.target.value as "mcq" | "open" | "mixed")
                        }
                        disabled={loading}
                    >
                        <option value="mcq">Výber z možností (A/B/C/D)</option>
                        <option value="open">Otvorené otázky</option>
                        <option value="mixed">Zmiešané</option>
                    </select>
                </div>

                {/* Optional topic */}
                <div className="sm:col-span-5 space-y-1.5">
                    <label className="block text-sm font-medium text-neutral-300">
                        Téma{" "}
                        <span className="font-normal text-neutral-500">(voliteľné)</span>
                    </label>
                    <input
                        type="text"
                        className="input-dark"
                        placeholder="napr. optické vlákna, kryptografia…"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        disabled={loading}
                        maxLength={200}
                    />
                </div>

                {/* Submit */}
                <div className="sm:col-span-12">
                    <button type="submit" disabled={loading} className="btn-primary">
                        {loading ? (
                            <>
                                <LoaderIcon className="h-4 w-4 animate-spin" />
                                Generujem test…
                            </>
                        ) : (
                            <>
                                <ClipboardListIcon className="h-4 w-4" />
                                Generovať test
                            </>
                        )}
                    </button>
                </div>
            </form>

            {/* ── Disclaimer ── */}
            {!result && !loading && (
                <p className="text-xs text-neutral-500">
                    Otázky sú generované výlučne z materiálov kurzu cez AI. Čas generovania
                    môže byť 10–30 sekúnd.
                </p>
            )}

            {/* ── Error ── */}
            {error && !loading && (
                <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3">
                    <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                    <p className="text-sm text-red-300">{error}</p>
                </div>
            )}

            {/* ── Result ── */}
            {result && (
                <div className="space-y-3">
                    {result.ragRejected ? (
                        /* ── Rejection banner — no real sources were returned ── */
                        <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3">
                            <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                            <div>
                                <p className="text-sm font-medium text-amber-300">
                                    Test nebol prijatý
                                </p>
                                <p className="mt-0.5 text-xs text-amber-300/70">
                                    {result.rejectionMessage}
                                </p>
                            </div>
                        </div>
                    ) : (
                        /* ── Valid generated test ── */
                        <>
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-medium text-neutral-400">
                                    Vygenerovaný test
                                </p>
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    className="btn-ghost text-xs px-2.5 py-1.5"
                                    title="Kopírovať do schránky"
                                >
                                    {copied ? (
                                        <CheckIcon className="h-3.5 w-3.5 text-emerald-400" />
                                    ) : (
                                        <CopyIcon className="h-3.5 w-3.5" />
                                    )}
                                    {copied ? "Skopírované" : "Kopírovať"}
                                </button>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-black/30 p-5 overflow-x-auto">
                                <div
                                    className="text-sm text-neutral-200 leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: markdownToHtml(result.text) }}
                                />
                            </div>
                        </>
                    )}

                    {/* ── Debug / Zdroje panel (always rendered) ── */}
                    <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3">
                        {/* Collapsed header — always visible */}
                        <button
                            type="button"
                            className="flex w-full items-center justify-between text-xs font-medium text-neutral-400 hover:text-neutral-200 transition"
                            onClick={() => setShowDebug((s) => !s)}
                        >
                            <span className="flex items-center gap-2">
                                <span>Debug / Zdroje</span>
                                {/* RAG status pill */}
                                {result.debug?.ragUsed ? (
                                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                                        RAG ✓ {result.debug.sourceCount} úryvkov
                                    </span>
                                ) : (
                                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                                        RAG — bez zdrojov
                                    </span>
                                )}
                                {/* Agent name pill */}
                                {result.debug?.agentName ? (
                                    <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-400">
                                        {result.debug.agentName}
                                    </span>
                                ) : (
                                    <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
                                        agent: unknown
                                    </span>
                                )}
                            </span>
                            {showDebug ? (
                                <ChevronUpIcon className="h-3.5 w-3.5 shrink-0" />
                            ) : (
                                <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" />
                            )}
                        </button>

                        {/* Expanded detail */}
                        {showDebug && result.debug && (
                            <div className="mt-3 space-y-3 border-t border-white/8 pt-3">

                                {/* Intent sent */}
                                <div>
                                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                        Intent odoslaný do Flowise
                                    </p>
                                    <p className="rounded-lg bg-white/5 px-3 py-2 font-mono text-xs text-neutral-300 break-words">
                                        {result.debug.intentSent}
                                    </p>
                                </div>

                                {/* Executed node chain */}
                                <div>
                                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                        Spustené uzly (agentflow trace)
                                    </p>
                                    {result.debug.executedNodeNames.length > 0 ? (
                                        <p className="font-mono text-xs text-sky-300 break-words">
                                            {result.debug.executedNodeNames.join(" → ")}
                                        </p>
                                    ) : result.debug.executedNodeIds.length > 0 ? (
                                        <p className="font-mono text-xs text-neutral-500 break-words">
                                            {result.debug.executedNodeIds.join(" → ")}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-neutral-500 italic">
                                            neznáme — Flowise nevrátil názvy uzlov
                                        </p>
                                    )}
                                </div>

                                {/* Diagnostics: TestGeneratorAgent + retriever */}
                                <div>
                                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                        Diagnostika pipeline
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${result.debug.testGeneratorReached ? "bg-emerald-500/15 text-emerald-400" : "bg-white/8 text-neutral-500"}`}>
                                            {result.debug.testGeneratorReached ? "✓" : "✗"} TestGeneratorAgent
                                        </span>
                                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${result.debug.retrieverOrKnowledgeReached ? "bg-emerald-500/15 text-emerald-400" : "bg-white/8 text-neutral-500"}`}>
                                            {result.debug.retrieverOrKnowledgeReached ? "✓" : "✗"} Retriever/Knowledge
                                        </span>
                                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${result.debug.ragUsed ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
                                            {result.debug.ragUsed ? "✓" : "✗"} RAG zdroje
                                        </span>
                                    </div>
                                </div>

                                {/* Tools */}
                                <div>
                                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                        Použité nástroje
                                    </p>
                                    {result.debug.toolsUsed.length > 0 ? (
                                        <div className="flex flex-wrap gap-1">
                                            {result.debug.toolsUsed.map((t) => (
                                                <span
                                                    key={t}
                                                    className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-mono text-neutral-400"
                                                >
                                                    {t}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-neutral-500 italic">
                                            žiadne (Flowise nevrátil usedTools)
                                        </p>
                                    )}
                                </div>

                                {/* Sources */}
                                <div>
                                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                        Zdroje ({result.debug.sourceCount} úryvkov
                                        {result.debug.sources.length > 0
                                            ? `, ${result.debug.sources.length} súborov`
                                            : ""}
                                        )
                                    </p>
                                    {result.debug.sources.length > 0 ? (
                                        <ul className="space-y-0.5">
                                            {result.debug.sources.map((src, i) => (
                                                <li
                                                    key={i}
                                                    className="text-xs text-neutral-400 truncate"
                                                    title={src}
                                                >
                                                    {src}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-xs text-amber-400/80 italic">
                                            Žiadne zdroje — test môže byť generovaný zo
                                            všeobecných znalostí. Skontroluj, či sú materiály
                                            kurzu nahrané a naindexované.
                                        </p>
                                    )}
                                </div>

                                {/* Flowise chat ID */}
                                {result.debug.flowiseChatId && (
                                    <div>
                                        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                            Flowise chatId
                                        </p>
                                        <p className="font-mono text-[10px] text-neutral-600">
                                            {result.debug.flowiseChatId}
                                        </p>
                                    </div>
                                )}

                                {/* Note if agent is unknown */}
                                {result.debug.note && (
                                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2">
                                        <p className="text-[10px] text-amber-300/80">
                                            ℹ️ {result.debug.note}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Regenerate hint */}
                    <p className="text-xs text-neutral-600">
                        Nie si spokojný s výsledkom? Zmeň nastavenia a generuj znova.
                    </p>
                </div>
            )}
        </div>
    );
}
