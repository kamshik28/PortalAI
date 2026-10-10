// src/app/api/teacher/courses/[courseId]/students/route.ts

import { NextRequest, NextResponse } from "next/server";

const CORE_API_URL = process.env.CORE_API_URL ?? "http://localhost:4000";

function getAccessToken(req: NextRequest): string | null {
    const cookies = req.headers.get("cookie") || "";
    const tokenCookie = cookies
        .split("; ")
        .find((c) => c.startsWith("access_token="));

    return tokenCookie?.split("=")[1] ?? null;
}

export async function GET(
    req: NextRequest,
    ctx: { params: Promise<{ coursesId: string }> }
) {
    try {
        const token = getAccessToken(req);
        const { coursesId } = await ctx.params;
        const courseId = coursesId;

        console.log("PROXY GET students -> courseId:", courseId);
        console.log("PROXY GET students -> has token:", Boolean(token));

        if (!courseId) {
            return NextResponse.json(
                { message: "Missing courseId" },
                { status: 400 },
            );
        }

        const res = await fetch(
            `${CORE_API_URL}/teacher/courses/${courseId}/students`,
            {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            },
        );

        const text = await res.text().catch(() => "");
        console.log("PROXY GET students -> backend status:", res.status);
        console.log("PROXY GET students -> backend body:", text);

        if (!res.ok) {
            return NextResponse.json(
                { message: "Failed to load students", backendBody: text },
                { status: res.status },
            );
        }

        const data = text ? JSON.parse(text) : null;
        const students = (data as any)?.students ?? data ?? [];

        return NextResponse.json({ students });
    } catch (e) {
        console.error("Get students API error:", e);
        return NextResponse.json(
            { message: "Internal error" },
            { status: 500 },
        );
    }
}

export async function POST(
    req: NextRequest,
    ctx: { params: Promise<{ coursesId: string }> }
) {
    try {
        const token = getAccessToken(req);
        const { coursesId } = await ctx.params;
        const courseId = coursesId;
        const body = await req.json().catch(() => null);

        console.log("PROXY ADD student -> courseId:", courseId);
        console.log("PROXY ADD student -> has token:", Boolean(token));
        console.log("PROXY ADD student -> body:", body);

        if (!courseId) {
            return NextResponse.json(
                { message: "Missing courseId" },
                { status: 400 },
            );
        }

        if (!body || (!body.studentId && !body.studentEmail)) {
            return NextResponse.json(
                { message: "Invalid payload" },
                { status: 400 },
            );
        }

        const res = await fetch(
            `${CORE_API_URL}/teacher/courses/${courseId}/students`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify(body),
            },
        );

        const text = await res.text().catch(() => "");
        console.log("PROXY ADD student -> backend status:", res.status);
        console.log("PROXY ADD student -> backend body:", text);

        if (!res.ok) {
            return NextResponse.json(
                { message: "Failed to add student", backendBody: text },
                { status: res.status },
            );
        }

        const data = text ? JSON.parse(text) : null;
        return NextResponse.json(data, { status: 201 });
    } catch (e) {
        console.error("Add student API error:", e);
        return NextResponse.json(
            { message: "Internal error" },
            { status: 500 },
        );
    }
}