// src/app/api/teacher/courses/[courseId]/students/[studentId]/route.ts
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

export async function DELETE(
    req: NextRequest,
    { params }: { params: { courseId: string; studentId: string } },
) {
    try {
        const token = getAccessToken(req);
        const { courseId, studentId } = params;

        const res = await fetch(
            `${CORE_API_URL}/teacher/courses/${courseId}/students/${studentId}`,
            {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            },
        );

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            console.error("Remove student backend error:", text);
            return NextResponse.json(
                { message: "Failed to remove student" },
                { status: res.status },
            );
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("Remove student API error:", e);
        return NextResponse.json(
            { message: "Internal error" },
            { status: 500 },
        );
    }
}
