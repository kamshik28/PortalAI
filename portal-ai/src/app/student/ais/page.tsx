"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CourseChat from "@/components/CourseChat";
import AisQuizPanel from "@/components/AisQuizPanel";
import AisProgressPanel from "@/components/AisProgressPanel";

// ─── Types ─────────────────────────────────────────────────────────────────

type AisStatus = {
    connected: boolean;
    lastSyncAt: string | null;
    subjectsCount: number;
    documentsCount: number;
};

type Semester = {
    id: string;
    label: string;
};

type SemestersResponse = {
    semesters: Semester[];
    currentLabel: string;
    currentSemesterId: string | null;
};

type Subject = {
    id: string;
    aisSubjectId: string;
    code: string;
    name?: string | null;
    sourceUrl?: string | null;
    chatCourseId: string;
    semesterFolderId?: string | null;
    semesterLabel?: string | null;
    lastSyncAt?: string | null;
    documentsCount: number;
};

type AisDocument = {
    id: string;
    filename: string;
    storagePath: string | null;
    mimeType?: string | null;
    textExtracted: boolean;
    indexedAt?: string | null;
    createdAt: string;
    updatedAt: string;
};

type SubjectDocumentsResponse = {
    subject: { id: string; code: string; name?: string | null; chatCourseId: string; };
    documents: AisDocument[];
};

type SearchMatch = {
    id: string;
    score: number;
    filename: string | null;
    text: string;
    chunkIndex: number | null;
    sourceUrl: string | null;
};

type SearchResponse = {
    subject?: { id: string; code: string; name?: string | null; chatCourseId: string };
    query?: string;
    topK?: number;
    matches?: SearchMatch[];
    contextText?: string;
};

