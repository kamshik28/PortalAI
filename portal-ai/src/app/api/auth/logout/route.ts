import { NextResponse } from "next/server";

export async function POST() {
    // базова відповідь
    const res = NextResponse.json({ message: "Logged out" }, { status: 200 });

    // прибираємо access_token (httpOnly)
    res.cookies.set("access_token", "", {
        path: "/",
        httpOnly: true,
        maxAge: 0,
        sameSite: "lax",
    });

    // прибираємо user_role (видима для фронта)
    res.cookies.set("user_role", "", {
        path: "/",
        httpOnly: false,
        maxAge: 0,
        sameSite: "lax",
    });

    return res;
}
