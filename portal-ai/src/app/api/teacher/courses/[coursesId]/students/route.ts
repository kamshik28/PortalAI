// src/app/api/teacher/courses/[courseId]/students/route.ts
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

export async function GET(
    req: NextRequest,
    { params }: { params: { courseId: string } },
) {
    try {
        const token = getAccessToken(req);
        const { courseId } = params;

        // TODO: URL podľa backendu
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

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            console.error("Get students backend error:", text);
            return NextResponse.json(
                { message: "Failed to load students" },
                { status: res.status },
            );
        }

        const data = await res.json().catch(() => null);
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
    { params }: { params: { courseId: string } },
) {
    try {
        const token = getAccessToken(req);
        const { courseId } = params;
        const body = await req.json().catch(() => null);

        // можна додавати за studentId або email – вибери, що зручніше
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

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            console.error("Add student backend error:", text);
            return NextResponse.json(
                { message: "Failed to add student" },
                { status: res.status },
            );
        }

        const data = await res.json().catch(() => null);
        return NextResponse.json(data, { status: 201 });
    } catch (e) {
        console.error("Add student API error:", e);
        return NextResponse.json(
            { message: "Internal error" },
            { status: 500 },
        );
    }
}
