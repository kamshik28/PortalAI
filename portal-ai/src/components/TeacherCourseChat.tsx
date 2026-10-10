// src/components/TeacherCourseChat.tsx
//
// Teacher-only course chat — fully custom shell (no Flowise embed).
//
// Architecture:
//   • All messages (normal chat + test generation) live in ONE React state array.
//   • Normal chat  → POST /api/v1/prediction/{CHATFLOW_ID} (goes through the
//     existing Next.js proxy which injects authToken/userRole/userId from cookies).
//   • Test generation → POST /api/teacher/courses/{courseId}/generate-test
//   • Both render in the same unified message list — no separate blocks.

"use client";

import {
    useState,
    useEffect,
    useMemo,
    useRef,
    FormEvent,
    KeyboardEvent,
} from "react";
import {
    BotIcon,
    ClipboardListIcon,
    AlertCircleIcon,
    LoaderIcon,
    CopyIcon,
    CheckIcon,
    XIcon,
    SendIcon,
} from "lucide-react";
import toast from "react-hot-toast";

const CHATFLOW_ID = "fe844743-dd08-4086-b0b0-c3db50ef5026";

// ── Types ─────────────────────────────────────────────────────────────────────
type ChatMsg = {
    id: string;
    role: "user" | "assistant";
    text: string;
    loading?: boolean;   // assistant: waiting for response
    isTest?: boolean;    // assistant: rendered as test result card
    isError?: boolean;   // assistant: error or RAG rejection
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function getCookie(name: string): string | null {
    if (typeof document === "undefined") return null;
    const found = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
    return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : null;
}

function uid(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Minimal markdown → HTML for chat messages. */
function mdToHtml(md: string): string {
    return md
        .replace(
            /```[\w]*\n?([\s\S]*?)```/g,
            '<pre class="bg-white/5 rounded-lg p-3 my-3 overflow-x-auto text-xs leading-relaxed"><code>$1</code></pre>',
        )
        .replace(
            /`([^`]+)`/g,
            '<code class="bg-white/10 rounded px-1 py-0.5 text-xs font-mono">$1</code>',
        )
        .replace(
            /^### (.+)$/gm,
            '<h3 class="text-sm font-semibold text-white mt-4 mb-1">$1</h3>',
        )
        .replace(
            /^## (.+)$/gm,
            '<h2 class="text-[15px] font-semibold text-white mt-5 mb-2">$1</h2>',
        )
        .replace(
            /^# (.+)$/gm,
            '<h1 class="text-base font-bold text-white mt-5 mb-2">$1</h1>',
        )
        .replace(
            /\*\*\*(.+?)\*\*\*/g,
            '<strong class="font-semibold text-white"><em>$1</em></strong>',
        )
        .replace(
            /\*\*(.+?)\*\*/g,
            '<strong class="font-semibold text-white">$1</strong>',
        )
        .replace(/\*(.+?)\*/g, '<em class="italic text-neutral-300">$1</em>')
        .replace(/^---$/gm, '<hr class="border-white/10 my-4" />')
        .replace(
            /^(\d+)\. (.+)$/gm,
            '<div class="mt-3 mb-0.5 flex gap-2 items-start"><span class="shrink-0 font-semibold text-neutral-300 min-w-[1.25rem]">$1.</span><span class="text-neutral-100">$2</span></div>',
        )
        .replace(
            /^([A-D]\)) (.+)$/gm,
            '<div class="ml-5 mt-1 text-neutral-300"><span class="font-mono text-neutral-400 mr-1.5">$1</span>$2</div>',
        )
        .replace(
            /^[*\-] (.+)$/gm,
            '<div class="ml-3 mt-1 text-neutral-300 flex gap-2"><span class="text-neutral-500 shrink-0">•</span><span>$1</span></div>',
        )
        .replace(/\n\n/g, '<div class="h-2"></div>')
        .replace(/\n/g, "<br/>");
}

// ── Sub-components ────────────────────────────────────────────────────────────
function AiAvatar() {
    return (
        <div className="shrink-0 h-6 w-6 rounded-md bg-[#1a1a1a] border border-white/10 flex items-center justify-center mt-0.5">
            <span className="text-[9px] font-bold text-neutral-400 tracking-tight leading-none select-none">
                AI
            </span>
        </div>
    );
}

function TypingDots() {
    return (
        <span className="flex items-center gap-1 py-0.5">
            {[0, 1, 2].map((i) => (
                <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-neutral-500 animate-pulse"
                    style={{ animationDelay: `${i * 160}ms` }}
                />
            ))}
        </span>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TeacherCourseChat({ courseId }: { courseId: string }) {
    const [isReady, setIsReady] = useState(false);
    const [userId, setUserId] = useState("");

    // Unified message list — both normal chat and test generation live here.
    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);

    // Test generation form
    const [showTestForm, setShowTestForm] = useState(false);
    const [testCount, setTestCount] = useState(5);
    const [testType, setTestType] = useState<"mcq" | "open" | "mixed">("mixed");
    const [testTopic, setTestTopic] = useState("");
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const bottomRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    /** Stable session ID — keeps Flowise server-side memory per teacher+course. */
    const sessionId = useMemo(
        () => `portal_course_teacher_${userId || "anon"}_${courseId}`,
        [userId, courseId],
    );

    useEffect(() => {
        setUserId(getCookie("user_id") ?? "");
        setIsReady(true);
    }, []);

    // Auto-scroll to latest message.
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ── Send normal chat message ───────────────────────────────────────────────
    const sendMessage = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || isSending) return;

        setInput("");
        setIsSending(true);

        const loadingId = uid();
        setMessages((prev) => [
            ...prev,
            { id: uid(), role: "user", text: trimmed },
            { id: loadingId, role: "assistant", text: "", loading: true },
        ]);

        console.log("[TeacherCourseChat] sending message");

        try {
            const vars = { courseId, userId, userRole: "teacher" };
            const res = await fetch(`/api/v1/prediction/${CHATFLOW_ID}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    question: trimmed,
                    chatId: sessionId,
                    vars,
                    chatflowConfig: { sessionId, vars },
                    overrideConfig: { vars },
                }),
            });

            console.log("[TeacherCourseChat] chat response status:", res.status);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = (await res.json().catch(() => null)) as any;
            console.log("[TeacherCourseChat] chat data keys:", data ? Object.keys(data) : null);

            const responseText = ((data?.text ?? data?.answer ?? "") as string).trim();

            setMessages((prev) =>
                prev.map((m) =>
                    m.id === loadingId
                        ? {
                              ...m,
                              text: responseText || "Nepodarilo sa načítať odpoveď.",
                              loading: false,
                              isError: !responseText,
                          }
                        : m,
                ),
            );
        } catch (err) {
            console.error("[TeacherCourseChat] chat error:", err);
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === loadingId
                        ? {
                              ...m,
                              text: "Nepodarilo sa spojiť so serverom.",
                              loading: false,
                              isError: true,
                          }
                        : m,
                ),
            );
        } finally {
            setIsSending(false);
        }
    };

    // ── Generate test ──────────────────────────────────────────────────────────
    const generateTest = async (e: FormEvent) => {
        e.preventDefault();
        if (isSending) return;

        setShowTestForm(false);
        setIsSending(true);

        const typeLabel =
            testType === "mcq"  ? "výber z možností" :
            testType === "open" ? "otvorené otázky"  : "zmiešané";
        const topicSuffix = testTopic.trim() ? `, téma: ${testTopic.trim()}` : "";
        const summary = `Vygeneruj test: ${testCount} otázok, ${typeLabel}${topicSuffix}`;

        const loadingId = uid();
        setMessages((prev) => [
            ...prev,
            { id: uid(), role: "user", text: summary },
            { id: loadingId, role: "assistant", text: "", loading: true },
        ]);

        console.log("[TeacherCourseChat] generate test clicked");

        try {
            const res = await fetch(`/api/teacher/courses/${courseId}/generate-test`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    count: testCount,
                    questionType: testType,
                    topic: testTopic.trim(),
                }),
            });

            console.log("[TeacherCourseChat] generate-test response status:", res.status);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = (await res.json().catch(() => null)) as any;
            console.log("[TeacherCourseChat] generate-test data keys:", data ? Object.keys(data) : null);

            let resultText = "";
            let isError = false;

            if (data?.ragRejected) {
                resultText =
                    typeof data.message === "string"
                        ? data.message
                        : "Test nebol vygenerovaný — AI nenašla žiadne reálne zdroje v indexovaných materiáloch kurzu.";
                isError = true;
            } else if (typeof data?.text === "string" && data.text.length > 0) {
                resultText = data.text;
                console.log("[TeacherCourseChat] generated text length:", resultText.length);
            } else {
                resultText =
                    typeof data?.message === "string"
                        ? data.message
                        : "Generovanie testu zlyhalo.";
                isError = true;
            }

            setMessages((prev) =>
                prev.map((m) =>
                    m.id === loadingId
                        ? {
                              ...m,
                              text: resultText,
                              loading: false,
                              isTest: !isError,
                              isError,
                          }
                        : m,
                ),
            );
        } catch (err) {
            console.error("[TeacherCourseChat] generation error:", err);
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === loadingId
                        ? {
                              ...m,
                              text: "Nepodarilo sa spojiť so serverom.",
                              loading: false,
                              isError: true,
                          }
                        : m,
                ),
            );
        } finally {
            setIsSending(false);
            setTestTopic("");
        }
    };

    // ── Copy ───────────────────────────────────────────────────────────────────
    const handleCopy = async (id: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(id);
            toast.success("Skopírované do schránky");
            setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
        } catch {
            toast.error("Kopírovanie zlyhalo");
        }
    };

    // ── Keyboard (Enter sends, Shift+Enter = newline) ──────────────────────────
    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void sendMessage(input);
        }
    };

    // ── Loading skeleton ───────────────────────────────────────────────────────
    if (!isReady) {
        return (
            <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-[#050505] p-4 text-sm text-neutral-400">
                Načítavam chat…
            </div>
        );
    }

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <div className="w-full flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#050505] shadow-[0_0_0_1px_rgba(255,255,255,0.02)] h-[700px]">

            {/* ── Header ── */}
            <div className="flex-none flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3 bg-[#050505]">
                <div className="flex items-center gap-2.5 min-w-0">
                    <BotIcon className="h-4 w-4 shrink-0 text-neutral-400" />
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-white leading-tight">
                            AI asistent kurzu
                        </h2>
                        <p className="text-xs text-neutral-500 mt-0.5 leading-snug">
                            Pýtaj sa na materiály kurzu alebo vygeneruj test
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setShowTestForm((s) => !s)}
                    disabled={isSending}
                    className={[
                        "flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-50",
                        showTestForm
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                            : "border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10 hover:border-white/20",
                    ].join(" ")}
                >
                    <ClipboardListIcon className="h-3.5 w-3.5" />
                    Generovať test
                </button>
            </div>

            {/* ── Test generation form (inline collapsible) ── */}
            {showTestForm && (
                <form
                    onSubmit={(e) => { void generateTest(e); }}
                    className="flex-none border-b border-white/8 bg-[#0a0a0a] px-4 py-3"
                >
                    <div className="grid gap-3 sm:grid-cols-12">
                        <div className="sm:col-span-2 space-y-1">
                            <label className="block text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                                Počet
                            </label>
                            <select
                                className="select-dark text-xs py-1.5"
                                value={testCount}
                                onChange={(e) => setTestCount(Number(e.target.value))}
                            >
                                {[3, 5, 8, 10, 15, 20].map((n) => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>
                        </div>

                        <div className="sm:col-span-3 space-y-1">
                            <label className="block text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                                Typ
                            </label>
                            <select
                                className="select-dark text-xs py-1.5"
                                value={testType}
                                onChange={(e) =>
                                    setTestType(e.target.value as "mcq" | "open" | "mixed")
                                }
                            >
                                <option value="mcq">Výber (A/B/C/D)</option>
                                <option value="open">Otvorené</option>
                                <option value="mixed">Zmiešané</option>
                            </select>
                        </div>

                        <div className="sm:col-span-4 space-y-1">
                            <label className="block text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                                Téma{" "}
                                <span className="normal-case font-normal text-neutral-600">
                                    (voliteľné)
                                </span>
                            </label>
                            <input
                                type="text"
                                className="input-dark text-xs py-1.5"
                                placeholder="napr. optické vlákna…"
                                value={testTopic}
                                onChange={(e) => setTestTopic(e.target.value)}
                                maxLength={200}
                            />
                        </div>

                        <div className="sm:col-span-3 flex items-end gap-2">
                            <button
                                type="submit"
                                disabled={isSending}
                                className="btn-primary flex-1 text-xs px-3 py-1.5"
                            >
                                {isSending ? (
                                    <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <ClipboardListIcon className="h-3.5 w-3.5" />
                                )}
                                Generovať
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowTestForm(false)}
                                className="btn-ghost text-xs px-2 py-1.5"
                                title="Zavrieť"
                            >
                                <XIcon className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
                </form>
            )}

            {/* ── Unified message list ── */}
            <div className="flex-1 overflow-y-auto bg-[#080808] px-4 py-5 space-y-4 min-h-0">

                {/* Welcome state */}
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center gap-3 pb-8">
                        <div className="h-10 w-10 rounded-xl bg-[#111111] border border-white/8 flex items-center justify-center">
                            <BotIcon className="h-5 w-5 text-neutral-400" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-neutral-300">AI asistent kurzu</p>
                            <p className="text-xs text-neutral-500 mt-1 max-w-[280px]">
                                Pýtaj sa na materiály kurzu, alebo klikni na{" "}
                                <span className="text-neutral-400">„Generovať test"</span>{" "}
                                v hlavičke.
                            </p>
                        </div>
                    </div>
                )}

                {messages.map((msg) => {
                    // ── User bubble ───────────────────────────────────────────
                    if (msg.role === "user") {
                        return (
                            <div key={msg.id} className="flex justify-end">
                                <div className="max-w-[72%] rounded-2xl rounded-tr-sm bg-[#1c1c1c] border border-white/8 px-4 py-2.5">
                                    <p className="text-sm text-neutral-100 leading-relaxed whitespace-pre-wrap">
                                        {msg.text}
                                    </p>
                                </div>
                            </div>
                        );
                    }

                    // ── Loading bubble ────────────────────────────────────────
                    if (msg.loading) {
                        return (
                            <div key={msg.id} className="flex items-start gap-2.5">
                                <AiAvatar />
                                <div className="rounded-2xl rounded-tl-sm bg-[#111111] border border-white/8 px-4 py-3">
                                    <TypingDots />
                                </div>
                            </div>
                        );
                    }

                    // ── Error / rejection bubble ──────────────────────────────
                    if (msg.isError) {
                        return (
                            <div key={msg.id} className="flex items-start gap-2.5">
                                <AiAvatar />
                                <div className="max-w-[82%] flex items-start gap-2.5 rounded-2xl rounded-tl-sm bg-amber-500/8 border border-amber-500/20 px-4 py-3">
                                    <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                                    <p className="text-sm text-amber-200/90 leading-relaxed">
                                        {msg.text}
                                    </p>
                                </div>
                            </div>
                        );
                    }

                    // ── Test result bubble ────────────────────────────────────
                    if (msg.isTest) {
                        return (
                            <div key={msg.id} className="flex items-start gap-2.5">
                                <AiAvatar />
                                <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-[#0f0f0f] border border-white/8 overflow-hidden">
                                    {/* Card header */}
                                    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/8 bg-[#111111]">
                                        <div className="flex items-center gap-1.5">
                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                                                Vygenerovaný test
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => void handleCopy(msg.id, msg.text)}
                                            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-400 hover:bg-white/8 hover:text-white transition-colors"
                                        >
                                            {copiedId === msg.id ? (
                                                <>
                                                    <CheckIcon className="h-3 w-3 text-emerald-400" />
                                                    <span className="text-emerald-400">Skopírované</span>
                                                </>
                                            ) : (
                                                <>
                                                    <CopyIcon className="h-3 w-3" />
                                                    <span>Kopírovať</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    {/* Card body */}
                                    <div
                                        className="px-4 py-4 text-sm text-neutral-200 leading-relaxed"
                                        dangerouslySetInnerHTML={{ __html: mdToHtml(msg.text) }}
                                    />
                                </div>
                            </div>
                        );
                    }

                    // ── Normal assistant message ──────────────────────────────
                    return (
                        <div key={msg.id} className="flex items-start gap-2.5">
                            <AiAvatar />
                            <div className="max-w-[82%] rounded-2xl rounded-tl-sm bg-[#111111] border border-white/8 px-4 py-3">
                                <div
                                    className="text-sm text-neutral-200 leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: mdToHtml(msg.text) }}
                                />
                            </div>
                        </div>
                    );
                })}

                {/* Scroll anchor */}
                <div ref={bottomRef} />
            </div>

            {/* ── Input ── */}
            <div className="flex-none border-t border-white/8 bg-[#050505] px-4 py-3">
                <div className="flex items-end gap-2">
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Napíš správu… (Enter odošle, Shift+Enter = nový riadok)"
                        disabled={isSending}
                        rows={2}
                        className="flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-white/20 focus:bg-white/8 focus:outline-none transition disabled:opacity-50"
                    />
                    <button
                        type="button"
                        onClick={() => void sendMessage(input)}
                        disabled={isSending || !input.trim()}
                        className="shrink-0 flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white transition disabled:opacity-40 disabled:pointer-events-none"
                        title="Odoslať (Enter)"
                    >
                        {isSending ? (
                            <LoaderIcon className="h-4 w-4 animate-spin" />
                        ) : (
                            <SendIcon className="h-4 w-4" />
                        )}
                    </button>
                </div>
                <p className="mt-1.5 text-[10px] text-neutral-600 select-none">
                    Enter odošle · Shift+Enter = nový riadok
                </p>
            </div>
        </div>
    );
}
