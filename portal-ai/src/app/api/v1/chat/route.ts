// src/app/api/v1/chat/route.ts
import { NextRequest, NextResponse } from "next/server";

const FLOWISE_INTERNAL_URL =
    process.env.FLOWISE_INTERNAL_URL ?? "http://localhost:2000";

type UserRole = "student" | "teacher";
type FlowiseVars = Record<string, unknown>;

function getUserRoleFromCookies(req: NextRequest): UserRole {
    const value = req.cookies.get("user_role")?.value;
    if (value === "teacher" || value === "student") return value;
    return "student";
}

function getAccessTokenFromCookies(req: NextRequest): string {
    return req.cookies.get("access_token")?.value ?? "";
}

function getUserIdFromCookies(req: NextRequest): string {
    return req.cookies.get("user_id")?.value ?? "";
}

function getMergedVars(body: Record<string, unknown>): FlowiseVars {
    const topLevelVars =
        body.vars && typeof body.vars === "object"
            ? (body.vars as FlowiseVars)
            : {};

    const chatflowVars =
        body.chatflowConfig &&
        typeof body.chatflowConfig === "object" &&
        (body.chatflowConfig as any).vars &&
        typeof (body.chatflowConfig as any).vars === "object"
            ? ((body.chatflowConfig as any).vars as FlowiseVars)
            : {};

    const overrideVars =
        body.overrideConfig &&
        typeof body.overrideConfig === "object" &&
        (body.overrideConfig as any).vars &&
        typeof (body.overrideConfig as any).vars === "object"
            ? ((body.overrideConfig as any).vars as FlowiseVars)
            : {};

    return {
        ...topLevelVars,
        ...chatflowVars,
        ...overrideVars,
    };
}

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    const url = new URL(req.url);
    const chatflowid = url.searchParams.get("chatflowid");

    if (!chatflowid) {
        return NextResponse.json(
            { message: "Missing chatflowid in query" },
            { status: 400 }
        );
    }

    const rawBody = await req.json().catch(() => null);

    if (!rawBody || typeof rawBody !== "object") {
        return NextResponse.json(
            { message: "Invalid request body" },
            { status: 400 }
        );
    }

    const body = rawBody as Record<string, unknown>;

    const originalQuestion =
        typeof body.question === "string" ? body.question : "";

    const userRole = getUserRoleFromCookies(req);
    const authToken = getAccessTokenFromCookies(req);
    const cookieUserId = getUserIdFromCookies(req);

    const mergedVars = getMergedVars(body);

    const courseId = typeof mergedVars.courseId === "string" ? mergedVars.courseId : "";
    const userId =
        typeof mergedVars.userId === "string" && mergedVars.userId
            ? mergedVars.userId
            : cookieUserId;

    const finalVars: FlowiseVars = {
        ...mergedVars,
        courseId,
        userId,
        userRole,
        authToken,
    };

    const existingOverrideConfig =
        body.overrideConfig && typeof body.overrideConfig === "object"
            ? (body.overrideConfig as Record<string, unknown>)
            : {};

    const existingChatflowConfig =
        body.chatflowConfig && typeof body.chatflowConfig === "object"
            ? (body.chatflowConfig as Record<string, unknown>)
            : {};

    const proxiedBody: Record<string, unknown> = {
        ...body,
        question: originalQuestion,
        vars: finalVars,
        chatflowConfig: {
            ...existingChatflowConfig,
            vars: finalVars,
        },
        overrideConfig: {
            ...existingOverrideConfig,
            vars: finalVars,
        },
    };

    console.log("➡️ Proxy to Flowise /api/v1/chat");
    console.log("   userRole:", userRole);
    console.log("   courseId:", courseId);
    console.log("   userId:", userId);
    console.log("   hasAuthToken:", Boolean(authToken));
    console.log("   originalQuestion:", originalQuestion);
    console.log("   final vars:", (proxiedBody.overrideConfig as any)?.vars);

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

    return new Response(flowiseRes.body, {
        status: flowiseRes.status,
        headers: {
            "Content-Type":
                flowiseRes.headers.get("content-type") ?? "application/json",
            "Cache-Control": "no-cache",
        },
    });
}