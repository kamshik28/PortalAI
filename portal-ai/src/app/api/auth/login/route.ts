// src/app/api/auth/login/route.ts
import { NextResponse } from "next/server";

const CORE_API_URL = process.env.CORE_API_URL ?? "http://localhost:4000";

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => null);
        console.log("LOGIN body:", body);

        if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
            return NextResponse.json(
                { message: "Invalid payload" },
                { status: 400 },
            );
        }

        // 👉 реальний запит на Nest /auth/login
        const res = await fetch(`${CORE_API_URL}/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                email: body.email,
                password: body.password,
            }),
        });

        const data = await res.json().catch(() => null);
        console.log("LOGIN Nest response:", data);

        if (!res.ok) {
            return NextResponse.json(
                { message: (data as any)?.message ?? "Login failed" },
                { status: res.status },
            );
        }

        // 🧩 пробуємо дістати токен та роль з відповіді бекенда
        const token =
            (data as any)?.access_token ??
            (data as any)?.token ??
            null;

        const backendRole =
            (data as any)?.user?.role ??
            (data as any)?.role ??
            null;

        let role: "student" | "teacher" = "student";
        if (typeof backendRole === "string") {
            const lower = backendRole.toLowerCase();
            role = lower === "teacher" ? "teacher" : "student";
        }

        const response = NextResponse.json(
            { message: "Logged in" },
            { status: 200 },
        );

        // 🔒 токен – httpOnly, щоб не світити в JS
        if (token) {
            response.cookies.set("access_token", token, {
                path: "/",
                httpOnly: true,
                maxAge: 60 * 60 * 24 * 7,
                sameSite: "lax",
            });
        }

        // 👤 роль – НЕ httpOnly, щоб ти могла читати її з браузера / Flowise
        response.cookies.set("user_role", role, {
            path: "/",
            httpOnly: false,
            maxAge: 60 * 60 * 24 * 7,
            sameSite: "lax",
        });

        return response;
    } catch (e) {
        console.error("Login API error", e);
        return NextResponse.json(
            { message: "Internal error" },
            { status: 500 },
        );
    }
}
