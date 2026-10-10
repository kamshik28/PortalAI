//src/app/api/auth/logout/route.ts
import { NextResponse } from "next/server";

export async function POST() {
    const res = NextResponse.json({ message: "Logged out" }, { status: 200 });

    res.cookies.set("access_token", "", {
        path: "/",
        httpOnly: true,
        maxAge: 0,
        sameSite: "lax",
    });

    res.cookies.set("user_role", "", {
        path: "/",
        httpOnly: false,
        maxAge: 0,
        sameSite: "lax",
    });

    res.cookies.set("user_id", "", {
        path: "/",
        httpOnly: false,
        maxAge: 0,
        sameSite: "lax",
    });

    return res;
}