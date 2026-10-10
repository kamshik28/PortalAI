// src/app/api/teacher/courses/[coursesId]/generate-test/route.ts
//
// Teacher-only endpoint: builds a structured Flowise prediction request for
// test generation, logs every observable step, and enforces a hard RAG guard:
// if Flowise returns 0 sourceDocuments the test is rejected rather than
// surfaced as a valid output.
//
// Supports both:
//   • Flowise Agentflow v1 — response has agentReasoning / sourceDocuments / usedTools
//   • Flowise Agentflow v2 — response has agentFlowExecutedData (per-node execution trace)
//
// agentFlowExecutedData shape (v2):
//   Array of { data: { id, name, input, output, state, chatHistory? } }
//   i.e. the actual execution fields are one level deeper, inside entry.data.
//   normaliseAfedEntries() unwraps that automatically.

import { NextRequest, NextResponse } from "next/server";

const FLOWISE_BASE = process.env.FLOWISE_BASE ?? "http://localhost:2000";
const FLOWISE_CHATFLOW_ID =
    process.env.FLOWISE_CHATFLOW_ID ?? "fe844743-dd08-4086-b0b0-c3db50ef5026";

// ── Flowise raw response types ──────────────────────────────────────────────
type RawSourceDoc = {
    pageContent?: string;
    metadata?: Record<string, unknown>;
};

type RawToolCall = {
    tool?: string;
    toolInput?: unknown;
    toolOutput?: unknown;
};

type RawAgentStep = {
    agentName?: string;
    messages?: unknown[];
    next?: string;
    instructions?: string;
    usedTools?: RawToolCall[];
    sourceDocuments?: RawSourceDoc[];
};

// A single entry inside agentFlowExecutedData — shape varies by node type.
type RawAfedEntry = Record<string, unknown>;

type FlowiseRawResponse = {
    text?: string;
    answer?: string;
    chatId?: string;
    chatMessageId?: string;
    executionId?: string;
    sessionId?: string;
    question?: string;
    sourceDocuments?: RawSourceDoc[];
    usedTools?: RawToolCall[];
    agentReasoning?: RawAgentStep[];
    // Flowise Agentflow v2 execution trace — Array or keyed Object
    agentFlowExecutedData?: unknown;
};

// ── Node-type detection patterns ────────────────────────────────────────────
const RE_TEST_GENERATOR      = /test.?generator/i;
const RE_RETRIEVER           = /retriever|knowledge|qdrant|vector|retrieval|embedding/i;

// ── Structured logging helpers ──────────────────────────────────────────────
const P = "[generate-test]";

function logShape(label: string, value: unknown): void {
    if (Array.isArray(value)) {
        console.log(`${P}   ${label}: Array, length=${value.length}`);
    } else if (value === null || value === undefined) {
        console.log(`${P}   ${label}: missing`);
    } else {
        console.log(`${P}   ${label}: present`);
    }
}

function countDocs(val: unknown): number {
    return Array.isArray(val) ? val.length : 0;
}
function countItems(val: unknown): number {
    return Array.isArray(val) ? val.length : 0;
}

