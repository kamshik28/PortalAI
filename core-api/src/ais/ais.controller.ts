import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/auth/auth.guard';
import { AisService } from './ais.service';
import { AisProgressService, SubmitAttemptPayload } from './ais-progress.service';

/**
 * All routes are protected by the global AuthGuard.
 * The guard validates the Bearer token against LoginSession and attaches
 * req.userId before any handler runs.  Do NOT call extractUserIdFromRequest
 * here — that function is deprecated and does not do DB validation.
 */
@Controller('student/ais')
export class AisController {
  constructor(
    private readonly aisService: AisService,
    private readonly aisProgressService: AisProgressService,
  ) {}

  @Post('helper-login')
  helperLogin(@Req() req: AuthenticatedRequest) {
    return this.aisService.helperLogin(req.userId);
  }

  @Post('connect')
  connect(
    @Req() req: AuthenticatedRequest,
    @Body() body: { uisAuthCookie?: string },
  ) {
    return this.aisService.connect(req.userId, body?.uisAuthCookie ?? '');
  }

  @Post('sync')
  sync(
    @Req() req: AuthenticatedRequest,
    @Body() body: { semesterId?: string; semesterLabel?: string },
  ) {
    return this.aisService.sync(req.userId, body?.semesterId, body?.semesterLabel);
  }

  @Get('semesters')
  getSemesters(@Req() req: AuthenticatedRequest) {
    return this.aisService.getSemesters(req.userId);
  }

  @Post('subjects/:subjectId/sync')
  syncSubject(
    @Req() req: AuthenticatedRequest,
    @Param('subjectId') subjectId: string,
  ) {
    return this.aisService.syncSubject(req.userId, subjectId);
  }

  @Get('active-subject')
  getActiveSubject(@Req() req: AuthenticatedRequest) {
    return this.aisService.getActiveSubject(req.userId);
  }

  @Get('status')
  status(@Req() req: AuthenticatedRequest) {
    return this.aisService.getStatus(req.userId);
  }

  @Get('subjects')
  getSubjects(
    @Req() req: AuthenticatedRequest,
    @Query('semesterId') semesterId?: string,
  ) {
    return this.aisService.getSubjects(req.userId, semesterId);
  }

  @Get('subjects/:subjectId/documents')
  getDocuments(
    @Req() req: AuthenticatedRequest,
    @Param('subjectId') subjectId: string,
  ) {
    return this.aisService.getDocuments(req.userId, subjectId);
  }

  @Post('search')
  search(
    @Req() req: AuthenticatedRequest,
    @Body() body: { courseId?: string; query?: string; topK?: number },
  ) {
    return this.aisService.searchChunks(
      req.userId,
      body?.courseId ?? '',
      body?.query ?? '',
      Number(body?.topK ?? 5),
    );
  }

  @Post('quiz/generate')
  generateQuiz(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      count?: number;
      questionType?: string;
      topic?: string;
    },
  ) {
    const count = Math.min(Math.max(Number(body?.count ?? 5), 1), 10);
    const rawType = typeof body?.questionType === 'string' ? body.questionType : 'mixed';
    const questionType: 'mcq' | 'open' | 'mixed' = ['mcq', 'open', 'mixed'].includes(rawType)
      ? (rawType as 'mcq' | 'open' | 'mixed')
      : 'mixed';
    const topic =
      typeof body?.topic === 'string' && body.topic.trim()
        ? body.topic.trim().slice(0, 200)
        : undefined;

    return this.aisService.generateQuiz(req.userId, count, questionType, topic);
  }

  @Post('quiz/evaluate-open')
  evaluateOpenAnswer(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      question?: string;
      studentAnswer?: string;
      modelAnswer?: string;
      explanation?: string;
      quizId?: string;
    },
  ) {
    return this.aisService.evaluateOpenAnswer(req.userId, {
      question: body?.question ?? '',
      studentAnswer: body?.studentAnswer ?? '',
      modelAnswer: body?.modelAnswer ?? '',
      explanation: body?.explanation,
      quizId: body?.quizId,
    });
  }

  // ── AIS progress endpoints ─────────────────────────────────────────────────

  @Post('quiz/submit')
  submitQuizAttempt(
    @Req() req: AuthenticatedRequest,
    @Body() body: Partial<SubmitAttemptPayload>,
  ) {
    const validQuizTypes = ['mcq', 'open', 'mixed'] as const;
    const quizType: 'mcq' | 'open' | 'mixed' = validQuizTypes.includes(
      body.quizType as 'mcq' | 'open' | 'mixed',
    )
      ? (body.quizType as 'mcq' | 'open' | 'mixed')
      : 'mixed';

    return this.aisProgressService.submitAttempt(req.userId, {
      quizType,
      topic: typeof body.topic === 'string' ? body.topic.trim() || undefined : undefined,
      questions: Array.isArray(body.questions) ? body.questions : [],
      answers: Array.isArray(body.answers) ? body.answers : [],
    });
  }

  @Get('progress')
  getProgress(@Req() req: AuthenticatedRequest) {
    return this.aisProgressService.getProgress(req.userId);
  }

  @Get('quiz-history')
  getQuizHistory(@Req() req: AuthenticatedRequest) {
    return this.aisProgressService.getQuizHistory(req.userId);
  }
}
