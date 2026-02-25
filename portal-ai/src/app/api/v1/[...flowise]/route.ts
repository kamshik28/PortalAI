// src/app/api/v1/[...flowise]/route.ts
import { NextRequest, NextResponse } from "next/server";

const FLOWISE_BASE = process.env.FLOWISE_BASE ?? "http://localhost:2000";

type FlowiseParams = {
    flowise: string[]; // napr. ["prediction", "<id>"]
};

function getUserRoleFromCookies(req: NextRequest): "student" | "teacher" {
    const cookies = req.headers.get("cookie") || "";
    const roleCookie = cookies
        .split("; ")
        .find((c) => c.startsWith("user_role="));

    const value = roleCookie?.split("=")[1];
    if (value === "teacher") return "teacher";
    return "student";
}

// проста перевірка на "хочу вийти з акаунту"
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

/**
 * Дістає vars (courseId/userId) з тіла, незалежно від того як Flowise embed їх кладе.
 * Працює з такими варіантами:
 * - overrideConfig.vars
 * - chatflowConfig.vars
 * - vars
 */
function extractVarsFromBody(original: any): Record<string, any> {
    return (
        original?.overrideConfig?.vars ??
        original?.chatflowConfig?.vars ??
        original?.vars ??
        {}
    );
}

async function handler(
    req: NextRequest,
    ctx: { params: Promise<FlowiseParams> }
) {
    const { flowise } = await ctx.params;
    const path = flowise.join("/"); // "prediction/fe8..."
    const incomingUrl = new URL(req.url);

    const targetUrl = `${FLOWISE_BASE}/api/v1/${path}${incomingUrl.search}`;

    console.log("➡️ PROXY →", req.method, targetUrl);

    const headers = new Headers(req.headers);
    headers.delete("host");
    headers.delete("content-length");

    let body: BodyInit | undefined = undefined;
    let logoutRequested = false; // <- запам’ятаємо, що це був логаут-запит

    if (req.method !== "GET" && req.method !== "HEAD") {
        const contentType = req.headers.get("content-type") ?? "";

        try {
            if (contentType.includes("application/json")) {
                const original = (await req.json()) as any;

                const pathLower = path.toLowerCase();
                const isChatRequest =
                    pathLower.startsWith("prediction/") ||
                    pathLower.startsWith("chatflows/") ||
                    pathLower.startsWith("chatflows-streaming/") ||
                    pathLower.startsWith("chat/"); // інколи теж пролітає

                if (isChatRequest) {
                    const userRole = getUserRoleFromCookies(req);

                    const questionText =
                        typeof original.question === "string" ? original.question : "";

                    // тут ловимо "logout"
                    logoutRequested = isLogoutIntent(questionText);
                    if (logoutRequested) {
                        console.log("   🔐 logout intent detected");
                    }

                    // ✅ ВАЖЛИВО: дістаємо vars з тіла (courseId/userId)
                    const vars = extractVarsFromBody(original);

                    const courseId = typeof vars.courseId === "string" ? vars.courseId : "";
                    const userId = typeof vars.userId === "string" ? vars.userId : "";

                    const wrappedQuestion = JSON.stringify({
                        userRole: userRole, // "student" | "teacher"
                        courseId: courseId, // ✅ щоб Flowise знав курс
                        userId: userId,     // ✅ (не обов'язково, але корисно)
                        message: questionText, // реальний текст юзера
                    });

                    console.log("   role:", userRole);
                    console.log("   courseId:", courseId);
                    console.log("   userId:", userId);
                    console.log("   original question:", questionText);
                    console.log("   wrapped question:", wrappedQuestion);

                    body = JSON.stringify({
                        ...original,
                        question: wrappedQuestion,
                    });
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

        // 🔑 якщо це був логаут – чистимо кукі саме в ЦІЙ відповіді
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

            console.log("   🔐 cookies cleared by proxy (logout)");
            return response;
        }

        // звичайний випадок – просто пробрасываем тіло далі
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
