// src/app/api/auth/register/route.ts
import { NextResponse } from "next/server";

const CORE_API_URL = process.env.CORE_API_URL ?? "http://localhost:4000";

type RegisterRequestBody = {
    fullName?: string;
    email?: string;
    password?: string;
    role?: string;
};

type NestRegisterResponse =
    | {
    message?: string;
    [key: string]: unknown;
}
    | { raw: string };

export async function POST(req: Request) {
    let body: RegisterRequestBody;

    // читаємо JSON з запиту
    try {
        body = (await req.json()) as RegisterRequestBody;
    } catch (e) {
        console.error("Register API: cannot parse JSON body", e);
        return NextResponse.json(
            { message: "Invalid JSON payload" },
            { status: 400 },
        );
    }

    try {
        const roleRaw =
            typeof body.role === "string" ? body.role.toLowerCase() : "student";
        const role: "student" | "teacher" =
            roleRaw === "teacher" ? "teacher" : "student";

        const payload = {
            fullName: body.fullName,
            email: body.email,
            password: body.password,
            role,
        };

        console.log("Register API → Nest payload:", payload);
        console.log("CORE_API_URL:", CORE_API_URL);

        const nestRes = await fetch(`${CORE_API_URL}/auth/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const text = await nestRes.text();

        let data: NestRegisterResponse;
        try {
            data = JSON.parse(text) as NestRegisterResponse;
        } catch {
            data = { raw: text };
        }

        console.log(
            "Nest /auth/register status:",
            nestRes.status,
            "body:",
            data,
        );

        // просто прокидуємо, що повернув Nest
        return NextResponse.json(data ?? {}, { status: nestRes.status });
    } catch (e) {
        console.error("Register API error (cannot reach CORE_API_URL)", e);
        return NextResponse.json(
            {
                message:
                    "Cannot reach core API (Nest). Check CORE_API_URL and backend.",
            },
            { status: 502 },
        );
    }
}
