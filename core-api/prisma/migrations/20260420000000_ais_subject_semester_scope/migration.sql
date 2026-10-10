-- Migration: add semesterFolderId + semesterLabel to AisSubject
-- This enables per-semester subject scoping so subjects discovered for
-- "ZS 2025/2026" don't appear in the "LS 2025/2026" view.

ALTER TABLE "AisSubject" ADD COLUMN "semesterFolderId" TEXT;
ALTER TABLE "AisSubject" ADD COLUMN "semesterLabel" TEXT;

-- Index for efficient semester-scoped subject queries
CREATE INDEX "AisSubject_userId_semesterFolderId_idx"
  ON "AisSubject"("userId", "semesterFolderId");
