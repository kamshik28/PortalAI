// src/app/api/student/ais/quiz/route.ts
//
// Thin proxy: forwards quiz generation request to core-api.
// The core-api resolves the active AIS subject server-side from the JWT token
// and performs Qdrant retrieval with multi-document diversification.
// No subject/course IDs are trusted from the frontend.

import { NextRequest, NextResponse } from "next/server";
import { CORE_API_URL, getAccessToken } from "../_utils";

export async function POST(req: NextRequest) {
    const token = getAccessToken(req);

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* defaults apply in core-api */ }

    try {
        const res = await fetch(`${CORE_API_URL}/student/ais/quiz/generate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(body),
        });

        const text = await res.text().catch(() => "");

        return new NextResponse(text || JSON.stringify({ message: "Empty response from core-api" }), {
            status: res.status,
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        console.error("[ais-quiz proxy] quiz/generate error:", e);
        return NextResponse.json({ message: "Internal error" }, { status: 500 });
    }
}
