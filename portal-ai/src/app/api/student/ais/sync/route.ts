// src/app/api/student/ais/sync/route.ts

import { NextRequest, NextResponse } from "next/server";
import { CORE_API_URL, getAccessToken } from "../_utils";

export async function POST(req: NextRequest) {
    try {
        const token = getAccessToken(req);

        // Forward semesterId from the request body (if present).
        let body: unknown = {};
        try {
            body = await req.json();
        } catch {
            // Empty body is fine — backend treats missing semesterId as "auto-discover".
        }

        const res = await fetch(`${CORE_API_URL}/student/ais/sync`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(body),
        });

        const text = await res.text().catch(() => "");

        return new NextResponse(text, {
            status: res.status,
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        console.error("AIS sync proxy error:", e);
        return NextResponse.json({ message: "Internal error" }, { status: 500 });
    }
}
