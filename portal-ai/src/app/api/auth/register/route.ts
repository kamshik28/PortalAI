// src/app/api/auth/register/route.ts
import { NextResponse } from "next/server";

const CORE_API_URL = process.env.CORE_API_URL ?? "http://localhost:4000";

export async function POST(req: Request) {
    let body: { fullName?: string; email?: string; password?: string; role?: string };

    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ message: "Invalid JSON payload" }, { status: 400 });
    }

    if (!body.email || !body.password) {
        return NextResponse.json(
            { message: "Email and password are required" },
            { status: 400 },
        );
    }

    try {
        const roleRaw = typeof body.role === "string" ? body.role.toLowerCase() : "student";
        const role: "student" | "teacher" = roleRaw === "teacher" ? "teacher" : "student";

        const nestRes = await fetch(`${CORE_API_URL}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fullName: body.fullName,
                email: body.email,
                password: body.password,
                role,
            }),
        });

        const text = await nestRes.text();
        let data: Record<string, unknown>;
        try {
            data = JSON.parse(text);
        } catch {
            data = { raw: text };
        }

        return NextResponse.json(data ?? {}, { status: nestRes.status });
    } catch (e) {
        console.error("Register API: cannot reach core API:", e instanceof Error ? e.message : "unknown");
        return NextResponse.json(
            { message: "Cannot reach core API. Check CORE_API_URL and backend." },
            { status: 502 },
        );
    }
}
