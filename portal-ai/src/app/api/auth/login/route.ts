// src/app/api/auth/login/route.ts
import { NextResponse } from "next/server";

const CORE_API_URL = process.env.CORE_API_URL ?? "http://localhost:4000";

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => null);

        if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
            return NextResponse.json(
                { message: "Invalid payload" },
                { status: 400 },
            );
        }

        const res = await fetch(`${CORE_API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: body.email, password: body.password }),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
            return NextResponse.json(
                { message: data?.message ?? "Login failed" },
                { status: res.status },
            );
        }

        const token: string | null = data?.access_token ?? data?.token ?? null;
        const backendRole: string | null = data?.user?.role ?? data?.role ?? null;
        const backendUserId: string | null = data?.user?.id ?? null;

        let role: "student" | "teacher" = "student";
        if (typeof backendRole === "string") {
            role = backendRole.toLowerCase() === "teacher" ? "teacher" : "student";
        }

        const response = NextResponse.json({ message: "Logged in" }, { status: 200 });

        if (token) {
            response.cookies.set("access_token", token, {
                path: "/",
                httpOnly: true,
                maxAge: 60 * 60 * 24 * 7,
                sameSite: "lax",
            });
        }

        response.cookies.set("user_role", role, {
            path: "/",
            httpOnly: false,
            maxAge: 60 * 60 * 24 * 7,
            sameSite: "lax",
        });

        if (backendUserId) {
            response.cookies.set("user_id", backendUserId, {
                path: "/",
                httpOnly: false,
                maxAge: 60 * 60 * 24 * 7,
                sameSite: "lax",
            });
        }

        return response;
    } catch (e) {
        console.error("Login API error:", e instanceof Error ? e.message : "unknown");
        return NextResponse.json({ message: "Internal error" }, { status: 500 });
    }
}
