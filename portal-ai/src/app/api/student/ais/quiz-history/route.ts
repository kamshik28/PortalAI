// src/app/api/student/ais/quiz-history/route.ts
//
// Proxy: fetches the last 20 quiz attempts for the student's active AIS subject.
// core-api resolves the active AIS subject server-side from the JWT token.

import { NextRequest, NextResponse } from "next/server";
import { CORE_API_URL, getAccessToken } from "../_utils";

export async function GET(req: NextRequest) {
    const token = getAccessToken(req);

    try {
        const res = await fetch(`${CORE_API_URL}/student/ais/quiz-history`, {
            method: "GET",
            cache: "no-store",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        });

        const text = await res.text().catch(() => "");
        return new NextResponse(text || JSON.stringify({ message: "Empty response" }), {
            status: res.status,
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        console.error("[ais-quiz-history proxy] GET error:", e);
        return NextResponse.json({ message: "Internal error" }, { status: 500 });
    }
}
