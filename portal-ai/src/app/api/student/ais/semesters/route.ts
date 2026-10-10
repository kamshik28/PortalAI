// src/app/api/student/ais/semesters/route.ts

import { NextRequest, NextResponse } from "next/server";
import { CORE_API_URL, getAccessToken } from "../_utils";

export async function GET(req: NextRequest) {
    try {
        const token = getAccessToken(req);

        const res = await fetch(`${CORE_API_URL}/student/ais/semesters`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        });

        const text = await res.text().catch(() => "");

        return new NextResponse(text || JSON.stringify({ message: "No response body" }), {
            status: res.status,
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        console.error("AIS semesters proxy error:", e);
        return NextResponse.json({ message: "Internal error" }, { status: 500 });
    }
}