type ActiveSubjectInfo = {
    id: string;
    code: string;
    name: string | null;
    chatCourseId: string;
    lastSyncAt: string | null;
    documentsCount: number;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function looksLikeSessionError(msg: string): boolean {
    const lower = msg.toLowerCase();
    return (
        lower.includes("not connected") ||
        lower.includes("not completed in time") ||
        lower.includes("vypr") ||
        lower.includes("expired") ||
        lower.includes("prihlás sa znova") ||
        lower.includes("prihlásenie do ais nebolo")
    );
}

function docStatus(doc: AisDocument): {
    label: string;
    color: "green" | "amber" | "neutral" | "red";
} {
    // 1. Successfully indexed — the happy path
    if (doc.indexedAt) return { label: "Zaindexované", color: "green" };

    // 2. Not yet downloaded — upload failed or sync not yet run
    if (!doc.storagePath) return { label: "Čaká na stiahnutie", color: "amber" };

    // 3. Non-PDF / unsupported format (not PDF or binary stream)
    if (
        doc.mimeType &&
        !doc.mimeType.includes("pdf") &&
        !doc.mimeType.includes("octet-stream")
    ) {
        return { label: "Nepodporovaný formát", color: "neutral" };
    }

    // 4. PDF parse succeeded but no text found (scanned / image-only PDF)
    if (doc.textExtracted && !doc.indexedAt) {
        return { label: "Naskenovaný dokument (bez textu)", color: "neutral" };
    }

    // 5. Downloaded PDF but parse threw (textExtracted stays false)
    return { label: "Chyba parsingu PDF", color: "red" };
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function StudentAisPage() {
    // Connection
    const [cookieValue, setCookieValue] = useState("");
    const [debugOpen, setDebugOpen] = useState(false);

    // Status
    const [status, setStatus] = useState<AisStatus | null>(null);
    const [loading, setLoading] = useState(true);

    // Semesters
    const [semesters, setSemesters] = useState<Semester[]>([]);
    const [selectedSemesterId, setSelectedSemesterId] = useState<string>("");
    const [currentSemesterLabel, setCurrentSemesterLabel] = useState<string>("");
    const [semestersLoaded, setSemestersLoaded] = useState(false);

    // Subjects
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);

    // Documents
    const [documents, setDocuments] = useState<AisDocument[]>([]);
    const [docsLoading, setDocsLoading] = useState(false);

    // Feedback
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [messageIsError, setMessageIsError] = useState(false);
    const [sessionExpired, setSessionExpired] = useState(false);

    // Active subject for chat (backend source of truth)
    const [activeSubject, setActiveSubject] = useState<ActiveSubjectInfo | null>(null);

    // Step 4 mode: AI chat, interactive quiz, or progress
    const [step4Mode, setStep4Mode] = useState<"chat" | "quiz" | "progress">("chat");

    // RAG test
    const [ragOpen, setRagOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchBusy, setSearchBusy] = useState(false);
    const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
    const [searchError, setSearchError] = useState<string | null>(null);

    // Tracks whether the initial page load is complete.
    // The semester-change effect must not fire during the first render cycle.
    const didInitialLoad = useRef(false);

    const selectedSubject = useMemo(
        () => subjects.find((s) => s.id === selectedSubjectId) ?? null,
        [subjects, selectedSubjectId]
    );

    const safeMatches = Array.isArray(searchResult?.matches)
        ? searchResult.matches
        : [];

    // ── Data loading ──────────────────────────────────────────────────────

    /** Returns the fetched status so callers can branch on it without stale state. */
    async function loadStatus(): Promise<AisStatus | null> {
        try {
            const res = await fetch("/api/student/ais/status");
            if (!res.ok) return null;
            const data = (await res.json().catch(() => null)) as AisStatus | null;
            if (data) setStatus(data);
            return data;
        } catch {
            return null;
        }
    }

    /**
     * Fetches the semester list from the backend (Courses branch only, filtered
     * to the current academic year).  Returns the resolved semester ID so
     * callers can pass it straight to loadSubjects without waiting for
     * React state to commit.
     */
    async function loadSemesters(): Promise<string | null> {
        try {
            const res = await fetch("/api/student/ais/semesters");
            if (!res.ok) {
                setSemestersLoaded(true);
                return null;
            }
            const data = (await res.json().catch(() => null)) as SemestersResponse | null;
            if (data?.semesters) {
                setSemesters(data.semesters);
                setCurrentSemesterLabel(data.currentLabel ?? "");

                // Determine which semester ID to select.  Prefer the server's
                // "current" ID, then the first in the list.  Don't override an
                // already-selected value so users' manual picks are preserved.
                let resolvedId: string | null = null;
                if (!selectedSemesterId && data.currentSemesterId) {
                    resolvedId = data.currentSemesterId;
                    setSelectedSemesterId(data.currentSemesterId);
                } else if (!selectedSemesterId && data.semesters.length > 0) {
                    resolvedId = data.semesters[0].id;
                    setSelectedSemesterId(data.semesters[0].id);
                } else if (selectedSemesterId) {
                    resolvedId = selectedSemesterId;
                }

                setSemestersLoaded(true);
                return resolvedId;
            }
            setSemestersLoaded(true);
            return null;
        } catch {
            setSemestersLoaded(true);
            return null;
        }
    }

    /**
     * Loads subjects for a specific semester.  When semesterId is provided,
     * only subjects belonging to that semester's AIS folder are returned.
     */
    async function loadSubjects(semesterId?: string, preserveSelection = false) {
        const url = semesterId
            ? `/api/student/ais/subjects?semesterId=${encodeURIComponent(semesterId)}`
            : "/api/student/ais/subjects";

        const res = await fetch(url);
        if (!res.ok) {
            setSubjects([]);
            setSelectedSubjectId(null);
            setDocuments([]);
            return;
        }
        const data = await res.json().catch(() => null);
        const list: Subject[] = Array.isArray(data?.subjects) ? data.subjects : [];
        setSubjects(list);

        if (list.length > 0) {
            const stillExists =
                preserveSelection &&
                selectedSubjectId != null &&
                list.some((s) => s.id === selectedSubjectId);
            const nextId = stillExists ? selectedSubjectId! : list[0].id;
            setSelectedSubjectId(nextId);
            await loadDocuments(nextId);
        } else {
            setSelectedSubjectId(null);
            setDocuments([]);
        }
    }

    async function loadDocuments(subjectId: string) {
        setDocsLoading(true);
        try {
            const res = await fetch(
                `/api/student/ais/subjects/${subjectId}/documents`
            );
            const data = (await res.json().catch(
                () => null
            )) as SubjectDocumentsResponse | null;
            setDocuments(res.ok && Array.isArray(data?.documents) ? data!.documents : []);
        } finally {
            setDocsLoading(false);
        }
    }

    async function loadActiveSubject() {
        try {
            const res = await fetch("/api/student/ais/active-subject");
            if (!res.ok) { setActiveSubject(null); return; }
            const data = await res.json().catch(() => null) as
                | { activeSubject: ActiveSubjectInfo | null }
                | null;
            setActiveSubject(data?.activeSubject ?? null);
        } catch {
            setActiveSubject(null);
        }
    }

    /**
     * Full page initialisation.  Order matters:
     *  1. Load status in parallel with the active-subject check.
     *  2. If connected, fetch semesters (which sets selectedSemesterId via state).
     *     loadSemesters() returns the resolved ID so we don't need to wait for
     *     React's async state commit before passing it to loadSubjects.
     *  3. Load subjects scoped to the resolved semester.
     */
    async function loadAll() {
        setLoading(true);
        try {
            const [st] = await Promise.all([
                loadStatus(),
                loadActiveSubject(),
            ]);

            let resolvedSemesterId: string | null = null;
            if (st?.connected) {
                resolvedSemesterId = await loadSemesters();
            }

            await loadSubjects(resolvedSemesterId ?? undefined, true);
        } finally {
            setLoading(false);
            // Allow the semester-change effect to fire from now on.
            didInitialLoad.current = true;
        }
    }

    useEffect(() => {
        void loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // When the user picks a different semester from the dropdown, reload the
    // subject list scoped to that semester and reset selection state.
    // The `didInitialLoad` guard prevents this from firing during the first
    // render before the initial data arrives.
    useEffect(() => {
        if (!didInitialLoad.current) return;
        if (!selectedSemesterId) return;

        setDocuments([]);
        setSelectedSubjectId(null);
        setSearchResult(null);
        setSearchError(null);
        void loadSubjects(selectedSemesterId, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedSemesterId]);

    // Load semesters when a connected session is detected but semesters are not
    // yet populated (e.g. after a successful helper-login or cookie connect).
    useEffect(() => {
        if (status?.connected && !semestersLoaded) {
            void loadSemesters();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status?.connected]);

    // ── Feedback helpers ──────────────────────────────────────────────────

    function showOk(msg: string) {
        setMessage(msg);
        setMessageIsError(false);
        setSessionExpired(false);
    }

    function showErr(msg: string) {
        if (looksLikeSessionError(msg)) {
            setSessionExpired(true);
            setMessage(
                "Tvoja AIS session vypršala alebo je neplatná. Prihlás sa znova."
            );
            setMessageIsError(true);
        } else {
            setSessionExpired(false);
            setMessage(msg);
            setMessageIsError(true);
        }
    }

    // ── Action handlers ───────────────────────────────────────────────────

    async function handleHelperLogin() {
        try {
            setBusy(true);
            setMessage(null);

            const res = await fetch("/api/student/ais/helper-login", {
                method: "POST",
            });
            const data = await res.json().catch(() => null);

            if (!res.ok) {
                const msg = data?.message || "AIS helper login failed";
                if (
                    msg.toLowerCase().includes("playwright") ||
                    msg.toLowerCase().includes("not available")
                ) {
                    setDebugOpen(true);
                    setMessage(
                        "Automatické prihlásenie nie je dostupné na tomto zariadení. " +
                        "Použi záložný spôsob nižšie."
                    );
                    setMessageIsError(true);
                } else {
                    showErr(msg);
                }
                return;
            }

            showOk(data?.message || "AIS session uložená.");
            const [st] = await Promise.all([loadStatus(), loadActiveSubject()]);
            if (st?.connected) {
                const semId = await loadSemesters();
                await loadSubjects(semId ?? undefined, false);
            }
        } catch (e) {
            console.error(e);
            showErr("Prihlásenie zlyhalo — skontroluj konzolu NestJS.");
        } finally {
            setBusy(false);
        }
    }

    async function handleConnect() {
        try {
            setBusy(true);
            setMessage(null);

            const res = await fetch("/api/student/ais/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ uisAuthCookie: cookieValue }),
            });
            const data = await res.json().catch(() => null);

            if (!res.ok) {
                showErr(data?.message || "AIS connect failed");
                return;
            }

            showOk("AIS session uložená.");
            setCookieValue("");
            setDebugOpen(false);
            const [st] = await Promise.all([loadStatus(), loadActiveSubject()]);
            if (st?.connected) {
                const semId = await loadSemesters();
                await loadSubjects(semId ?? undefined, false);
            }
        } catch (e) {
            console.error(e);
            showErr("AIS connect failed.");
        } finally {
            setBusy(false);
        }
    }

    async function handleDiscoverSubjects() {
        try {
            setBusy(true);
            setMessage(null);

            // Pass both the folder ID and the human-readable label so the
            // backend can tag each discovered subject with its semester.
            const selectedLabel =
                semesters.find((s) => s.id === selectedSemesterId)?.label;

            const res = await fetch("/api/student/ais/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                    selectedSemesterId
                        ? { semesterId: selectedSemesterId, semesterLabel: selectedLabel }
                        : {}
                ),
            });
            const data = await res.json().catch(() => null);

            if (!res.ok) {
                showErr(data?.message || "Obnovenie predmetov zlyhalo.");
                return;
            }

            showOk(data?.message || "Predmety obnovené.");
            await loadStatus();
            // Reload subjects scoped to the currently selected semester.
            await loadSubjects(selectedSemesterId || undefined, false);
        } catch (e) {
            console.error(e);
            showErr("Obnovenie predmetov zlyhalo.");
        } finally {
            setBusy(false);
        }
    }

    async function handleSyncSelectedSubject() {
        if (!selectedSubjectId) return;
        try {
            setBusy(true);
            setMessage(null);

            const res = await fetch(
                `/api/student/ais/subjects/${selectedSubjectId}/sync`,
                { method: "POST" }
            );
            const data = await res.json().catch(() => null);

            if (!res.ok) {
                showErr(data?.message || "Sync predmetu zlyhal.");
                return;
            }

            showOk(data?.message || "Predmet synchronizovaný.");
            await Promise.all([
                loadStatus(),
                loadDocuments(selectedSubjectId),
                loadActiveSubject(),
            ]);
        } catch (e) {
            console.error(e);
            showErr("Sync predmetu zlyhal.");
        } finally {
            setBusy(false);
        }
    }

    async function handleSelectSubject(subjectId: string) {
        setSelectedSubjectId(subjectId);
        setSearchResult(null);
        setSearchError(null);
        setSearchQuery("");
        await loadDocuments(subjectId);
    }

    async function handleSearchTest() {
        if (!activeSubject) return;
        if (!searchQuery.trim()) {
            setSearchError("Napíš otázku.");
            return;
        }
        try {
            setSearchBusy(true);
            setSearchError(null);
            setSearchResult(null);

            const res = await fetch("/api/student/ais/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query: searchQuery.trim(),
                    topK: 5,
                }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                setSearchError((data as { message?: string } | null)?.message || "Search failed");
                return;
            }
            setSearchResult(data as SearchResponse);
        } catch (e) {
            console.error(e);
            setSearchError("Search failed");
        } finally {
            setSearchBusy(false);
        }
    }

    // ── Computed ──────────────────────────────────────────────────────────

    const isConnectedState = Boolean(status?.connected);

    const selectedSemesterLabel =
        semesters.find((s) => s.id === selectedSemesterId)?.label ??
        (selectedSemesterId ? selectedSemesterId : "—");

    // Does the active chat subject belong to the currently selected semester?
    // If not, we show a gentle warning so the student knows the chat context.
    const activeSubjectIsCurrentSemester =
        !activeSubject ||
        !selectedSemesterId ||
        subjects.some((s) => s.id === activeSubject.id);

    // ── JSX ───────────────────────────────────────────────────────────────

    return (
        <div className="space-y-8 pb-16">

            {/* ── Page header ─────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        AIS synchronizácia
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Pripoj AIS, zvol semester, načítaj predmety a spusť AI asistenta.
                    </p>
                </div>

                {/* Compact status pill */}
                {!loading && (
                    <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                            isConnectedState
                                ? "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                                : "border-border bg-muted text-muted-foreground dark:border-neutral-700 dark:bg-neutral-800"
                        }`}
                    >
                        <span
                            className={`h-1.5 w-1.5 rounded-full ${
                                isConnectedState ? "bg-emerald-400" : "bg-neutral-500"
                            }`}
                        />
                        {isConnectedState ? "Pripojené" : "Nepripojené"}
                    </span>
                )}
            </div>

            {/* ── Session-expired banner ───────────────────────────────── */}
            {sessionExpired && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                    Tvoja AIS session vypršala. Prihlás sa znova pomocou tlačidla nižšie.
                </div>
            )}

            {/* ── Global message ───────────────────────────────────────── */}
            {message && !sessionExpired && (
                <div
                    className={`rounded-lg border px-4 py-3 text-sm ${
                        messageIsError
                            ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    }`}
                >
                    {message}
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════
                STEP 1 — Prihlásenie
            ══════════════════════════════════════════════════════════ */}
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm dark:shadow-none space-y-4">
                <div className="flex items-center gap-3">
                    <StepBadge n={1} done={isConnectedState} />
                    <h2 className="font-semibold">Prihlásenie do AIS</h2>
                    {isConnectedState && (
                        <span className="ml-auto text-xs text-emerald-700 dark:text-emerald-400">✓ Pripojené</span>
                    )}
                </div>

                {!isConnectedState && (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Klikni na tlačidlo — otvorí sa okno prehliadača na tejto stanici,
                        prihlás sa do AIS a session sa uloží automaticky.
                    </p>
                )}

                <button
                    onClick={handleHelperLogin}
                    disabled={busy}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-muted px-5 text-sm font-medium text-foreground hover:bg-muted/70 dark:bg-white/10 dark:hover:bg-white/15 disabled:opacity-50 transition-colors"
                >
                    {busy ? (
                        <>
                            <Spinner /> Čakám na prihlásenie…
                        </>
                    ) : isConnectedState ? (
                        "Obnoviť AIS session"
                    ) : (
                        "Prihlásiť sa do AIS"
                    )}
                </button>

                {/* Collapsible fallback */}
                <div className="border-t border-border pt-3">
                    <button
                        type="button"
                        onClick={() => setDebugOpen((v) => !v)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ChevronIcon open={debugOpen} />
                        Záložný spôsob — manuálne vloženie UISAuth cookie
                    </button>

                    {debugOpen && (
                        <div className="mt-3 space-y-2">
                            <p className="text-xs text-muted-foreground">
                                Otvor <span className="font-mono">is.stuba.sk</span>, prihlás sa,{" "}
                                <kbd className="rounded border px-1">F12</kbd> → Application →
                                Cookies → skopíruj hodnotu{" "}
                                <span className="font-mono font-bold">UISAuth</span>.
                            </p>
                            <textarea
                                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring dark:bg-[#0d0d0d]"
                                rows={2}
                                value={cookieValue}
                                onChange={(e) => setCookieValue(e.target.value)}
                                placeholder="Vlož hodnotu UISAuth cookie"
                            />
                            <button
                                onClick={handleConnect}
                                disabled={busy || !cookieValue.trim()}
                                className="inline-flex h-8 items-center rounded-md border border-border px-4 text-sm hover:bg-muted disabled:opacity-50 transition-colors"
                            >
                                {busy ? "Ukladám…" : "Uložiť UISAuth cookie"}
                            </button>
                        </div>
                    )}
                </div>

                {/* Mini stats row */}
                {!loading && status && (
                    <div className="flex flex-wrap gap-4 pt-1 text-xs text-muted-foreground border-t border-border">
                        <span>Predmety: <strong className="text-foreground">{status.subjectsCount}</strong></span>
                        <span>Dokumenty: <strong className="text-foreground">{status.documentsCount}</strong></span>
                        {status.lastSyncAt && (
                            <span>
                                Posledná sync:{" "}
                                <strong className="text-foreground">
                                    {new Date(status.lastSyncAt).toLocaleString("sk-SK")}
                                </strong>
                            </span>
                        )}
                    </div>
                )}
            </section>

            {/* ══════════════════════════════════════════════════════════
                STEP 2 — Semester & načítanie predmetov
            ══════════════════════════════════════════════════════════ */}
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm dark:shadow-none space-y-4">
                <div className="flex items-center gap-3">
                    <StepBadge n={2} done={subjects.length > 0} />
                    <h2 className="font-semibold">Semester a predmety</h2>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                    {/* Semester selector */}
                    <div className="flex flex-col gap-1 min-w-[220px]">
                        <label className="text-xs text-muted-foreground">
                            Zvolený semester
                        </label>
                        {semesters.length > 0 ? (
                            <select
                                value={selectedSemesterId}
                                onChange={(e) => setSelectedSemesterId(e.target.value)}
                                className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring dark:bg-[#0d0d0d]"
                                disabled={busy}
                            >
                                {semesters.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.label}
                                        {s.label === currentSemesterLabel ? " (aktuálny)" : ""}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <div className="h-9 flex items-center rounded-md border border-border bg-background px-3 text-sm text-muted-foreground dark:bg-[#0d0d0d]">
                                {isConnectedState
                                    ? semestersLoaded
                                        ? "Semestre sa nenašli — zadaj AIS_SEMESTER_FOLDER_ID"
                                        : "Načítavam…"
                                    : "Najprv sa prihlás do AIS"}
                            </div>
                        )}
                    </div>

                    {/* Discover subjects button */}
                    <button
                        onClick={handleDiscoverSubjects}
                        disabled={busy || !isConnectedState || !selectedSemesterId}
                        className="inline-flex h-9 items-center gap-2 rounded-lg bg-muted px-5 text-sm font-medium text-foreground hover:bg-muted/70 dark:bg-white/10 dark:hover:bg-white/15 disabled:opacity-50 transition-colors"
                    >
                        {busy ? <><Spinner /> Obnovujem…</> : "Obnoviť predmety"}
                    </button>
                </div>

                {!isConnectedState && (
                    <p className="text-xs text-muted-foreground">
                        Najprv sa prihlás do AIS v kroku 1.
                    </p>
                )}

                {isConnectedState && semesters.length > 0 && subjects.length === 0 && semestersLoaded && (
                    <p className="text-xs text-muted-foreground">
                        Zvolený semester ešte nemá načítané predmety. Klikni na{" "}
                        <strong>Obnoviť predmety</strong>.
                    </p>
                )}
            </section>

            {/* ══════════════════════════════════════════════════════════
                STEP 3 — Predmety + dokumenty
            ══════════════════════════════════════════════════════════ */}
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm dark:shadow-none space-y-4">
                <div className="flex items-center gap-3">
                    <StepBadge n={3} done={Boolean(activeSubject)} />
                    <h2 className="font-semibold">Predmety a dokumenty</h2>
                    {selectedSemesterId && semesters.length > 0 && (
                        <span className="ml-auto text-xs text-muted-foreground">
                            {selectedSemesterLabel}
                        </span>
                    )}
                </div>

                {loading ? (
                    <div className="text-sm text-muted-foreground">Načítavam…</div>
                ) : subjects.length === 0 ? (
                    <EmptyState
                        icon="📂"
                        title="Žiadne predmety pre tento semester"
                        description={
                            isConnectedState
                                ? `Klikni na "Obnoviť predmety" vyššie a predmety pre semester ${selectedSemesterLabel} sa načítajú z AIS.`
                                : "Najprv sa prihlás do AIS a potom obnov predmety."
                        }
                    />
                ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                        {/* Subject list */}
                        <div className="space-y-2">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                                Predmety ({subjects.length})
                                {selectedSemesterLabel !== "—" && (
                                    <span className="ml-1 normal-case font-normal">
                                        — {selectedSemesterLabel}
                                    </span>
                                )}
                            </p>
                            <ul className="space-y-1.5">
                                {subjects.map((s) => {
                                    const isActive = activeSubject?.id === s.id;
                                    return (
                                        <li key={s.id}>
                                            <button
                                                className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                                                    selectedSubjectId === s.id
                                                        ? "border-sky-500/50 bg-sky-500/10 dark:border-white/30 dark:bg-white/5"
                                                        : "border-border hover:border-border hover:bg-muted/50"
                                                }`}
                                                onClick={() => void handleSelectSubject(s.id)}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-mono text-sm font-medium">
                                                        {s.code}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        {isActive && (
                                                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 border border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-400">
                                                                Aktívny
                                                            </span>
                                                        )}
                                                        <DocCountBadge count={s.documentsCount} />
                                                    </div>
                                                </div>
                                                {s.name && (
                                                    <div className="mt-0.5 text-xs text-muted-foreground truncate">
                                                        {s.name}
                                                    </div>
                                                )}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>

                        {/* Document list + sync */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                                    {selectedSubject
                                        ? `${selectedSubject.code} — dokumenty`
                                        : "Dokumenty"}
                                </p>
                                <button
                                    onClick={handleSyncSelectedSubject}
                                    disabled={busy || !selectedSubjectId}
                                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-3 text-xs hover:bg-muted disabled:opacity-40 transition-colors"
                                >
                                    {busy ? <><Spinner size="sm" /> Synchronizujem…</> : "Synchronizovať predmet"}
                                </button>
                            </div>

                            {selectedSubjectId == null ? (
                                <EmptyState
                                    icon="👈"
                                    title="Vyber predmet"
                                    description="Klikni na predmet vľavo."
                                    compact
                                />
                            ) : docsLoading ? (
                                <div className="text-sm text-muted-foreground">
                                    Načítavam dokumenty…
                                </div>
                            ) : documents.length === 0 ? (
                                <EmptyState
                                    icon="📄"
                                    title="Žiadne dokumenty"
                                    description='Predmet existuje, ale zatiaľ nemá stiahnuté dokumenty. Klikni na „Synchronizovať predmet".'
                                    compact
                                />
                            ) : (
                                <ul className="space-y-1.5">
                                    {documents.map((doc) => {
                                        const st = docStatus(doc);
                                        return (
                                            <li
                                                key={doc.id}
                                                className="rounded-lg border border-border px-3 py-2"
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <span className="text-sm font-medium leading-snug break-words min-w-0">
                                                        {doc.filename}
                                                    </span>
                                                    <StatusDot color={st.color} label={st.label} />
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </div>
                )}
            </section>

            {/* ══════════════════════════════════════════════════════════
                STEP 4 — AI asistent & kvíz
            ══════════════════════════════════════════════════════════ */}
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm dark:shadow-none space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                    <StepBadge n={4} done={Boolean(activeSubject)} />
                    <h2 className="font-semibold">AI asistent</h2>

                    {/* Active subject badge — backend source of truth */}
                    {activeSubject ? (
                        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                            Aktívny predmet:{" "}
                            <span className="font-mono font-semibold">{activeSubject.code}</span>
                            {activeSubject.name
                                ? <span className="text-emerald-600 dark:text-emerald-400/70 ml-1">— {activeSubject.name}</span>
                                : null}
                        </span>
                    ) : (
                        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground dark:border-neutral-700 dark:bg-neutral-800">
                            <span className="h-1.5 w-1.5 rounded-full bg-neutral-500" />
                            Žiadny aktívny predmet
                        </span>
                    )}
                </div>

                {/* Cross-semester warning: active subject is from a different semester */}
                {activeSubject && !activeSubjectIsCurrentSemester && (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                        AI asistent je aktuálne nastavený na predmet{" "}
                        <span className="font-mono font-semibold">{activeSubject.code}</span>{" "}
                        z iného semestra. Ak chceš chatovať ku predmetu zo semestra{" "}
                        <strong>{selectedSemesterLabel}</strong>, vyber ho vľavo a klikni na{" "}
                        „Synchronizovať predmet".
                    </div>
                )}

                {!activeSubject ? (
                    <EmptyState
                        icon="💬"
                        title="Najprv synchronizuj predmet"
                        description={'Vyber predmet v kroku 3, klikni na "Synchronizovať predmet" a AI asistent sa aktivuje pre daný predmet.'}
                    />
                ) : (
                    <>
                        {activeSubject.documentsCount === 0 && (
                            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                                Predmet <span className="font-mono font-semibold">{activeSubject.code}</span> zatiaľ nemá zaindexované žiadne dokumenty. Klikni na „Synchronizovať predmet" v kroku 3.
                            </div>
                        )}

                        {/* Chat / Kvíz / Pokrok tab toggle */}
                        <div className="flex gap-1 rounded-xl border border-border bg-muted/50 p-1">
                            {(["chat", "quiz", "progress"] as const).map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setStep4Mode(mode)}
                                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                                        step4Mode === mode
                                            ? "bg-background text-foreground shadow-sm dark:bg-white/10"
                                            : "text-muted-foreground hover:text-foreground hover:bg-accent"
                                    }`}
                                >
                                    <span>{mode === "chat" ? "💬" : mode === "quiz" ? "🧠" : "📊"}</span>
                                    <span>{mode === "chat" ? "Chat" : mode === "quiz" ? "Kvíz" : "Pokrok"}</span>
                                </button>
                            ))}
                        </div>

                        {step4Mode === "chat" && (
                            <CourseChat courseId={activeSubject.chatCourseId} />
                        )}
                        {step4Mode === "quiz" && (
                            <AisQuizPanel subjectCode={activeSubject.code} />
                        )}
                        {step4Mode === "progress" && (
                            <AisProgressPanel />
                        )}
                    </>
                )}
            </section>

            {/* ══════════════════════════════════════════════════════════
                DEV — RAG test (collapsible)
            ══════════════════════════════════════════════════════════ */}
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm dark:shadow-none">
                <button
                    type="button"
                    onClick={() => setRagOpen((v) => !v)}
                    className="flex w-full items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ChevronIcon open={ragOpen} />
                    Dev — Test RAG filtra
                </button>

                {ragOpen && (
                    <div className="mt-4 space-y-3">
                        <p className="text-xs text-muted-foreground">
                            Priamy backend endpoint — vždy hľadá v aktívnom predmete
                            {activeSubject ? ` (${activeSubject.code})` : " — žiadny aktívny predmet"}.
                        </p>
                        <div className="space-y-2">
                            <textarea
                                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring dark:bg-[#0d0d0d]"
                                rows={3}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Napr. Čo je obsahom prednášky 01?"
                            />
                            <button
                                onClick={handleSearchTest}
                                disabled={searchBusy || !activeSubject}
                                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-4 text-sm hover:bg-muted disabled:opacity-40 transition-colors"
                            >
                                {searchBusy ? <><Spinner size="sm" /> Hľadám…</> : "Otestovať RAG"}
                            </button>
                        </div>

                        {searchError && (
                            <p className="text-sm text-red-700 dark:text-red-400">{searchError}</p>
                        )}
                        {searchResult && (
                            <div className="space-y-3">
                                <p className="text-xs text-muted-foreground">
                                    Predmet:{" "}
                                    <span className="text-foreground">
                                        {searchResult.subject?.code ?? "—"}
                                    </span>{" "}
                                    · TopK:{" "}
                                    <span className="text-foreground">
                                        {searchResult.topK ?? 0}
                                    </span>
                                </p>
                                {safeMatches.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        Nenašli sa žiadne chunk-y.
                                    </p>
                                ) : (
                                    <ul className="space-y-2">
                                        {safeMatches.map((item) => (
                                            <li
                                                key={item.id}
                                                className="rounded-lg border border-border px-3 py-2"
                                            >
                                                <div className="text-xs text-muted-foreground">
                                                    {item.filename ?? "—"} · score{" "}
                                                    {item.score.toFixed(4)}
                                                    {item.chunkIndex != null
                                                        ? ` · chunk ${item.chunkIndex}`
                                                        : ""}
                                                </div>
                                                <div className="mt-1 text-sm whitespace-pre-wrap">
                                                    {item.text}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
}

// ─── Small UI components ─────────────────────────────────────────────────────

function StepBadge({ n, done = false }: { n: number; done?: boolean }) {
    return (
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
            done
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "border-border bg-muted text-muted-foreground"
        }`}>
            {done ? "✓" : n}
        </span>
    );
}

function Spinner({ size = "md" }: { size?: "sm" | "md" }) {
    const s = size === "sm" ? "h-3 w-3" : "h-4 w-4";
    return (
        <svg
            className={`${s} animate-spin`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
        >
            <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
            />
            <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8z"
            />
        </svg>
    );
}

function ChevronIcon({ open }: { open: boolean }) {
    return (
        <svg
            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
        >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
    );
}

function DocCountBadge({ count }: { count: number }) {
    if (count === 0)
        return (
            <span className="text-xs text-muted-foreground">bez dokumentov</span>
        );
    return (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {count} dok.
        </span>
    );
}

function StatusDot({
    color,
    label,
}: {
    color: "green" | "amber" | "neutral" | "red";
    label: string;
}) {
    const dot = {
        green: "bg-emerald-400",
        amber: "bg-amber-400",
        neutral: "bg-neutral-500",
        red: "bg-red-400",
    }[color];
    const text = {
        green: "text-emerald-700 dark:text-emerald-400",
        amber: "text-amber-700 dark:text-amber-400",
        neutral: "text-muted-foreground",
        red: "text-red-700 dark:text-red-400",
    }[color];
    return (
        <span className={`flex items-center gap-1 shrink-0 text-xs ${text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
            {label}
        </span>
    );
}

function EmptyState({
    icon,
    title,
    description,
    compact = false,
}: {
    icon: string;
    title: string;
    description: string;
    compact?: boolean;
}) {
    if (compact) {
        return (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
                <p className="text-sm font-medium text-muted-foreground">{title}</p>
                <p className="mt-1 text-xs text-muted-foreground/70">{description}</p>
            </div>
        );
    }
    return (
        <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
            <div className="text-3xl">{icon}</div>
            <p className="mt-2 text-sm font-medium">{title}</p>
            <p className="mt-1 max-w-sm mx-auto text-xs text-muted-foreground">
                {description}
            </p>
        </div>
    );
}
