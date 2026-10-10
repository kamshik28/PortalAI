// src/app/api/student/ais/subjects/route.ts

import { NextRequest, NextResponse } from "next/server";
import { CORE_API_URL, getAccessToken } from "../_utils";

export async function GET(req: NextRequest) {
    try {
        const token = getAccessToken(req);

        // Forward the semesterId query param so the backend can scope subjects
        // to the selected semester and prevent cross-semester leakage.
        const { searchParams } = new URL(req.url);
        const semesterId = searchParams.get("semesterId");

        const backendUrl = semesterId
            ? `${CORE_API_URL}/student/ais/subjects?semesterId=${encodeURIComponent(semesterId)}`
            : `${CORE_API_URL}/student/ais/subjects`;

        const res = await fetch(backendUrl, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        });

        const text = await res.text().catch(() => "");

        return new NextResponse(text, {
            status: res.status,
            headers: {
                "Content-Type": "application/json",
            },
        });
    } catch (e) {
        console.error("AIS subjects proxy error:", e);
        return NextResponse.json({ message: "Internal error" }, { status: 500 });
    }
}
