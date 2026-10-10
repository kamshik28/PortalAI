// auth.service.ts

import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import { randomUUID } from 'crypto';

// Argon2/bcrypt work-factor: ~300 ms on modern hardware — appropriate for 2025.
const BCRYPT_ROUNDS = 12;

// Login sessions are valid for 7 days.
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface RegisterInput {
  email: string;
  fullName?: string | null;
  username?: string | null;
  role?: 'student' | 'teacher';
  password: string;
}

interface LoginInput {
  email: string;
  password: string;
}

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  private mapRole(role?: string): Role {
    if (role?.toLowerCase() === 'teacher') return 'TEACHER';
    return 'STUDENT';
  }

  async register(data: RegisterInput) {
    const { email, fullName, role } = data;
    const password = typeof data.password === 'string' ? data.password : '';

    if (!email) {
      throw new BadRequestException('Email is required');
    }
    if (!password || password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    let username = (data.username ?? '').trim();
    if (!username) {
      username = email.split('@')[0];
    }

    const existingByEmail = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingByEmail) {
      throw new BadRequestException('User with this email already exists');
    }

    if (username) {
      const existingByUsername = await this.prisma.user.findUnique({
        where: { username },
      });
      if (existingByUsername) {
        throw new BadRequestException('Username is already taken');
      }
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const dbRole = this.mapRole(role);

    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        name: fullName ?? null,
        role: dbRole,
        passwordHash,
      },
    });

    return {
      message: 'User created',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  async login(data: LoginInput) {
    const { email } = data;
    const password = typeof data.password === 'string' ? data.password : '';

    if (!email) {
      throw new BadRequestException('Email is required');
    }
    if (!password) {
      throw new BadRequestException('Password is required');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });

    // Deliberate vague message — do not reveal whether the email exists.
    const INVALID = 'Invalid email or password';

    if (!user) {
      throw new BadRequestException(INVALID);
    }

    if (!user.passwordHash) {
      // Account was created before password auth was introduced.
      // Reject with the same generic message — do not hint at missing hash.
      throw new BadRequestException(INVALID);
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new BadRequestException(INVALID);
    }

    const token = `local_${user.id}_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.prisma.loginSession.create({
      data: { token, userId: user.id, expiresAt },
    });

    // Opportunistically clean up expired sessions for this user (fire-and-forget).
    this.prisma.loginSession
      .deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } })
      .catch(() => undefined);

    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }
}
