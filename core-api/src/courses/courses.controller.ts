// src/courses/courses.controller.ts

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { CoursesService } from './courses.service';
import type { AuthenticatedRequest } from '../common/auth/auth.guard';

interface CreateCourseDto {
  name: string;
  code?: string | null;
  description?: string | null;
}

interface AddStudentDto {
  studentEmail: string;
}

@Controller('teacher/courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  async getMyCourses(@Req() req: AuthenticatedRequest) {
    const courses = await this.coursesService.getCoursesForTeacher(req.userId);
    return { courses };
  }

  @Post()
  async createCourse(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateCourseDto,
  ) {
    if (!body.name?.trim()) {
      throw new BadRequestException('Name is required');
    }

    const course = await this.coursesService.createCourseForTeacher(req.userId, {
      name: body.name.trim(),
      code: body.code?.trim() || null,
      description: body.description?.trim() || null,
    });

    return { course };
  }

  @Get(':courseId/students')
  async getStudents(
    @Req() req: AuthenticatedRequest,
    @Param('courseId') courseId: string,
  ) {
    const students = await this.coursesService.getStudentsForCourse(
      req.userId,
      courseId,
    );
    return { students };
  }

  @Post(':courseId/students')
  async addStudent(
    @Req() req: AuthenticatedRequest,
    @Param('courseId') courseId: string,
    @Body() body: AddStudentDto,
  ) {
    if (!body.studentEmail?.trim()) {
      throw new BadRequestException('studentEmail is required');
    }

    const student = await this.coursesService.addStudentToCourse(
      req.userId,
      courseId,
      body.studentEmail.trim(),
    );

    return { student };
  }

  @Delete(':courseId/students/:studentId')
  async removeStudent(
    @Req() req: AuthenticatedRequest,
    @Param('courseId') courseId: string,
    @Param('studentId') studentId: string,
  ) {
    await this.coursesService.removeStudentFromCourse(
      req.userId,
      courseId,
      studentId,
    );
    return { success: true };
  }
}