// ── Deep structural logger for a single RAW afed entry ──────────────────────
// Logs the pre-normalisation shape so we can confirm exactly where id/name live.
// Reads ONLY structure and safe scalar fields — no pageContent, no toolOutput.
function logAfedEntryDeep(rawEntry: unknown, i: number): void {
    if (rawEntry === null || rawEntry === undefined || typeof rawEntry !== "object") {
        console.log(`${P} afed_deep[${i}] typeof=${typeof rawEntry}`);
        return;
    }
    const entry = rawEntry as RawAfedEntry;
    const topKeys = Object.keys(entry);
    console.log(`${P} afed_deep[${i}] top-keys: [${topKeys.join(", ")}]`);

    // ── Fields at entry top level ──
    if (typeof entry.id   === "string") console.log(`${P} afed_deep[${i}] entry.id="${entry.id}"`);
    if (typeof entry.name === "string") console.log(`${P} afed_deep[${i}] entry.name="${entry.name}"`);
    if (typeof entry.type === "string") console.log(`${P} afed_deep[${i}] entry.type="${entry.type}"`);

    // ── entry.data (Flowise v2 wrapper) ──
    if (entry.data !== null && entry.data !== undefined && typeof entry.data === "object") {
        const d = entry.data as RawAfedEntry;
        const dKeys = Object.keys(d);
        console.log(`${P} afed_deep[${i}] entry.data keys: [${dKeys.join(", ")}]`);
        if (typeof d.id   === "string") console.log(`${P} afed_deep[${i}] entry.data.id="${d.id}"`);
        if (typeof d.name === "string") console.log(`${P} afed_deep[${i}] entry.data.name="${d.name}"`);

        // input
        if (d.input !== null && d.input !== undefined) {
            if (typeof d.input === "object" && !Array.isArray(d.input)) {
                console.log(`${P} afed_deep[${i}] entry.data.input keys: [${Object.keys(d.input as object).join(", ")}]`);
            } else {
                console.log(`${P} afed_deep[${i}] entry.data.input: ${typeof d.input}${Array.isArray(d.input) ? ` length=${(d.input as unknown[]).length}` : ""}`);
            }
        }

        // output — check type, keys, and known sub-fields; never log values
        if (d.output !== null && d.output !== undefined) {
            if (typeof d.output === "string") {
                const s = d.output as string;
                const preview = s.slice(0, 120).replace(/\n/g, "↵");
                console.log(`${P} afed_deep[${i}] entry.data.output: string length=${s.length} preview="${preview}"`);
            } else if (Array.isArray(d.output)) {
                console.log(`${P} afed_deep[${i}] entry.data.output: Array length=${(d.output as unknown[]).length}`);
            } else if (typeof d.output === "object") {
                const outKeys = Object.keys(d.output as object);
                console.log(`${P} afed_deep[${i}] entry.data.output keys: [${outKeys.join(", ")}]`);
                const o = d.output as RawAfedEntry;
                if (o.sourceDocuments !== undefined) {
                    console.log(`${P} afed_deep[${i}] entry.data.output.sourceDocuments: ${Array.isArray(o.sourceDocuments) ? `Array length=${countDocs(o.sourceDocuments)}` : typeof o.sourceDocuments}`);
                }
                if (o.usedTools !== undefined) {
                    console.log(`${P} afed_deep[${i}] entry.data.output.usedTools: ${Array.isArray(o.usedTools) ? `Array length=${countItems(o.usedTools)}` : typeof o.usedTools}`);
                }
                if (typeof o.text === "string") {
                    console.log(`${P} afed_deep[${i}] entry.data.output.text: string length=${(o.text as string).length}`);
                }
            }
        }

        // state
        if (d.state !== null && d.state !== undefined && typeof d.state === "object") {
            console.log(`${P} afed_deep[${i}] entry.data.state keys: [${Object.keys(d.state as object).join(", ")}]`);
        }
        // chatHistory
        if (Array.isArray(d.chatHistory)) {
            console.log(`${P} afed_deep[${i}] entry.data.chatHistory: Array length=${(d.chatHistory as unknown[]).length}`);
        }
    }

    // ── entry.node (some Flowise variants) ──
    if (entry.node !== null && entry.node !== undefined && typeof entry.node === "object") {
        console.log(`${P} afed_deep[${i}] entry.node keys: [${Object.keys(entry.node as object).join(", ")}]`);
    }
}

// ── agentFlowExecutedData normalisation ────────────────────────────────────
/**
 * Flowise Agentflow v2 wraps each node's execution fields inside entry.data:
 *   { data: { id, name, input, output, state } }
 * This function:
 *   1. Converts afed to a flat array of raw entries (handles Array or Object shapes)
 *   2. Unwraps entry.data when it carries id/name/output/input
 * Returns normalized entries where id/name/output/input are at the top level.
 */
