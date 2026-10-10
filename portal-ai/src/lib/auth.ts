//src/lib/auth.ts


import { cookies } from "next/headers";

export type AppUserRole = "student" | "teacher";

export function extractUserIdFromToken(token: string): string | null {
    if (!token.startsWith("local_")) return null;
    const rest = token.slice("local_".length);
    const idx = rest.indexOf("_");
    return idx === -1 ? rest : rest.slice(0, idx);
}

export function safeRole(value: string | undefined): AppUserRole | null {
    return value === "student" || value === "teacher" ? value : null;
}

export async function getSessionFromCookies() {
    const cookieStore = await cookies();

    const token = cookieStore.get("access_token")?.value ?? "";
    const roleCookie = cookieStore.get("user_role")?.value;
    const userIdCookie = cookieStore.get("user_id")?.value ?? "";

    const role = safeRole(roleCookie);
    const userIdFromToken = token ? extractUserIdFromToken(token) : null;

    return {
        token,
        isLoggedIn: Boolean(token),
        role,
        userId: userIdCookie || userIdFromToken || null,
    };
}