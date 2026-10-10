# core-api — PortalAI backend

NestJS 11 REST API for [PortalAI](../README.md): authentication, courses & materials, RAG pipeline (PDF → embeddings → Qdrant), AIS STU integration, AI quizzes and progress tracking. Data layer: Prisma + PostgreSQL.

```bash
npm install
cp .env.example .env      # fill in values
npx prisma migrate deploy
npx prisma generate
npm run start:dev         # http://localhost:4000
```

Modules: `auth`, `courses`, `materials`, `ais`, `progress`, `prisma` (see `src/`).
