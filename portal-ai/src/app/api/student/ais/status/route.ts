// src/app/api/student/ais/status/route.ts


import { NextRequest, NextResponse } from "next/server";
import { CORE_API_URL, getAccessToken } from "../_utils";

export async function GET(req: NextRequest) {
    try {
        const token = getAccessToken(req);

        const res = await fetch(`${CORE_API_URL}/student/ais/status`, {
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
        console.error("AIS status proxy error:", e);
        return NextResponse.json({ message: "Internal error" }, { status: 500 });
    }
}