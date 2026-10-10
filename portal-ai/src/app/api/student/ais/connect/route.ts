// src/app/api/student/ais/connect/route.ts

import { NextRequest, NextResponse } from "next/server";
import { CORE_API_URL, getAccessToken } from "../_utils";

export async function POST(req: NextRequest) {
    try {
        const token = getAccessToken(req);
        const body = await req.json().catch(() => null);

        if (!body || typeof body.uisAuthCookie !== "string") {
            return NextResponse.json(
                { message: "uisAuthCookie is required" },
                { status: 400 }
            );
        }

        const res = await fetch(`${CORE_API_URL}/student/ais/connect`, {
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
            headers: {
                "Content-Type": "application/json",
            },
        });
    } catch (e) {
        console.error("AIS connect proxy error:", e);
        return NextResponse.json({ message: "Internal error" }, { status: 500 });
    }
}