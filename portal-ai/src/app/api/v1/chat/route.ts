// src/app/api/v1/chat/route.ts
import { NextRequest, NextResponse } from "next/server";

const FLOWISE_INTERNAL_URL =
    process.env.FLOWISE_INTERNAL_URL ?? "http://localhost:2000";

type UserRole = "student" | "teacher";

function getUserRoleFromCookies(req: NextRequest): UserRole {
    const value = req.cookies.get("user_role")?.value;
    if (value === "teacher" || value === "student") return value;
    return "student";
}

/**
 * Дістає vars (courseId/userId) з тіла, незалежно від того як Flowise embed їх кладе.
 */
function extractVarsFromBody(body: any): Record<string, any> {
    return (
        body?.overrideConfig?.vars ??
        body?.chatflowConfig?.vars ??
        body?.vars ??
        {}
    );
}

export const runtime = "nodejs"; // на всяк, щоб проксі стріми нормально

export async function POST(req: NextRequest) {
    // 1) дістаємо chatflowid з query
    const url = new URL(req.url);
    const chatflowid = url.searchParams.get("chatflowid");

    if (!chatflowid) {
        return NextResponse.json(
            { message: "Missing chatflowid in query" },
            { status: 400 }
        );
    }

    // 2) читаємо тіло від FullPageChat
    const rawBody = await req.json().catch(() => null);

    if (!rawBody || typeof rawBody !== "object") {
        return NextResponse.json(
            { message: "Invalid request body" },
            { status: 400 }
        );
    }

    const body = rawBody as Record<string, unknown>;

    const originalQuestion =
        typeof (body as any).question === "string" ? (body as any).question : "";

    const userRole = getUserRoleFromCookies(req);

    // ✅ витягаємо vars (courseId/userId)
    const vars = extractVarsFromBody(body);

    const courseId = typeof vars.courseId === "string" ? vars.courseId : "";
    const userId = typeof vars.userId === "string" ? vars.userId : "";

    // 3) формуємо наш JSON для question
    const questionPayload = {
        userRole: userRole, // "student" | "teacher" з куки
        courseId: courseId, // ✅ щоб Flowise знав курс
        userId: userId,     // ✅ опційно
        message: originalQuestion, // те, що реально написав юзер
    };

    const proxiedBody: Record<string, unknown> = {
        ...body,
        question: JSON.stringify(questionPayload),
    };

    console.log("➡️ Proxy to Flowise /api/v1/chat");
    console.log("   role:", userRole);
    console.log("   courseId:", courseId);
    console.log("   userId:", userId);
    console.log("   originalQuestion:", originalQuestion);
    console.log("   final question:", proxiedBody.question);

    // 4) шлемо далі в Flowise
    const flowiseRes = await fetch(
        `${FLOWISE_INTERNAL_URL}/api/v1/chat?chatflowid=${encodeURIComponent(
            chatflowid
        )}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(proxiedBody),
        }
    );

    // 5) просто пробрасываем відповідь як є (в т.ч. стрім)
    return new Response(flowiseRes.body, {
        status: flowiseRes.status,
        headers: {
            "Content-Type":
                flowiseRes.headers.get("content-type") ?? "application/json",
            "Cache-Control": "no-cache",
        },
    });
}
