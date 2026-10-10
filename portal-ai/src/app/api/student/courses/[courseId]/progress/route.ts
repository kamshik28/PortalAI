// src/app/api/student/courses/[courseId]/progress/route.ts
//
// Proxy: fetches student learning progress for a specific course from core-api.

import { NextRequest, NextResponse } from "next/server";

const CORE_API_URL = process.env.CORE_API_URL ?? "http://localhost:4000";

function getAccessToken(req: NextRequest): string | null {
    return req.cookies.get("access_token")?.value ?? null;
}

export async function GET(
    req: NextRequest,
    ctx: { params: Promise<{ courseId: string }> },
) {
    const token = getAccessToken(req);
    const { courseId } = await ctx.params;

    try {
        const res = await fetch(
            `${CORE_API_URL}/student/courses/${courseId}/progress`,
            {
                method: "GET",
                cache: "no-store",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            },
        );

        const text = await res.text().catch(() => "");
        return new NextResponse(text || JSON.stringify({ message: "Empty response" }), {
            status: res.status,
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        console.error("[course-progress proxy] GET error:", e);
        return NextResponse.json({ message: "Internal error" }, { status: 500 });
    }
}