function normaliseAfedEntries(afed: unknown): RawAfedEntry[] {
    let raw: RawAfedEntry[];
    if (Array.isArray(afed)) {
        raw = afed.filter((e): e is RawAfedEntry => e !== null && typeof e === "object");
    } else if (afed !== null && typeof afed === "object") {
        raw = Object.values(afed as Record<string, unknown>).filter(
            (e): e is RawAfedEntry => e !== null && typeof e === "object",
        );
    } else {
        return [];
    }

    return raw.map((entry) => {
        const d = entry.data;
        if (d !== null && d !== undefined && typeof d === "object" && !Array.isArray(d)) {
            const dObj = d as RawAfedEntry;
            // If data carries the expected execution fields, use it as canonical entry
            if ("id" in dObj || "name" in dObj || "output" in dObj || "input" in dObj) {
                return dObj;
            }
        }
        return entry;
    });
}

// ── Combined afed shape logger (deep raw + normalised summary) ──────────────
function logAgentFlowExecutedData(afed: unknown): void {
    if (afed === null || afed === undefined) {
        console.log(`${P} agentFlowExecutedData: missing`);
        return;
    }

    // Raw entries for deep logging
    const rawEntries: RawAfedEntry[] = Array.isArray(afed)
        ? (afed as unknown[]).filter((e): e is RawAfedEntry => e !== null && typeof e === "object")
        : typeof afed === "object"
            ? Object.values(afed as Record<string, unknown>).filter(
                  (e): e is RawAfedEntry => e !== null && typeof e === "object",
              )
            : [];

    console.log(
        `${P} agentFlowExecutedData: ${Array.isArray(afed) ? "Array" : "Object"}, ` +
        `entries=${rawEntries.length}`,
    );

    // Deep structural log for every raw entry
    rawEntries.forEach((entry, i) => logAfedEntryDeep(entry, i));

    // Normalised summary — confirms unwrapping worked
    const normalised = normaliseAfedEntries(afed);
    normalised.forEach((entry, i) => {
        const id   = typeof entry.id   === "string" ? entry.id   : "(no id)";
        const name = typeof entry.name === "string" ? entry.name
            : typeof entry.agentName === "string" ? entry.agentName
            : "(unnamed)";
        const srcOut  = countDocs((entry.output as RawAfedEntry | undefined)?.sourceDocuments);
        const toolOut = countItems((entry.output as RawAfedEntry | undefined)?.usedTools);
        console.log(
            `${P} afed_norm[${i}]: id="${id}" name="${name}" ` +
            `output.sourceDocuments=${srcOut} output.usedTools=${toolOut}`,
        );
    });
}

// ── Source document helpers ─────────────────────────────────────────────────
/**
 * Returns true if an array contains at least one object that looks like a
 * sourceDocument (has pageContent and/or metadata).
 */
function looksLikeSourceDocArray(arr: unknown[]): boolean {
    return arr.some(
        (item) =>
            item !== null &&
            typeof item === "object" &&
            ("pageContent" in (item as object) || "metadata" in (item as object)),
    );
}

/**
 * Recursively walk `value` collecting all real sourceDocuments arrays.
 * Depth-limited; visited-set prevents cycles.
 * Only collects arrays whose items carry pageContent or metadata.
 * Never reads pageContent, toolInput, toolOutput values.
 */
function findSourceDocsRecursive(
    value: unknown,
    depth = 0,
    visited = new WeakSet<object>(),
): RawSourceDoc[] {
    if (depth > 8 || value === null || value === undefined || typeof value !== "object") {
        return [];
    }
    if (visited.has(value as object)) return [];
    visited.add(value as object);

    if (Array.isArray(value)) {
        if (value.length > 0 && looksLikeSourceDocArray(value)) {
            return value as RawSourceDoc[];
        }
        const docs: RawSourceDoc[] = [];
        for (const item of value) {
            docs.push(...findSourceDocsRecursive(item, depth + 1, visited));
        }
        return docs;
    }

    const docs: RawSourceDoc[] = [];
    const obj = value as Record<string, unknown>;
    for (const [key, val] of Object.entries(obj)) {
        // Never descend into content or secret fields
        if (
            key === "pageContent" || key === "toolInput" || key === "toolOutput" ||
            key === "token" || key === "apiKey" || key === "password" || key === "secret"
        ) continue;
        if (val === null || val === undefined) continue;

        // Named source-doc keys — validate before collecting
        if ((key === "sourceDocuments" || key === "sourceDocs") && Array.isArray(val)) {
            if (looksLikeSourceDocArray(val)) {
                docs.push(...(val as RawSourceDoc[]));
                continue; // don't recurse further into confirmed docs
            }
        }

        if (typeof val === "object") {
            docs.push(...findSourceDocsRecursive(val, depth + 1, visited));
        }
    }
    return docs;
}

