//src/app/api/teacher/courses/[coursesId]/materials/[materialId]/route.ts


import { NextRequest, NextResponse } from "next/server";

const CORE_URL = process.env.CORE_API_URL || "http://localhost:4000";

function getAccessToken(req: NextRequest): string | null {
    return req.cookies.get("access_token")?.value ?? null;
}

export async function DELETE(
    req: NextRequest,
    ctx: { params: Promise<{ coursesId: string; materialId: string }> }
) {
    try {
        const token = getAccessToken(req);
        const { coursesId, materialId } = await ctx.params;
        const courseId = coursesId;

        if (!courseId || !materialId) {
            return NextResponse.json(
                { message: "Missing courseId or materialId" },
                { status: 400 }
            );
        }

        const coreRes = await fetch(
            `${CORE_URL}/teacher/courses/${courseId}/materials/${materialId}`,
            {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            }
        );

        const text = await coreRes.text().catch(() => "");

        if (!coreRes.ok) {
            return NextResponse.json(
                { message: "Failed to delete material", backendBody: text },
                { status: coreRes.status }
            );
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (e: any) {
        console.error("NEXT API MATERIAL DELETE ERROR:", e?.message);
        return NextResponse.json(
            { message: "Delete failed", error: String(e?.message ?? e) },
            { status: 500 }
        );
    }
}