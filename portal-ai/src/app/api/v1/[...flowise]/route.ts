// src/app/api/v1/[...flowise]/route.ts


import { NextRequest, NextResponse } from "next/server";

const FLOWISE_BASE = process.env.FLOWISE_BASE ?? "http://localhost:2000";
const CORE_API_URL = process.env.CORE_API_URL ?? "http://localhost:4000";

type FlowiseParams = {
    flowise: string[];
};

type FlowiseVars = Record<string, unknown>;

type FlowiseRequestBody = {
    question?: string;
    overrideConfig?: {
        vars?: FlowiseVars;
        [key: string]: unknown;
    };
    chatflowConfig?: {
        vars?: FlowiseVars;
        [key: string]: unknown;
    };
    vars?: FlowiseVars;
    [key: string]: unknown;
};

function getUserRoleFromCookies(req: NextRequest): "student" | "teacher" {
    const value = req.cookies.get("user_role")?.value;
    return value === "teacher" ? "teacher" : "student";
}

function getAccessTokenFromCookies(req: NextRequest): string {
    return req.cookies.get("access_token")?.value ?? "";
}

function getUserIdFromCookies(req: NextRequest): string {
    return req.cookies.get("user_id")?.value ?? "";
}

function isLogoutIntent(text: string): boolean {
    const lower = text.toLowerCase();

    const patterns = [
        "logout",
        "log out",
        "sign out",
        "sign-out",
        "signout",

        "вийти з акаунту",
        "вийти з аккаунту",
        "вийти з акаунта",
        "вийти з профілю",
        "вийди з акаунту",

        "odhlas ma",
        "odhlás ma",
        "odhlasit ma",
        "odhlásiť ma",
        "odhlásiť sa",
        "odhlasit sa",
        "odhlásenie",
    ];

    return patterns.some((p) => lower.includes(p));
}

function getMergedVars(original: FlowiseRequestBody): FlowiseVars {
    const topLevelVars =
        original.vars && typeof original.vars === "object"
            ? original.vars
            : {};

    const chatflowVars =
        original.chatflowConfig?.vars && typeof original.chatflowConfig.vars === "object"
            ? original.chatflowConfig.vars
            : {};

    const overrideVars =
        original.overrideConfig?.vars && typeof original.overrideConfig.vars === "object"
            ? original.overrideConfig.vars
            : {};

    return {
        ...topLevelVars,
        ...chatflowVars,
        ...overrideVars,
    };
}

function getStringVar(vars: FlowiseVars, key: string): string {
    const value = vars[key];
    return typeof value === "string" ? value : "";
}

/**
 * Returns true when `id` looks like a UUID (RFC-4122, any version).
 * AIS chatCourseIds are created with randomUUID() → always UUID.
 * Regular Course IDs are Prisma CUIDs (e.g. clv8abc123…) → never UUID.
 * This lets the proxy detect an AIS chat request without a flag from the frontend.
 */
