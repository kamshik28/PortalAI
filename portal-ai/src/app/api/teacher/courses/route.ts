// src/app/api/teacher/courses/route.ts
import { NextRequest, NextResponse } from "next/server";

const CORE_API_URL =
    process.env.CORE_API_URL ?? "http://localhost:4000";

function getAccessToken(req: NextRequest): string | null {
    const cookies = req.headers.get("cookie") || "";
    const tokenCookie = cookies
        .split("; ")
        .find((c) => c.startsWith("access_token="));

    return tokenCookie?.split("=")[1] ?? null;
}

export async function GET(req: NextRequest) {
    try {
        const token = getAccessToken(req);

        const res = await fetch(`${CORE_API_URL}/teacher/courses`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        });

        const text = await res.text().catch(() => "");

        if (!res.ok) {
            console.error(
                "Teacher courses backend error (GET):",
                res.status,
                text,
            );
            // поки що просто пробрасываем статус з беку
            return NextResponse.json(
                { message: "Failed to load courses", backendBody: text },
                { status: res.status },
            );
        }

        // якщо бек повернув JSON – парсимо його
        const data = text ? JSON.parse(text) : null;
        const courses = (data as any)?.courses ?? data ?? [];

        return NextResponse.json({ courses });
    } catch (e) {
        console.error("Teacher courses API error (GET):", e);
        return NextResponse.json(
            { message: "Internal error" },
            { status: 500 },
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const token = getAccessToken(req);
        const body = await req.json().catch(() => null);

        if (!body || typeof body.name !== "string") {
            return NextResponse.json(
                { message: "Invalid payload" },
                { status: 400 },
            );
        }

        const res = await fetch(`${CORE_API_URL}/teacher/courses`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(body),
        });

        const text = await res.text().catch(() => "");

        if (!res.ok) {
            console.error(
                "Teacher courses backend error (POST):",
                res.status,
                text,
            );
            return NextResponse.json(
                { message: "Failed to create course", backendBody: text },
                { status: res.status },
            );
        }

        const data = text ? JSON.parse(text) : null;
        return NextResponse.json(data, { status: 201 });
    } catch (e) {
        console.error("Teacher courses API error (POST):", e);
        return NextResponse.json(
            { message: "Internal error" },
            { status: 500 },
        );
    }
}
