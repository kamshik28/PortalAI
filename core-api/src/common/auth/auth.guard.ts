/**
 * Global authentication guard.
 *
 * Every request must carry a valid Bearer token issued by /auth/login and
 * recorded in the LoginSession table.  The guard verifies the token exists,
 * is not expired, and then attaches the real userId to req.userId so that
 * controllers never have to parse tokens themselves.
 *
 * Routes that must be public (e.g. /auth/login, /auth/register) are excluded
 * by applying the @SkipAuth() decorator to the controller class or handler.
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request as ExpressRequest } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { SKIP_AUTH_KEY } from './skip-auth.decorator';

export interface AuthenticatedRequest extends ExpressRequest {
  userId: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Allow routes decorated with @SkipAuth()
    const isPublic = this.reflector.getAllAndOverride<boolean>(SKIP_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context
      .switchToHttp()
      .getRequest<ExpressRequest & { userId?: string }>();

    const token = this.extractRawToken(req);

    if (!token) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    // Validate the token against the LoginSession table.
    // This prevents any forged / manually-crafted token from working.
    const session = await this.prisma.loginSession.findUnique({
      where: { token },
      select: { userId: true, expiresAt: true, id: true },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid or expired token. Please log in again.');
    }

    if (session.expiresAt < new Date()) {
      // Clean up the expired row opportunistically (fire-and-forget).
      this.prisma.loginSession
        .delete({ where: { id: session.id } })
        .catch(() => undefined);
      throw new UnauthorizedException('Session expired. Please log in again.');
    }

    // Attach the DB-verified userId to the request so controllers can use it
    // without having to parse or trust the token string.
    req.userId = session.userId;
    return true;
  }

  private extractRawToken(req: ExpressRequest): string | null {
    const auth = req.headers?.authorization;
    if (!auth || typeof auth !== 'string') return null;
    const parts = auth.split(' ');
    // Accept "Bearer <token>" or bare "<token>"
    return parts.length === 2 ? parts[1] : parts[0];
  }
}
