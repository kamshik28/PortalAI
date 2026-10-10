// src/app/api/student/courses/[coursesId]/route.ts
import { NextRequest, NextResponse } from "next/server";

const CORE_API_URL = process.env.CORE_API_URL ?? "http://localhost:4000";

function getAccessToken(req: NextRequest): string | null {
    return req.cookies.get("access_token")?.value ?? null;
}

export async function GET(
    req: NextRequest,
    ctx: { params: Promise<{ courseId?: string; coursesId?: string }> }
) {
    try {
        const token = getAccessToken(req);
        const params = await ctx.params;
        const courseId = params.courseId ?? params.coursesId ?? "";

        if (!courseId) {
            return NextResponse.json(
                { message: "Missing courseId" },
                { status: 400 },
            );
        }

        const res = await fetch(`${CORE_API_URL}/student/courses/${courseId}`, {
            method: "GET",
            cache: "no-store",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        });

        const text = await res.text().catch(() => "");

        if (!res.ok) {
            console.error("Student course detail backend error (GET):", res.status, text);
            return NextResponse.json(
                { message: "Failed to load student course detail", backendBody: text },
                { status: res.status },
            );
        }

        const data = text ? JSON.parse(text) : null;
        const course = (data as any)?.course ?? data ?? null;

        return NextResponse.json({ course });
    } catch (e) {
        console.error("Student course detail API error (GET):", e);
        return NextResponse.json(
            { message: "Internal error" },
            { status: 500 },
        );
    }
}