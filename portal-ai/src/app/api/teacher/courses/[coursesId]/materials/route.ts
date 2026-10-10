// src/app/api/teacher/courses/[coursesId]/materials/route.ts


import { NextRequest, NextResponse } from "next/server";

const CORE_URL = process.env.CORE_API_URL || "http://localhost:4000";

function getAccessToken(req: NextRequest): string | null {
    return req.cookies.get("access_token")?.value ?? null;
}

export async function GET(
    req: NextRequest,
    ctx: { params: Promise<{ coursesId: string }> }
) {
    try {
        const token = getAccessToken(req);
        const { coursesId } = await ctx.params;
        const courseId = coursesId;

        if (!courseId) {
            return NextResponse.json(
                { message: "Missing courseId" },
                { status: 400 }
            );
        }

        const coreRes = await fetch(`${CORE_URL}/teacher/courses/${courseId}/materials`, {
            method: "GET",
            cache: "no-store",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        });

        const text = await coreRes.text().catch(() => "");
        let json: any = null;

        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            json = text;
        }

        if (!coreRes.ok) {
            return NextResponse.json(
                { message: "Failed to load materials", backendBody: text },
                { status: coreRes.status }
            );
        }

        return NextResponse.json(
            { materials: json?.materials ?? [] },
            { status: 200 }
        );
    } catch (e: any) {
        console.error("NEXT API MATERIALS GET ERROR:", e?.message);
        return NextResponse.json(
            { message: "Load materials failed", error: String(e?.message ?? e) },
            { status: 500 }
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

        const form = await req.formData();

        const file = form.get("file");
        const unitType = String(form.get("unitType") ?? "");
        const unitIndex = String(form.get("unitIndex") ?? "");
        const replaceExisting = String(form.get("replaceExisting") ?? "false");

        if (!courseId) {
            return NextResponse.json({ message: "Missing courseId" }, { status: 400 });
        }

        if (!file || !(file instanceof File)) {
            return NextResponse.json(
                { message: "Missing file (FormData key must be 'file')" },
                { status: 400 }
            );
        }

        const coreForm = new FormData();
        coreForm.set("file", file, file.name);
        coreForm.set("unitType", unitType);
        coreForm.set("unitIndex", unitIndex);
        coreForm.set("replaceExisting", replaceExisting);

        const coreRes = await fetch(`${CORE_URL}/teacher/courses/${courseId}/materials`, {
            method: "POST",
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: coreForm,
        });

        const text = await coreRes.text().catch(() => "");
        let json: any = null;

        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            json = text;
        }

        if (!coreRes.ok) {
            console.error("CORE UPLOAD FAILED:", coreRes.status, text);
            return NextResponse.json(
                { message: "Core upload failed", status: coreRes.status, body: json ?? text },
                { status: coreRes.status }
            );
        }

        const fileUrl = json?.fileUrl || json?.material?.signedUrl || null;

        return NextResponse.json(
            { fileUrl, material: json?.material ?? null },
            { status: 200 }
        );
    } catch (e: any) {
        console.error("NEXT API MATERIALS POST ERROR:", e?.message);
        return NextResponse.json(
            { message: "Upload failed in Next API route", error: String(e?.message ?? e) },
            { status: 500 }
        );
    }
}