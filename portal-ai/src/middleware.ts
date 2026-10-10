import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Auth is handled via custom httpOnly cookies (access_token / user_role / user_id).
// No Clerk integration is active — middleware is a passthrough.
export function middleware(_req: NextRequest) {
    return NextResponse.next();
}

export const config = {
    matcher: [],
};