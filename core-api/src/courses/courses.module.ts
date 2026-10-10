//courses.module.ts;
import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller';
import { StudentCoursesController } from './student-courses.controller';
import { CoursesService } from './courses.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [CoursesController, StudentCoursesController],
  providers: [CoursesService, PrismaService],
})
export class CoursesModule {}
