import { SetMetadata } from '@nestjs/common';

/**
 * Routes decorated with @SkipAuth() are excluded from the global AuthGuard.
 * Use this on public endpoints such as /auth/login and /auth/register.
 */
export const SKIP_AUTH_KEY = 'skipAuth';
export const SkipAuth = () => SetMetadata(SKIP_AUTH_KEY, true);
