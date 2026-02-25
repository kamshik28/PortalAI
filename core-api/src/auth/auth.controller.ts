// auth.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: any) {
    console.log('REGISTER body (controller):', body);
    return this.authService.register(body);
  }

  @Post('login')
  async login(@Body() body: any) {
    console.log('LOGIN body (controller):', body);
    return this.authService.login(body);
  }
}