function isUuidFormat(id: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Resolves the active AIS subject for the authenticated user from the backend.
 * Returns the subject's id and chatCourseId, or null if the user has no active subject.
 * This is the backend source of truth — it cannot be spoofed by the frontend.
 */
async function resolveActiveAisSubject(
    authToken: string,
): Promise<{ id: string; chatCourseId: string; code: string } | null> {
    if (!authToken) return null;

    try {
        const res = await fetch(`${CORE_API_URL}/student/ais/active-subject`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authToken}`,
            },
        });

        if (!res.ok) return null;

        const data = (await res.json()) as {
            activeSubject?: {
                id: string;
                chatCourseId: string;
                code: string;
            } | null;
        };

        return data?.activeSubject ?? null;
    } catch (err) {
        console.error("❌ resolveActiveAisSubject failed:", err);
        return null;
    }
}

async function handler(
    req: NextRequest,
    ctx: { params: Promise<FlowiseParams> }
) {
    const { flowise } = await ctx.params;
    const path = flowise.join("/");
    const incomingUrl = new URL(req.url);

    const targetUrl = `${FLOWISE_BASE}/api/v1/${path}${incomingUrl.search}`;

    console.log("➡️ PROXY →", req.method, targetUrl);

    const headers = new Headers(req.headers);
    headers.delete("host");
    headers.delete("content-length");

    let body: BodyInit | undefined;
    let logoutRequested = false;

    if (req.method !== "GET" && req.method !== "HEAD") {
        const contentType = req.headers.get("content-type") ?? "";

        try {
            if (contentType.includes("application/json")) {
                const original = (await req.json()) as FlowiseRequestBody;

                const pathLower = path.toLowerCase();
                const isChatRequest =
                    pathLower.startsWith("prediction/") ||
                    pathLower.startsWith("chatflows/") ||
                    pathLower.startsWith("chatflows-streaming/") ||
                    pathLower.startsWith("chat/");

                if (isChatRequest) {
                    const userRole = getUserRoleFromCookies(req);
                    const authToken = getAccessTokenFromCookies(req);
                    const cookieUserId = getUserIdFromCookies(req);
                    const questionText =
                        typeof original.question === "string" ? original.question : "";

                    logoutRequested = isLogoutIntent(questionText);
                    if (logoutRequested) {
                        console.log("🔐 logout intent detected");
                    }

                    const mergedVars = getMergedVars(original);
                    const frontendCourseId = getStringVar(mergedVars, "courseId");
                    const userId = getStringVar(mergedVars, "userId") || cookieUserId;

                    // Resolve the active AIS subject ONLY when the request is AIS chat.
                    // AIS chatCourseIds are UUIDs; regular Course IDs are Prisma CUIDs.
                    // This prevents the proxy from overriding the courseId for regular
                    // course chat pages that also use CourseChat with a CUID.
                    let resolvedCourseId = frontendCourseId;
                    const isAisChatRequest = isUuidFormat(frontendCourseId);

                    if (userRole === "student" && authToken && isAisChatRequest) {
                        const active = await resolveActiveAisSubject(authToken);
                        if (active) {
                            resolvedCourseId = active.chatCourseId;
                            console.log(`✅ AIS active subject: ${active.code} → courseId=${resolvedCourseId}`);
                        } else {
                            console.log("ℹ️ UUID courseId but no active AIS subject — keeping frontend value");
                        }
                    }

                    const finalVars: FlowiseVars = {
                        ...mergedVars,
                        courseId: resolvedCourseId,
                        userId,
                        userRole,
                        authToken,
                    };

                    const existingOverrideConfig =
                        original.overrideConfig && typeof original.overrideConfig === "object"
                            ? original.overrideConfig
                            : {};

                    const existingChatflowConfig =
                        original.chatflowConfig && typeof original.chatflowConfig === "object"
                            ? original.chatflowConfig
                            : {};

                    // Prefix keeps role + courseId visible to the Flowise chatflow
                    // prompt template, but stays concise.
                    const userMarker = userId ? `[USER_ID:${userId}] ` : "";
                    const courseMarker = resolvedCourseId ? `[COURSE_ID:${resolvedCourseId}] ` : "";

                    const finalQuestion =
                        `[ROLE:${userRole}] ${userMarker}${courseMarker}${questionText}`.trim();

                    const proxiedPayload: FlowiseRequestBody = {
                        ...original,
                        question: finalQuestion,
                        vars: finalVars,
                        chatflowConfig: { ...existingChatflowConfig, vars: finalVars },
                        overrideConfig:  { ...existingOverrideConfig,  vars: finalVars },
                    };

                    console.log("role:", userRole, "| courseId:", resolvedCourseId, "| userId:", userId, "| hasToken:", Boolean(authToken));
                    console.log("question:", finalQuestion);

                    body = JSON.stringify(proxiedPayload);
                } else {
                    body = JSON.stringify(original);
                }
            } else {
                const buf = await req.arrayBuffer();
                body = buf;
            }
        } catch (err) {
            console.error("❌ Error reading request body:", err);
            return NextResponse.json(
                { message: "Error reading request body" },
                { status: 400 }
            );
        }
    }

    try {
        const flowiseRes = await fetch(targetUrl, {
            method: req.method,
            headers,
            body,
        });

        console.log("⬅️ FLOWISE STATUS:", flowiseRes.status);

        if (!flowiseRes.ok) {
            const errorText = await flowiseRes.text().catch(() => "");
            console.error("❌ Flowise error body:", errorText);

            return NextResponse.json(
                {
                    message: "Flowise returned error",
                    status: flowiseRes.status,
                    body: errorText,
                },
                { status: flowiseRes.status }
            );
        }

        const resHeaders = new Headers(flowiseRes.headers);
        const origin = req.headers.get("origin") ?? "*";
        resHeaders.set("Access-Control-Allow-Origin", origin);
        resHeaders.set("Access-Control-Allow-Credentials", "true");

        if (logoutRequested) {
            const response = new NextResponse(flowiseRes.body, {
                status: flowiseRes.status,
                headers: resHeaders,
            });

            response.cookies.set("access_token", "", {
                path: "/",
                httpOnly: true,
                maxAge: 0,
                sameSite: "lax",
            });

            response.cookies.set("user_role", "", {
                path: "/",
                httpOnly: false,
                maxAge: 0,
                sameSite: "lax",
            });

            response.cookies.set("user_id", "", {
                path: "/",
                httpOnly: false,
                maxAge: 0,
                sameSite: "lax",
            });

            console.log("🔐 cookies cleared by proxy (logout)");
            return response;
        }

        return new Response(flowiseRes.body, {
            status: flowiseRes.status,
            headers: resHeaders,
        });
    } catch (err) {
        console.error("❌ Proxy error calling Flowise:", err);
        return NextResponse.json(
            { message: "Proxy error calling Flowise", error: String(err) },
            { status: 500 }
        );
    }
}

export const GET = handler;
export const POST = handler;