// ── Tool and agent name extraction from normalised entries ──────────────────
function collectToolNamesFromEntries(entries: RawAfedEntry[]): string[] {
    const names: string[] = [];
    for (const entry of entries) {
        const candidates: unknown[] = [
            entry.usedTools,
            (entry.output as RawAfedEntry | undefined)?.usedTools,
        ];
        for (const c of candidates) {
            if (Array.isArray(c)) {
                for (const t of c) {
                    if (t !== null && typeof t === "object") {
                        const tool = (t as RawToolCall).tool;
                        if (typeof tool === "string") names.push(tool);
                    }
                }
            }
        }
    }
    return names;
}

function collectAgentNamesFromEntries(entries: RawAfedEntry[]): string[] {
    const names: string[] = [];
    for (const entry of entries) {
        const raw =
            typeof entry.agentName === "string" ? entry.agentName
            : typeof entry.name    === "string" ? entry.name
            : null;
        if (raw?.trim()) names.push(raw.trim());
    }
    return names;
}

// ── Debug extraction ────────────────────────────────────────────────────────
function extractDebug(
    data: FlowiseRawResponse,
    intentSent: string,
    courseId: string,
): {
    flowiseChatId: string | null;
    sourceCount: number;
    sources: string[];
    ragUsed: boolean;
    agentName: string | null;
    allAgents: string[];
    toolsUsed: string[];
    executedNodeNames: string[];
    executedNodeIds: string[];
    testGeneratorReached: boolean;
    retrieverOrKnowledgeReached: boolean;
    intentSent: string;
    courseId: string;
    note: string | null;
} {
    // ── v1: agentReasoning ─────────────────────────────────────────────────
    const agentReasoning: RawAgentStep[] = Array.isArray(data.agentReasoning)
        ? data.agentReasoning
        : [];

    const v1SourceDocs: RawSourceDoc[] = [
        ...(Array.isArray(data.sourceDocuments) ? data.sourceDocuments : []),
        ...agentReasoning.flatMap((s) =>
            Array.isArray(s.sourceDocuments) ? s.sourceDocuments : [],
        ),
    ];

    const v1TopTools: string[] = Array.isArray(data.usedTools)
        ? data.usedTools.map((t) => (typeof t.tool === "string" ? t.tool : null))
              .filter((t): t is string => t !== null)
        : [];

    const v1ReasonTools: string[] = agentReasoning.flatMap((s) =>
        Array.isArray(s.usedTools)
            ? s.usedTools.map((t) => (typeof t.tool === "string" ? t.tool : null))
                  .filter((t): t is string => t !== null)
            : [],
    );

    const v1AgentNames: string[] = [
        ...new Set(
            agentReasoning
                .map((s) => (typeof s.agentName === "string" && s.agentName.trim() ? s.agentName.trim() : null))
                .filter((n): n is string => n !== null),
        ),
    ];

    // ── v2: agentFlowExecutedData ──────────────────────────────────────────
    const v2Entries    = normaliseAfedEntries(data.agentFlowExecutedData);
    const v2SourceDocs = findSourceDocsRecursive(data.agentFlowExecutedData);
    const v2ToolNames  = collectToolNamesFromEntries(v2Entries);
    const v2AgentNames = collectAgentNamesFromEntries(v2Entries);
    const v2NodeIds    = v2Entries
        .map((e) => (typeof e.id === "string" ? e.id.trim() : null))
        .filter((s): s is string => s !== null);

    // ── Merge ──────────────────────────────────────────────────────────────
    const allSourceDocs = [...v1SourceDocs, ...v2SourceDocs];

    const sources = [
        ...new Set(
            allSourceDocs
                .map((d) => (typeof d?.metadata?.source === "string" ? d.metadata.source : null))
                .filter((s): s is string => s !== null),
        ),
    ];

    const toolsUsed = [...new Set([...v1TopTools, ...v1ReasonTools, ...v2ToolNames])];
    const allAgents = [...new Set([...v1AgentNames, ...v2AgentNames])];
    const executedNodeNames = allAgents;
    const executedNodeIds   = [...new Set(v2NodeIds)];

    // Prefer last v2 entry name, then last v1 agentReasoning name
    const lastV2 = [...v2AgentNames].reverse().find(Boolean) ?? null;
    const lastV1 =
        [...agentReasoning]
            .reverse()
            .find((s) => typeof s.agentName === "string" && s.agentName.trim())
            ?.agentName?.trim() ?? null;
    const agentName = lastV2 ?? lastV1 ?? null;

    // Node-type detection — check both names and IDs
    const allIdentifiers = [...allAgents, ...executedNodeIds];
    const testGeneratorReached        = allIdentifiers.some((n) => RE_TEST_GENERATOR.test(n));
    const retrieverOrKnowledgeReached = allIdentifiers.some((n) => RE_RETRIEVER.test(n));

    const note =
        allAgents.length === 0
            ? "agentName could not be determined — Flowise did not return agentReasoning or " +
              "agentFlowExecutedData entries with recognisable name/agentName fields. " +
              "Enable 'Return Agent Reasoning' / 'Return Execution Data' in the Flowise " +
              "Agentflow settings."
            : null;

    return {
        flowiseChatId: typeof data.chatId === "string" ? data.chatId : null,
        sourceCount: allSourceDocs.length,
        sources,
        ragUsed: allSourceDocs.length > 0,
        agentName,
        allAgents,
        toolsUsed,
        executedNodeNames,
        executedNodeIds,
        testGeneratorReached,
        retrieverOrKnowledgeReached,
        intentSent,
        courseId,
        note,
    };
}

