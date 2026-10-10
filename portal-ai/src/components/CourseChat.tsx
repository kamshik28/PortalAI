// src/components/CourseChat.tsx
//
// Student (and AIS) course chat — fully custom shell (no Flowise embed).
//
// Architecture:
//   • Messages live in one React state array.
//   • Normal chat → POST /api/v1/prediction/{CHATFLOW_ID} (through Next.js proxy
//     which injects authToken / userRole / userId / courseId from cookies).
//   • userRole is read from the user_role cookie so this component works for both
//     students on course pages and students on the AIS chat tab.
//   • No test generation — teacher-only feature lives in TeacherCourseChat.

"use client";

import {
    useState,
    useEffect,
    useMemo,
    useRef,
    KeyboardEvent,
} from "react";
import {
    BotIcon,
    AlertCircleIcon,
    LoaderIcon,
    SendIcon,
} from "lucide-react";

const CHATFLOW_ID = "fe844743-dd08-4086-b0b0-c3db50ef5026";

// ── Types ─────────────────────────────────────────────────────────────────────
type SourceDoc = {
    pageContent?: string;
    metadata?: {
        source?: string;
        filename?: string;
        loc?: { pageNumber?: number; lines?: { from?: number; to?: number } };
        chunkIndex?: number;
        [key: string]: unknown;
    };
};

