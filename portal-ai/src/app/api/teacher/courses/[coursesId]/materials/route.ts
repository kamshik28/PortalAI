// src/app/api/teacher/courses/[coursesId]/materials/route.ts
import { NextResponse } from "next/server";

const CORE_URL = process.env.CORE_API_URL || "http://localhost:4000";

export async function POST(
    req: Request,
    ctx: { params: Promise<{ coursesId: string }> }
) {
    try {
        const { coursesId } = await ctx.params;   // <- головний фікс
        const courseId = coursesId;

        const form = await req.formData();

        const file = form.get("file");
        const unitType = String(form.get("unitType") ?? "");
        const unitIndex = String(form.get("unitIndex") ?? "");

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

        const auth = req.headers.get("authorization") || "";

        const coreRes = await fetch(`${CORE_URL}/teacher/courses/${courseId}/materials`, {
            method: "POST",
            headers: {
                ...(auth ? { Authorization: auth } : {}),
            },
            body: coreForm,
        });

        const text = await coreRes.text();
        let json: any = null;
        try {
            json = text ? JSON.parse(text) : null;
        } catch {}

        if (!coreRes.ok) {
            console.error("CORE UPLOAD FAILED:", coreRes.status, text);
            return NextResponse.json(
                { message: "Core upload failed", status: coreRes.status, body: json ?? text },
                { status: coreRes.status }
            );
        }

        const fileUrl = json?.fileUrl || json?.material?.signedUrl || null;

        if (!fileUrl) {
            console.error("CORE RESPONSE OK BUT NO URL:", json);
            return NextResponse.json(
                { message: "Core did not return fileUrl", coreBody: json },
                { status: 500 }
            );
        }

        return NextResponse.json({ fileUrl, material: json?.material ?? null }, { status: 200 });
    } catch (e: any) {
        console.error("NEXT API MATERIALS ROUTE ERROR:", e?.message);
        console.error(e);
        return NextResponse.json(
            { message: "Upload failed in Next API route", error: String(e?.message ?? e) },
            { status: 500 }
        );
    }
}
