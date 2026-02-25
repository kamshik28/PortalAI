// auth.service.ts

import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import { randomUUID } from 'crypto';

interface RegisterInput {
  email: string;
  fullName?: string | null;
  username?: string | null;
  role?: 'student' | 'teacher';
  // password прилетит, але поки не використовуємо
  password?: string | null;
}

interface LoginInput {
  email: string;
  password?: string | null;
}

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  private mapRole(role?: string): Role {
    if (role?.toLowerCase() === 'teacher') return 'TEACHER';
    return 'STUDENT';
  }

  async register(data: RegisterInput) {
    console.log('REGISTER data:', data);

    const { email, fullName, role } = data;

    if (!email) {
      throw new BadRequestException('Email is required');
    }

    // 1) формуємо username
    let username = (data.username ?? '').trim();
    if (!username) {
      username = email.split('@')[0];
    }

    // 2) перевірка email
    const existingByEmail = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingByEmail) {
      throw new BadRequestException('User with this email already exists');
    }

    // 3) перевірка username
    if (username) {
      const existingByUsername = await this.prisma.user.findUnique({
        where: { username },
      });

      if (existingByUsername) {
        throw new BadRequestException('Username is already taken');
      }
    }

    // 4) мапимо роль
    const dbRole = this.mapRole(role);
    const fakeClerkId = `local_${randomUUID()}`;

    // 5) створюємо юзера
    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        name: fullName ?? null,
        role: dbRole,
        clerkId: fakeClerkId,
      },
    });

    console.log('USER CREATED:', user);

    return {
      message: 'User created',
      user,
    };
  }

  async login(data: LoginInput) {
    console.log('LOGIN data:', data);

    const { email } = data;

    if (!email) {
      throw new BadRequestException('Email is required');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // пізніше можна буде замінити на 401, коли додаси нормальний пароль
      throw new BadRequestException('Invalid email or password');
    }

    // TODO: перевірка пароля, коли заведеш passwordHash

    const fakeToken = `local_${user.id}_${randomUUID()}`;

    return {
      access_token: fakeToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role, // 'STUDENT' | 'TEACHER'
      },
    };
  }
}