type ChatMsg = {
    id: string;
    role: "user" | "assistant";
    text: string;
    loading?: boolean;
    isError?: boolean;
    sources?: SourceDoc[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function getCookie(name: string): string | null {
    if (typeof document === "undefined") return null;
    const cookies = document.cookie || "";
    const found = cookies.split("; ").find((c) => c.startsWith(`${name}=`));
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
            '<pre class="bg-muted dark:bg-white/5 rounded-lg p-3 my-3 overflow-x-auto text-xs leading-relaxed"><code>$1</code></pre>',
        )
        .replace(
            /`([^`]+)`/g,
            '<code class="bg-muted dark:bg-white/10 rounded px-1 py-0.5 text-xs font-mono">$1</code>',
        )
        .replace(
            /^### (.+)$/gm,
            '<h3 class="text-sm font-semibold text-foreground mt-4 mb-1">$1</h3>',
        )
        .replace(
            /^## (.+)$/gm,
            '<h2 class="text-[15px] font-semibold text-foreground mt-5 mb-2">$1</h2>',
        )
        .replace(
            /^# (.+)$/gm,
            '<h1 class="text-base font-bold text-foreground mt-5 mb-2">$1</h1>',
        )
        .replace(
            /\*\*\*(.+?)\*\*\*/g,
            '<strong class="font-semibold text-foreground"><em>$1</em></strong>',
        )
        .replace(
            /\*\*(.+?)\*\*/g,
            '<strong class="font-semibold text-foreground">$1</strong>',
        )
        .replace(/\*(.+?)\*/g, '<em class="italic text-muted-foreground">$1</em>')
        .replace(/^---$/gm, '<hr class="border-border my-4" />')
        .replace(
            /^(\d+)\. (.+)$/gm,
            '<div class="mt-3 mb-0.5 flex gap-2 items-start"><span class="shrink-0 font-semibold text-muted-foreground min-w-[1.25rem]">$1.</span><span class="text-foreground">$2</span></div>',
        )
        .replace(
            /^([A-D]\)) (.+)$/gm,
            '<div class="ml-5 mt-1 text-muted-foreground"><span class="font-mono text-muted-foreground mr-1.5">$1</span>$2</div>',
        )
        .replace(
            /^[*\-] (.+)$/gm,
            '<div class="ml-3 mt-1 text-foreground flex gap-2"><span class="text-muted-foreground shrink-0">•</span><span>$1</span></div>',
        )
        .replace(/\n\n/g, '<div class="h-2"></div>')
        .replace(/\n/g, "<br/>");
}

// ── Sub-components ────────────────────────────────────────────────────────────
function AiAvatar() {
    return (
        <div className="shrink-0 h-6 w-6 rounded-md bg-muted border border-border dark:bg-[#1a1a1a] dark:border-white/10 flex items-center justify-center mt-0.5">
            <span className="text-[9px] font-bold text-muted-foreground tracking-tight leading-none select-none">
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
                    className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse"
                    style={{ animationDelay: `${i * 160}ms` }}
                />
            ))}
        </span>
    );
}

function SourceList({ sources }: { sources: SourceDoc[] }) {
    return (
        <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide pl-1">
                Zdroje:
            </p>
            <div className="flex flex-wrap gap-1.5">
                {sources.map((doc, i) => {
                    const rawSource = doc.metadata?.source ?? "";
                    const filename =
                        doc.metadata?.filename ??
                        (rawSource ? rawSource.split(/[\\/]/).pop() : undefined) ??
                        "Dokument";
                    const page = doc.metadata?.loc?.pageNumber;
                    const chunk = doc.metadata?.chunkIndex;
                    const label = [
                        filename,
                        page != null ? `s. ${page}` : null,
                        chunk != null ? `#${chunk}` : null,
                    ]
                        .filter(Boolean)
                        .join(" · ");
                    return (
                        <span
                            key={i}
                            title={doc.pageContent ? doc.pageContent.slice(0, 200) : filename}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground dark:bg-white/5 dark:border-white/10 dark:text-neutral-400 max-w-[220px] truncate"
                        >
                            <span className="shrink-0 text-[9px] opacity-60">📄</span>
                            <span className="truncate">{label}</span>
                        </span>
                    );
                })}
            </div>
        </div>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CourseChat({ courseId }: { courseId: string }) {
    const [isReady, setIsReady] = useState(false);
    const [userRole, setUserRole] = useState<"student" | "teacher">("student");
    const [userId, setUserId] = useState("");
    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);

    const bottomRef = useRef<HTMLDivElement>(null);

    /** Session ID mirrors what FullPageChat used — preserves Flowise memory. */
    const sessionId = useMemo(
        () => `portal_course_${userRole}_${userId || "anon"}_${courseId}`,
        [userRole, userId, courseId],
    );

    useEffect(() => {
        const role = getCookie("user_role");
        if (role === "teacher" || role === "student") setUserRole(role);
        setUserId(getCookie("user_id") ?? "");
        setIsReady(true);
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ── Send message ───────────────────────────────────────────────────────────
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

        try {
            const vars = { courseId, userId, userRole };
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

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = (await res.json().catch(() => null)) as any;
            const responseText = ((data?.text ?? data?.answer ?? "") as string).trim();

            // sourceDocuments are NOT at data.sourceDocuments (top level).
            // They live inside agentFlowExecutedData[].data.output.sourceDocuments
            // in the node that ran the RAG retriever (e.g. StudentCourseAgent).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const executedNodes: any[] = Array.isArray(data?.agentFlowExecutedData)
                ? data.agentFlowExecutedData
                : [];
            let rawSources: SourceDoc[] = [];
            for (const node of executedNodes) {
                const sd = node?.data?.output?.sourceDocuments;
                if (Array.isArray(sd) && sd.length > 0) {
                    rawSources = sd as SourceDoc[];
                    break;
                }
            }
            const seenNames = new Set<string>();
            const sources = rawSources.filter((doc) => {
                const name =
                    doc.metadata?.filename ??
                    (doc.metadata?.source
                        ? doc.metadata.source.split(/[\\/]/).pop()
                        : undefined) ??
                    "";
                if (seenNames.has(name)) return false;
                seenNames.add(name);
                return true;
            });

            setMessages((prev) =>
                prev.map((m) =>
                    m.id === loadingId
                        ? {
                              ...m,
                              text: responseText || "Nepodarilo sa načítať odpoveď.",
                              loading: false,
                              isError: !responseText,
                              sources: sources.length > 0 ? sources : undefined,
                          }
                        : m,
                ),
            );
        } catch {
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

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void sendMessage(input);
        }
    };

    if (!isReady) {
        return (
            <div className="w-full overflow-hidden rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
                Načítavam chat…
            </div>
        );
    }

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <div className="w-full flex flex-col overflow-hidden rounded-2xl border border-border bg-card dark:bg-[#050505] shadow-md dark:shadow-none h-[750px]">

            {/* ── Header ── */}
            <div className="flex-none flex items-center gap-2.5 border-b border-border px-4 py-3 bg-card dark:bg-[#050505]">
                <BotIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-foreground leading-tight">
                        AI asistent kurzu
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                        Pýtaj sa otázky ku materiálom tohto kurzu
                    </p>
                </div>
            </div>

            {/* ── Message list ── */}
            <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-[#080808] px-4 py-5 space-y-4 min-h-0">

                {/* Welcome state */}
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center gap-3 pb-8">
                        <div className="h-10 w-10 rounded-xl bg-muted border border-border dark:bg-[#111111] dark:border-white/8 flex items-center justify-center">
                            <BotIcon className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-foreground">AI asistent kurzu</p>
                            <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">
                                Ahoj! Pýtaj sa ma na čokoľvek z materiálov tohto kurzu.
                            </p>
                        </div>
                    </div>
                )}

                {messages.map((msg) => {
                    // ── User bubble ───────────────────────────────────────────
                    if (msg.role === "user") {
                        return (
                            <div key={msg.id} className="flex justify-end">
                                <div className="max-w-[72%] rounded-2xl rounded-tr-sm bg-sky-100 border border-sky-200 dark:bg-[#1c1c1c] dark:border-white/8 px-4 py-2.5">
                                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
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
                                <div className="rounded-2xl rounded-tl-sm bg-card border border-border dark:bg-[#111111] dark:border-white/8 px-4 py-3">
                                    <TypingDots />
                                </div>
                            </div>
                        );
                    }

                    // ── Error bubble ──────────────────────────────────────────
                    if (msg.isError) {
                        return (
                            <div key={msg.id} className="flex items-start gap-2.5">
                                <AiAvatar />
                                <div className="max-w-[82%] flex items-start gap-2.5 rounded-2xl rounded-tl-sm bg-amber-500/8 border border-amber-500/20 px-4 py-3">
                                    <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
                                    <p className="text-sm text-amber-700 dark:text-amber-200/90 leading-relaxed">
                                        {msg.text}
                                    </p>
                                </div>
                            </div>
                        );
                    }

                    // ── Normal assistant message ──────────────────────────────
                    return (
                        <div key={msg.id} className="flex items-start gap-2.5">
                            <AiAvatar />
                            <div className="max-w-[82%] space-y-2">
                                <div className="rounded-2xl rounded-tl-sm bg-card border border-border dark:bg-[#111111] dark:border-white/8 px-4 py-3">
                                    <div
                                        className="text-sm text-foreground leading-relaxed"
                                        dangerouslySetInnerHTML={{ __html: mdToHtml(msg.text) }}
                                    />
                                </div>
                                {msg.sources && msg.sources.length > 0 && (
                                    <SourceList sources={msg.sources} />
                                )}
                            </div>
                        </div>
                    );
                })}

                <div ref={bottomRef} />
            </div>

            {/* ── Input ── */}
            <div className="flex-none border-t border-border bg-card dark:bg-[#050505] px-4 py-3">
                <div className="flex items-end gap-2">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Napíš svoju otázku ku kurzu… (Enter odošle)"
                        disabled={isSending}
                        rows={2}
                        className="flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring transition disabled:opacity-50"
                    />
                    <button
                        type="button"
                        onClick={() => void sendMessage(input)}
                        disabled={isSending || !input.trim()}
                        className="shrink-0 flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition disabled:opacity-40 disabled:pointer-events-none"
                        title="Odoslať (Enter)"
                    >
                        {isSending ? (
                            <LoaderIcon className="h-4 w-4 animate-spin" />
                        ) : (
                            <SendIcon className="h-4 w-4" />
                        )}
                    </button>
                </div>
                <p className="mt-1.5 text-[10px] text-muted-foreground select-none">
                    Enter odošle · Shift+Enter = nový riadok
                </p>
            </div>
        </div>
    );
}
