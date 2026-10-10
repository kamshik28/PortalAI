//src/courses/student-courses.controller.ts
import {
  Controller,
  Get,
  Param,
  Req,
} from '@nestjs/common';
import { CoursesService } from './courses.service';
import type { AuthenticatedRequest } from '../common/auth/auth.guard';

@Controller('student/courses')
export class StudentCoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  async getMyCourses(@Req() req: AuthenticatedRequest) {
    const courses = await this.coursesService.getCoursesForStudent(req.userId);
    return { courses };
  }

  @Get(':courseId')
  async getCourseDetail(
    @Req() req: AuthenticatedRequest,
    @Param('courseId') courseId: string,
  ) {
    const course = await this.coursesService.getCourseDetailForStudent(
      req.userId,
      courseId,
    );
    return { course };
  }
}
