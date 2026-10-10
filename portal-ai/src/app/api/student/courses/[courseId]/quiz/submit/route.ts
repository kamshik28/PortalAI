// src/app/api/student/courses/[courseId]/quiz/submit/route.ts
//
// Proxy: forwards quiz attempt submission to core-api.
// core-api persists QuizAttempt + QuizAnswer records and recalculates StudentCourseProgress.

import { NextRequest, NextResponse } from "next/server";

const CORE_API_URL = process.env.CORE_API_URL ?? "http://localhost:4000";

function getAccessToken(req: NextRequest): string | null {
    return req.cookies.get("access_token")?.value ?? null;
}

export async function POST(
    req: NextRequest,
    ctx: { params: Promise<{ courseId: string }> },
) {
    const token = getAccessToken(req);
    const { courseId } = await ctx.params;

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* validation in core-api */ }

    try {
        const res = await fetch(
            `${CORE_API_URL}/student/courses/${courseId}/quiz/submit`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify(body),
            },
        );

        const text = await res.text().catch(() => "");
        return new NextResponse(text || JSON.stringify({ message: "Empty response" }), {
            status: res.status,
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        console.error("[course-quiz proxy] submit error:", e);
        return NextResponse.json({ message: "Internal error" }, { status: 500 });
    }
}
