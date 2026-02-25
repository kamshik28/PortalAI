import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MaterialsService, UnitType } from './materials.service';

@Controller('teacher/courses/:courseId/materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
    }),
  )
  async upload(
    @Param('courseId') courseId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('unitType') unitTypeRaw: string,
    @Body('unitIndex') unitIndexRaw: string,
  ) {
    if (!courseId) throw new BadRequestException('Missing courseId');
    if (!file) throw new BadRequestException('Missing file');
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF allowed');
    }

    const unitType = String(unitTypeRaw) as UnitType;
    const unitIndex = Number(unitIndexRaw);

    if (unitType !== 'lecture' && unitType !== 'lab') {
      throw new BadRequestException('unitType must be lecture or lab');
    }
    if (!Number.isFinite(unitIndex) || unitIndex < 1 || unitIndex > 12) {
      throw new BadRequestException('unitIndex must be 1..12');
    }

    try {
      return await this.materialsService.uploadMaterial({
        courseId,
        unitType,
        unitIndex,
        file,
      });
    } catch (e: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.error('UPLOAD MATERIAL ERROR =>', e?.message);
      console.error(e);
      throw e;
    }

  }
}
