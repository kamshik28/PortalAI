// src/progress/progress.controller.ts
//
// REST endpoints for student learning progress in teacher-created courses.
// All routes are scoped to the authenticated student (JWT userId).
// Enrollment is verified inside ProgressService before any operation.

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/auth/auth.guard';
import { ProgressService } from './progress.service';

function getStudentId(req: AuthenticatedRequest): string {
  const id = req.userId;
  if (!id) throw new UnauthorizedException('Not authenticated');
  return id;
}

@Controller('student/courses')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  // ── POST :courseId/quiz/generate ───────────────────────────────────────────

  @Post(':courseId/quiz/generate')
  async generateQuiz(
    @Req() req: AuthenticatedRequest,
    @Param('courseId') courseId: string,
    @Body()
    body: {
      count?: number;
      questionType?: 'mcq' | 'open' | 'mixed';
      topic?: string;
    },
  ) {
    const studentId = getStudentId(req);

    const count = Math.min(Math.max(Number(body.count) || 5, 1), 20);
    const validTypes = ['mcq', 'open', 'mixed'] as const;
    const questionType: 'mcq' | 'open' | 'mixed' = validTypes.includes(
      body.questionType as 'mcq' | 'open' | 'mixed',
    )
      ? (body.questionType as 'mcq' | 'open' | 'mixed')
      : 'mixed';

    return this.progressService.generateQuiz(
      studentId,
      courseId,
      count,
      questionType,
      body.topic?.trim() || undefined,
    );
  }

  // ── POST :courseId/quiz/evaluate-open ──────────────────────────────────────

  @Post(':courseId/quiz/evaluate-open')
  async evaluateOpenAnswer(
    @Req() req: AuthenticatedRequest,
    @Param('courseId') courseId: string,
    @Body()
    body: {
      question?: string;
      studentAnswer?: string;
      modelAnswer?: string;
      explanation?: string;
    },
  ) {
    const studentId = getStudentId(req);

    return this.progressService.evaluateOpenAnswer(studentId, courseId, {
      question: body.question ?? '',
      studentAnswer: body.studentAnswer ?? '',
      modelAnswer: body.modelAnswer ?? '',
      explanation: body.explanation,
    });
  }

  // ── POST :courseId/quiz/submit ─────────────────────────────────────────────

  @Post(':courseId/quiz/submit')
  async submitAttempt(
    @Req() req: AuthenticatedRequest,
    @Param('courseId') courseId: string,
    @Body()
    body: {
      quizType?: string;
      topic?: string;
      questions?: unknown[];
      answers?: unknown[];
    },
  ) {
    const studentId = getStudentId(req);

    const validQuizTypes = ['mcq', 'open', 'mixed'] as const;
    const quizType: 'mcq' | 'open' | 'mixed' = validQuizTypes.includes(
      body.quizType as 'mcq' | 'open' | 'mixed',
    )
      ? (body.quizType as 'mcq' | 'open' | 'mixed')
      : 'mixed';

    return this.progressService.submitAttempt(studentId, courseId, {
      quizType,
      topic: body.topic?.trim() || undefined,
      questions: (body.questions ?? []) as Parameters<
        typeof this.progressService.submitAttempt
      >[2]['questions'],
      answers: (body.answers ?? []) as Parameters<
        typeof this.progressService.submitAttempt
      >[2]['answers'],
    });
  }

  // ── GET :courseId/progress ─────────────────────────────────────────────────

  @Get(':courseId/progress')
  async getProgress(
    @Req() req: AuthenticatedRequest,
    @Param('courseId') courseId: string,
  ) {
    const studentId = getStudentId(req);
    return this.progressService.getProgress(studentId, courseId);
  }

  // ── GET :courseId/quiz-history ─────────────────────────────────────────────

  @Get(':courseId/quiz-history')
  async getQuizHistory(
    @Req() req: AuthenticatedRequest,
    @Param('courseId') courseId: string,
  ) {
    const studentId = getStudentId(req);
    return this.progressService.getQuizHistory(studentId, courseId);
  }
}
