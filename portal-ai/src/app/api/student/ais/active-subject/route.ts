// src/app/api/student/ais/active-subject/route.ts

import { NextRequest, NextResponse } from "next/server";
import { CORE_API_URL, getAccessToken } from "../_utils";

export async function GET(req: NextRequest) {
    try {
        const token = getAccessToken(req);

        const res = await fetch(`${CORE_API_URL}/student/ais/active-subject`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        });

        const text = await res.text().catch(() => "");

        return new NextResponse(text || JSON.stringify({ activeSubject: null }), {
            status: res.status,
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        console.error("AIS active-subject proxy error:", e);
        return NextResponse.json({ activeSubject: null }, { status: 500 });
    }
}
