// auth.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SkipAuth } from '../common/auth/skip-auth.decorator';

interface RegisterBody {
  email?: string;
  fullName?: string;
  username?: string;
  password?: string;
  role?: string;
}

interface LoginBody {
  email?: string;
  password?: string;
}

// All auth endpoints are public — the AuthGuard does not apply here.
@SkipAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: RegisterBody) {
    return this.authService.register({
      email: body.email ?? '',
      fullName: body.fullName,
      username: body.username,
      password: body.password ?? '',
      role: body.role as 'student' | 'teacher' | undefined,
    });
  }

  @Post('login')
  async login(@Body() body: LoginBody) {
    return this.authService.login({
      email: body.email ?? '',
      password: body.password ?? '',
    });
  }
}