// ── Route handler ───────────────────────────────────────────────────────────
export async function POST(
    req: NextRequest,
    ctx: { params: Promise<{ coursesId: string }> },
) {
    // ── 0. Read auth context ────────────────────────────────────────────────
    const accessTokenPresent = Boolean(req.cookies.get("access_token")?.value);
    const userRole = req.cookies.get("user_role")?.value;
    const userId   = req.cookies.get("user_id")?.value ?? "";
    const { coursesId: courseId } = await ctx.params;

    const t0 = Date.now();

    console.log(`${P} ─── ROUTE CALLED ───`);
    console.log(`${P} courseId=${courseId || "missing"} | userId=${userId || "missing"} | userRole=${userRole || "missing"}`);
    console.log(`${P} access_token=${accessTokenPresent ? "present" : "missing"}`);
    console.log(`${P} FLOWISE_BASE=${FLOWISE_BASE}`);
    console.log(`${P} FLOWISE_CHATFLOW_ID=${FLOWISE_CHATFLOW_ID}`);

    // ── 1. Auth: teachers only ──────────────────────────────────────────────
    if (userRole !== "teacher") {
        console.log(`${P} DECISION: REJECTED_AUTH (userRole=${userRole ?? "missing"})`);
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    if (!courseId) {
        console.log(`${P} DECISION: REJECTED_MISSING_COURSE_ID`);
        return NextResponse.json({ message: "Missing courseId" }, { status: 400 });
    }

    // ── 2. Parse request body ───────────────────────────────────────────────
    let body: { count?: unknown; questionType?: unknown; topic?: unknown };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const count = Math.min(Math.max(Number(body.count ?? 5), 1), 20);
    const rawType = typeof body.questionType === "string" ? body.questionType : "mixed";
    const questionType: "mcq" | "open" | "mixed" = ["mcq", "open", "mixed"].includes(rawType)
        ? (rawType as "mcq" | "open" | "mixed")
        : "mixed";
    const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 200) : "";

    console.log(`${P} request params: count=${count} type=${questionType} topic=${topic ? `"${topic}"` : "(none)"}`);

    // ── 3. Build structured Flowise question ────────────────────────────────
    const typeLabel =
        questionType === "mcq"
            ? "výber z možností (A/B/C/D)"
            : questionType === "open"
              ? "otvorené otázky"
              : "zmiešané (výber z možností aj otvorené)";

    const topicLine = topic ? `Téma alebo oblasť: ${topic}.` : "";

    const intentSent =
        `GENERATE_TEST: Vygeneruj ${count} testových otázok z materiálov tohto kurzu. ` +
        `Typ otázok: ${typeLabel}. ${topicLine}`.trim();

    const question =
        `[ROLE:teacher] [USER_ID:${userId}] [COURSE_ID:${courseId}] ` +
        intentSent +
        ` Každú otázku označ číslom.` +
        ` Pre výber z možností uveď možnosti A) B) C) D), označ správnu odpoveď` +
        ` a pridaj krátke vysvetlenie.` +
        ` Pre otvorené otázky uveď vzornú odpoveď a krátke vysvetlenie.` +
        ` Ak je dostupný zdroj (názov súboru/prednáška), uveď ho pri otázke.` +
        ` Opri sa VÝLUČNE o materiály tohto kurzu — nepoužívaj všeobecné znalosti.`;

    console.log(`${P} intentSent: ${intentSent}`);
    console.log(`${P} question markers: [ROLE:teacher] [USER_ID:***] [COURSE_ID:${courseId}]`);

    const vars  = { courseId, userId, userRole: "teacher" };
    const state = { courseId, userId, userRole: "teacher" };

    console.log(`${P} payload.state: courseId=${state.courseId ? "present" : "MISSING"} userId=${state.userId ? "present" : "MISSING"} userRole=${state.userRole}`);
    console.log(`${P} payload.vars:  courseId=${vars.courseId  ? "present" : "MISSING"} userId=${vars.userId  ? "present" : "MISSING"} userRole=${vars.userRole}`);

    const flowisePayload = {
        question,
        state,                   // → $flow.state.* (TestGeneratorAgent Qdrant filter)
        vars,                    // → $flow.vars.*
        chatflowConfig: { vars },
        overrideConfig: { vars },
    };

    const targetUrl = `${FLOWISE_BASE}/api/v1/prediction/${FLOWISE_CHATFLOW_ID}`;
    console.log(`${P} → POST ${targetUrl}`);

    // ── 4. Call Flowise ─────────────────────────────────────────────────────
    try {
        const t1 = Date.now();
        const flowiseRes = await fetch(targetUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(flowisePayload),
        });
        console.log(`${P} ← Flowise HTTP ${flowiseRes.status} | RTT: ${Date.now() - t1}ms`);

        if (!flowiseRes.ok) {
            const errText = await flowiseRes.text().catch(() => "");
            console.error(`${P} Flowise error body (first 500 chars): ${errText.slice(0, 500)}`);
            console.log(`${P} DECISION: FLOWISE_ERROR (status=${flowiseRes.status})`);
            return NextResponse.json(
                { message: "Flowise returned an error", detail: errText },
                { status: flowiseRes.status },
            );
        }

        const raw = (await flowiseRes.json().catch(() => null)) as FlowiseRawResponse | null;

        // ── 5. Log raw response shape ───────────────────────────────────────
        const rawKeys = raw ? Object.keys(raw) : [];
        console.log(`${P} raw keys: ${rawKeys.length ? rawKeys.join(", ") : "(none)"}`);
        console.log(`${P} text: ${raw?.text ? `present (length=${raw.text.length})` : "missing"}`);

        // v1 fields
        logShape("sourceDocuments", raw?.sourceDocuments);
        logShape("usedTools",       raw?.usedTools);
        logShape("agentReasoning",  raw?.agentReasoning);

        if (Array.isArray(raw?.agentReasoning) && raw.agentReasoning.length > 0) {
            raw.agentReasoning.forEach((step, i) => {
                const toolCount = Array.isArray(step.usedTools)       ? step.usedTools.length       : 0;
                const docCount  = Array.isArray(step.sourceDocuments) ? step.sourceDocuments.length : 0;
                console.log(
                    `${P} agentReasoning[${i}]: agentName="${step.agentName ?? "(unnamed)"}" ` +
                    `usedTools=${toolCount} sourceDocs=${docCount}`,
                );
            });
        } else {
            console.log(`${P} agentReasoning: not present — checking agentFlowExecutedData (v2)`);
        }

        // v2 field — deep structural log + normalised summary
        logAgentFlowExecutedData(raw?.agentFlowExecutedData);

        // ── 6. Extract text ─────────────────────────────────────────────────
        const text = raw?.text ?? raw?.answer ?? "";
        console.log(`${P} text length: ${text.length} chars`);
        if (!text) {
            console.log(`${P} DECISION: FLOWISE_ERROR (empty text response) | totalTime: ${Date.now() - t0}ms`);
            return NextResponse.json(
                { message: "Flowise returned an empty response" },
                { status: 502 },
            );
        }

        const sourceDocuments = Array.isArray(raw?.sourceDocuments) ? raw.sourceDocuments : [];

        // ── 7. Extract debug (v1 + v2 merged) ──────────────────────────────
        const debug = extractDebug(raw ?? {}, intentSent, courseId);

        // Node execution summary log
        if (debug.executedNodeNames.length > 0) {
            console.log(`${P} executed nodes: ${debug.executedNodeNames.join(" → ")}`);
        } else if (debug.executedNodeIds.length > 0) {
            console.log(`${P} executed node IDs: ${debug.executedNodeIds.join(" → ")}`);
        } else {
            console.log(`${P} executed nodes: unknown — no names/IDs found in response`);
        }

        console.log(
            `${P} diagnostics: testGeneratorReached=${debug.testGeneratorReached} ` +
            `retrieverOrKnowledgeReached=${debug.retrieverOrKnowledgeReached}`,
        );

        console.log(
            `${P} debug summary: sourceCount=${debug.sourceCount} ragUsed=${debug.ragUsed} ` +
            `agentName=${debug.agentName ?? "null"} ` +
            `allAgents=[${debug.allAgents.join(", ") || "none"}] ` +
            `toolsUsed=[${debug.toolsUsed.join(", ") || "none"}]`,
        );

        if (debug.sources.length > 0) {
            debug.sources.forEach((src, i) => console.log(`${P} source[${i}]: ${src}`));
        } else {
            console.log(`${P} sources: none`);
        }

        // ── 8. RAG guard ────────────────────────────────────────────────────
        if (debug.sourceCount === 0) {
            console.log(
                `${P} DECISION: REJECTED_NO_SOURCES (sourceCount=0) | totalTime: ${Date.now() - t0}ms — ` +
                `returning rejection to frontend`,
            );
            return NextResponse.json({
                ragRejected: true,
                message:
                    "Test nebol vygenerovaný z materiálov kurzu, pretože Flowise " +
                    "nevrátil žiadne reálne zdroje. Skontroluj, či sú materiály " +
                    "kurzu nahrané, naindexované a či Flowise filter používa správne " +
                    "premenné ({{$flow.state.courseId}}).",
                debug,
            });
        }

        console.log(`${P} DECISION: ACCEPTED_RAG (sourceCount=${debug.sourceCount}) | textLength: ${text.length} | totalTime: ${Date.now() - t0}ms`);

        return NextResponse.json({ text, sourceDocuments, debug });
    } catch (e) {
        console.error(`${P} DECISION: EXCEPTION | totalTime: ${Date.now() - t0}ms`, e instanceof Error ? e.message : String(e));
        return NextResponse.json(
            { message: "Flowise unreachable. Make sure FLOWISE_BASE is running." },
            { status: 502 },
        );
    }
}
