//courses.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async getCoursesForTeacher(teacherId: string) {
    const teacher = await this.prisma.user.findUnique({
      where: { id: teacherId },
    });

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }
    if (teacher.role !== 'TEACHER') {
      throw new ForbiddenException('User is not a teacher');
    }

    return this.prisma.course.findMany({
      where: { teacherId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCourseForTeacher(
    teacherId: string,
    data: { name: string; code?: string | null; description?: string | null },
  ) {
    const teacher = await this.prisma.user.findUnique({
      where: { id: teacherId },
    });

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }
    if (teacher.role !== 'TEACHER') {
      throw new ForbiddenException('User is not a teacher');
    }

    return this.prisma.course.create({
      data: {
        name: data.name,
        code: data.code ?? null,
        description: data.description ?? null,
        teacherId,
      },
    });
  }

  async getStudentsForCourse(teacherId: string, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        enrollments: {
          include: { student: true },
        },
      },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }
    if (course.teacherId !== teacherId) {
      throw new ForbiddenException('Not your course');
    }

    return course.enrollments.map((enr) => ({
      id: enr.student.id,
      email: enr.student.email,
      name: enr.student.name,
    }));
  }

  async addStudentToCourse(
    teacherId: string,
    courseId: string,
    studentEmail: string,
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }
    if (course.teacherId !== teacherId) {
      throw new ForbiddenException('Not your course');
    }

    const student = await this.prisma.user.findUnique({
      where: { email: studentEmail },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }
    if (student.role !== 'STUDENT') {
      throw new BadRequestException('User is not a student');
    }

    const existing = await this.prisma.courseEnrollment.findFirst({
      where: {
        courseId,
        studentId: student.id,
      },
    });

    if (!existing) {
      await this.prisma.courseEnrollment.create({
        data: {
          courseId,
          studentId: student.id,
        },
      });
    }

    return {
      id: student.id,
      email: student.email,
      name: student.name,
    };
  }

  async removeStudentFromCourse(
    teacherId: string,
    courseId: string,
    studentId: string,
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }
    if (course.teacherId !== teacherId) {
      throw new ForbiddenException('Not your course');
    }

    await this.prisma.courseEnrollment.deleteMany({
      where: {
        courseId,
        studentId,
      },
    });

    return { success: true };
  }

  async getCoursesForStudent(studentId: string) {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }
    if (student.role !== 'STUDENT') {
      throw new ForbiddenException('User is not a student');
    }

    const enrollments = await this.prisma.courseEnrollment.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      include: {
        course: {
          include: {
            teacher: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return enrollments.map((enrollment) => ({
      id: enrollment.course.id,
      name: enrollment.course.name,
      code: enrollment.course.code,
      description: enrollment.course.description,
      createdAt: enrollment.course.createdAt,
      teacher: enrollment.course.teacher
        ? {
            id: enrollment.course.teacher.id,
            email: enrollment.course.teacher.email,
            name: enrollment.course.teacher.name,
          }
        : null,
    }));
  }

  async getCourseDetailForStudent(studentId: string, courseId: string) {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }
    if (student.role !== 'STUDENT') {
      throw new ForbiddenException('User is not a student');
    }

    const enrollment = await this.prisma.courseEnrollment.findFirst({
      where: {
        studentId,
        courseId,
      },
      include: {
        course: {
          include: {
            teacher: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!enrollment) {
      throw new NotFoundException('Course not found for this student');
    }

    return {
      id: enrollment.course.id,
      name: enrollment.course.name,
      code: enrollment.course.code,
      description: enrollment.course.description,
      createdAt: enrollment.course.createdAt,
      teacher: enrollment.course.teacher
        ? {
            id: enrollment.course.teacher.id,
            email: enrollment.course.teacher.email,
            name: enrollment.course.teacher.name,
          }
        : null,
    };
  }
}