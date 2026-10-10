// src/app/api/student/ais/subjects/[subjects]/documents/route.ts


import { NextRequest, NextResponse } from "next/server";

import { CORE_API_URL, getAccessToken } from "../../../_utils";

export async function GET(
    req: NextRequest,
    ctx: { params: Promise<{ subjectId: string }> }
) {
    try {
        const token = getAccessToken(req);
        const { subjectId } = await ctx.params;

        const res = await fetch(
            `${CORE_API_URL}/student/ais/subjects/${subjectId}/documents`,
            {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            }
        );

        const text = await res.text().catch(() => "");

        return new NextResponse(text, {
            status: res.status,
            headers: {
                "Content-Type": "application/json",
            },
        });
    } catch (e) {
        console.error("AIS documents proxy error:", e);
        return NextResponse.json({ message: "Internal error" }, { status: 500 });
    }
}