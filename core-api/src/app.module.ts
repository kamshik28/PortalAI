//app.module.ts

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { CoursesModule } from './courses/courses.module';
import { MaterialsModule } from './materials/materials.module';
import { AisModule } from './ais/ais.module';
import { ProgressModule } from './progress/progress.module';
import { AuthGuard } from './common/auth/auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    CoursesModule,
    MaterialsModule,
    AisModule,
    ProgressModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Enforce token authentication on every route globally.
    // Individual routes can opt out with the @SkipAuth() decorator.
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}