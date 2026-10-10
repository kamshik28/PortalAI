// src/app/api/student/ais/quiz/submit/route.ts
//
// Proxy: forwards quiz attempt submission to core-api.
// core-api resolves the active AIS subject server-side from the JWT token,
// persists AisQuizAttempt + AisQuizAnswer records, and recalculates AisSubjectProgress.

import { NextRequest, NextResponse } from "next/server";
import { CORE_API_URL, getAccessToken } from "../../_utils";

export async function POST(req: NextRequest) {
    const token = getAccessToken(req);

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* validation in core-api */ }

    try {
        const res = await fetch(`${CORE_API_URL}/student/ais/quiz/submit`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(body),
        });

        const text = await res.text().catch(() => "");
        return new NextResponse(text || JSON.stringify({ message: "Empty response" }), {
            status: res.status,
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        console.error("[ais-quiz proxy] submit error:", e);
        return NextResponse.json({ message: "Internal error" }, { status: 500 });
    }
}
