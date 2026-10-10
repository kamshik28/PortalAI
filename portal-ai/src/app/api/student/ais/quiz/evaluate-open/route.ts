// src/app/api/student/ais/quiz/evaluate-open/route.ts
//
// Proxy: forwards open-answer evaluation to core-api.
// The core-api authenticates the user via JWT and calls OpenAI for semantic evaluation.
// The student's subject scope is always resolved server-side — never trusted from body.

import { NextRequest, NextResponse } from "next/server";
import { CORE_API_URL, getAccessToken } from "../../_utils";

export async function POST(req: NextRequest) {
    const token = getAccessToken(req);

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* validation happens in core-api */ }

    try {
        const res = await fetch(`${CORE_API_URL}/student/ais/quiz/evaluate-open`, {
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
        console.error("[ais-quiz proxy] evaluate-open error:", e);
        return NextResponse.json({ message: "Internal error" }, { status: 500 });
    }
}
