// src/app/api/teacher/courses/[courseId]/students/[studentId]/route.ts


import { NextRequest, NextResponse } from "next/server";

const CORE_API_URL = process.env.CORE_API_URL ?? "http://localhost:4000";

function getAccessToken(req: NextRequest): string | null {
    return req.cookies.get("access_token")?.value ?? null;
}

function extractIdsFromPath(pathname: string): {
    courseId: string;
    studentId: string;
} {
    const match = pathname.match(
        /\/api\/teacher\/courses\/([^/]+)\/students\/([^/]+)\/?$/i
    );

    return {
        courseId: match?.[1] ?? "",
        studentId: match?.[2] ?? "",
    };
}

export async function DELETE(
    req: NextRequest,
    ctx: {
        params: Promise<{
            courseId?: string;
            coursesId?: string;
            studentId?: string;
            studentsId?: string;
            studentid?: string;
        }>;
    }
) {
    try {
        const token = getAccessToken(req);
        const params = await ctx.params;
        const idsFromPath = extractIdsFromPath(req.nextUrl.pathname);

        const courseId =
            params.courseId ??
            params.coursesId ??
            idsFromPath.courseId ??
            "";

        const studentId =
            params.studentId ??
            params.studentsId ??
            params.studentid ??
            idsFromPath.studentId ??
            "";

        console.log("REMOVE STUDENT PROXY -> courseId:", courseId);
        console.log("REMOVE STUDENT PROXY -> studentId:", studentId);
        console.log("REMOVE STUDENT PROXY -> has token:", Boolean(token));

        if (!courseId || !studentId) {
            return NextResponse.json(
                { message: "Missing courseId or studentId" },
                { status: 400 }
            );
        }

        const res = await fetch(
            `${CORE_API_URL}/teacher/courses/${courseId}/students/${studentId}`,
            {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            }
        );

        const text = await res.text().catch(() => "");

        console.log("REMOVE STUDENT PROXY -> backend status:", res.status);
        console.log("REMOVE STUDENT PROXY -> backend body:", text);

        if (!res.ok) {
            return NextResponse.json(
                { message: "Failed to remove student", backendBody: text },
                { status: res.status }
            );
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (e) {
        console.error("Remove student API error:", e);
        return NextResponse.json(
            { message: "Internal error" },
            { status: 500 }
        );
    }
}
