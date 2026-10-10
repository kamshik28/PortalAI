//materials.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MaterialsService, UnitType } from './materials.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from '../common/auth/auth.guard';

@Controller('teacher/courses/:courseId/materials')
export class MaterialsController {
  constructor(
    private readonly materialsService: MaterialsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Verifies that the authenticated user is the teacher of the given course.
   * Throws ForbiddenException if not — the teacher cannot operate on courses
   * they do not own.
   */
  private async requireCourseOwnership(
    userId: string,
    courseId: string,
  ): Promise<void> {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, teacherId: userId },
      select: { id: true },
    });
    if (!course) {
      // Return NotFoundException so we don't leak whether the course exists.
      throw new NotFoundException('Course not found');
    }
  }

  @Get()
  async list(
    @Req() req: AuthenticatedRequest,
    @Param('courseId') courseId: string,
  ) {
    if (!courseId) throw new BadRequestException('Missing courseId');
    await this.requireCourseOwnership(req.userId, courseId);
    const materials = await this.materialsService.listMaterials(courseId);
    return { materials };
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  async upload(
    @Req() req: AuthenticatedRequest,
    @Param('courseId') courseId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('unitType') unitTypeRaw: string,
    @Body('unitIndex') unitIndexRaw: string,
    @Body('replaceExisting') replaceExistingRaw: string,
  ) {
    if (!courseId) throw new BadRequestException('Missing courseId');
    if (!file) throw new BadRequestException('Missing file');
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF allowed');
    }

    await this.requireCourseOwnership(req.userId, courseId);

    const unitType = String(unitTypeRaw) as UnitType;
    const unitIndex = Number(unitIndexRaw);
    const replaceExisting =
      String(replaceExistingRaw ?? '').toLowerCase() === 'true';

    if (unitType !== 'lecture' && unitType !== 'lab') {
      throw new BadRequestException('unitType must be lecture or lab');
    }

    if (!Number.isFinite(unitIndex) || unitIndex < 1 || unitIndex > 12) {
      throw new BadRequestException('unitIndex must be 1..12');
    }

    return this.materialsService.uploadMaterial({
      courseId,
      unitType,
      unitIndex,
      file,
      replaceExisting,
    });
  }

  @Delete(':materialId')
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('courseId') courseId: string,
    @Param('materialId') materialId: string,
  ) {
    if (!courseId) throw new BadRequestException('Missing courseId');
    if (!materialId) throw new BadRequestException('Missing materialId');

    await this.requireCourseOwnership(req.userId, courseId);
    await this.materialsService.deleteMaterial(courseId, materialId);
    return { success: true };
  }
}
