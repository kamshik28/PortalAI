// src/app/api/student/courses/route.ts

import { NextRequest, NextResponse } from "next/server";

const CORE_API_URL = process.env.CORE_API_URL ?? "http://localhost:4000";

function getAccessToken(req: NextRequest): string | null {
    return req.cookies.get("access_token")?.value ?? null;
}

export async function GET(req: NextRequest) {
    try {
        const token = getAccessToken(req);

        const res = await fetch(`${CORE_API_URL}/student/courses`, {
            method: "GET",
            cache: "no-store",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        });

        const text = await res.text().catch(() => "");

        if (!res.ok) {
            console.error("Student courses backend error (GET):", res.status, text);
            return NextResponse.json(
                { message: "Failed to load student courses", backendBody: text },
                { status: res.status },
            );
        }

        const data = text ? JSON.parse(text) : null;
        const courses = (data as any)?.courses ?? data ?? [];

        return NextResponse.json({ courses });
    } catch (e) {
        console.error("Student courses API error (GET):", e);
        return NextResponse.json(
            { message: "Internal error" },
            { status: 500 },
        );
    }
}