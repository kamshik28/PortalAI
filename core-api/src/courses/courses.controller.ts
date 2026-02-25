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
import type { Request as ExpressRequest } from 'express';

// DTO для тіла запиту створення курсу
interface CreateCourseDto {
  name: string;
  code?: string | null;
  description?: string | null;
}

// DTO для додавання студента
interface AddStudentDto {
  studentEmail: string;
}

@Controller('teacher/courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  private extractUserId(req: ExpressRequest): string {
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

  @Get()
  async getMyCourses(@Req() req: ExpressRequest) {
    const teacherId = this.extractUserId(req);
    const courses = await this.coursesService.getCoursesForTeacher(teacherId);
    return { courses };
  }

  @Post()
  async createCourse(
    @Req() req: ExpressRequest,
    @Body() body: CreateCourseDto,
  ) {
    const teacherId = this.extractUserId(req);

    if (!body.name) {
      throw new BadRequestException('Name is required');
    }

    const course = await this.coursesService.createCourseForTeacher(
      teacherId,
      {
        name: body.name,
        code: body.code ?? null,
        description: body.description ?? null,
      },
    );

    return { course };
  }

  @Get(':courseId/students')
  async getStudents(
    @Req() req: ExpressRequest,
    @Param('courseId') courseId: string,
  ) {
    const teacherId = this.extractUserId(req);
    const students = await this.coursesService.getStudentsForCourse(
      teacherId,
      courseId,
    );
    return { students };
  }

  @Post(':courseId/students')
  async addStudent(
    @Req() req: ExpressRequest,
    @Param('courseId') courseId: string,
    @Body() body: AddStudentDto,
  ) {
    const teacherId = this.extractUserId(req);

    if (!body.studentEmail) {
      throw new BadRequestException('studentEmail is required');
    }

    const student = await this.coursesService.addStudentToCourse(
      teacherId,
      courseId,
      body.studentEmail,
    );

    return { student };
  }

  @Delete(':courseId/students/:studentId')
  async removeStudent(
    @Req() req: ExpressRequest,
    @Param('courseId') courseId: string,
    @Param('studentId') studentId: string,
  ) {
    const teacherId = this.extractUserId(req);
    await this.coursesService.removeStudentFromCourse(
      teacherId,
      courseId,
      studentId,
    );
    return { success: true };
  }
}
