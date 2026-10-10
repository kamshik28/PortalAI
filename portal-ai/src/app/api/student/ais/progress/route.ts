// src/app/api/student/ais/progress/route.ts
//
// Proxy: fetches AIS learning progress for the student's active subject.
// core-api resolves the active AIS subject server-side from the JWT token.

import { NextRequest, NextResponse } from "next/server";
import { CORE_API_URL, getAccessToken } from "../_utils";

export async function GET(req: NextRequest) {
    const token = getAccessToken(req);

    try {
        const res = await fetch(`${CORE_API_URL}/student/ais/progress`, {
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
        console.error("[ais-progress proxy] GET error:", e);
        return NextResponse.json({ message: "Internal error" }, { status: 500 });
    }
}
