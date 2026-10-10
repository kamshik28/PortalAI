// src/app/api/student/ais/_utils.ts

import { NextRequest } from "next/server";

export const CORE_API_URL = process.env.CORE_API_URL ?? "http://localhost:4000";

export function getAccessToken(req: NextRequest): string | null {
    return req.cookies.get("access_token")?.value ?? null;
}