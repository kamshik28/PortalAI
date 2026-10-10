//src/common/auth/extract-user-id.ts
//
// DEPRECATED — do not use in new code.
//
// This function parses userId directly from the token string without any
// database validation and is therefore INSECURE.  It exists only for
// backward-compatibility during the transition period.
//
// All controllers must use the global AuthGuard and read req.userId instead.
// See common/auth/auth.guard.ts.
//
// This file will be removed once no callers remain.

import { BadRequestException } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';

/** @deprecated Use req.userId set by AuthGuard instead. */
export function extractUserIdFromRequest(req: ExpressRequest): string {
  const authHeader = req.headers['authorization'];

  if (typeof authHeader === 'undefined') {
    throw new BadRequestException('Missing Authorization header');
  }

  const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader;

  if (typeof raw !== 'string' || raw.length === 0) {
    throw new BadRequestException('Invalid Authorization header');
  }

  const parts = raw.split(' ');
  const token = parts.length === 2 ? parts[1] : parts[0];

  if (!token || !token.startsWith('local_')) {
    throw new BadRequestException('Invalid token');
  }

  const withoutPrefix = token.slice('local_'.length);
  const idx = withoutPrefix.indexOf('_');
  const userId = idx === -1 ? withoutPrefix : withoutPrefix.slice(0, idx);

  if (!userId) {
    throw new BadRequestException('Cannot extract user id');
  }

  return userId;
}
