# PortalAI — Student Portal with an AI Assistant

> 🇸🇰 Slovenská verzia: [README.sk.md](README.sk.md)

A full-stack web portal for university students and teachers with a built-in **AI assistant based on RAG** (Retrieval-Augmented Generation). Students chat with an assistant that answers from their actual course materials, take AI-generated quizzes and track their progress; teachers manage courses, upload materials and generate tests.

Built as a **bachelor's thesis project** (*Student Portal with an AI Assistant*, FEI STU Bratislava). It is a working prototype intended for local development, not a production deployment.

📄 **Full thesis (PDF, Slovak, English abstract):** [docs/BP_Kaminskyi.pdf](docs/BP_Kaminskyi.pdf)

---

## Features

**Students**
- AI chat assistant answering questions from course materials (RAG over PDFs)
- AI-generated quizzes (multiple choice + open questions evaluated by an LLM)
- Progress tracking and quiz history per course / subject
- Integration with the university information system (AIS STU) — sync of subjects and documents

**Teachers**
- Course management, student enrollment
- PDF material upload → automatic chunking, embedding and indexing in a vector DB
- AI test generator from course materials
- Course-aware AI assistant for teachers

**General**
- Role-based access (STUDENT / TEACHER) with session auth
- Multi-agent conversational flow in Flowise (supervisors per role, specialised agents, guard agent)
- Dark / light mode, responsive layout, keyboard shortcuts

---

## Tech stack

| Layer | Technologies |
|-------|--------------|
| Frontend | **Next.js 15** (App Router), **React 19**, TypeScript, Tailwind CSS 4, shadcn/ui (Radix) |
| Backend | **NestJS 11**, TypeScript, Prisma ORM |
| Data | **PostgreSQL**, **Qdrant** (vector DB), Supabase Storage (PDFs) |
| AI | OpenAI `text-embedding-3-small` (embeddings), `gpt-4o-mini` (quizzes, grading), **Flowise** Agentflow (multi-agent assistant) |
| Other | pdf-parse, Cheerio + Playwright (AIS scraping), AES-256-GCM session encryption |

---

## Architecture

```
┌──────────────┐   proxy API routes   ┌──────────────┐     ┌────────────┐
│  portal-ai   │ ───────────────────▶ │   core-api   │ ──▶ │ PostgreSQL │
│  Next.js     │                      │   NestJS     │ ──▶ │ Qdrant     │
│  :3000       │                      │   :4000      │ ──▶ │ Supabase   │
└──────┬───────┘                      └──────────────┘ ──▶ │ OpenAI     │
       │                                                   └────────────┘
       │ chat (user role, userId, courseId)
       ▼
┌──────────────┐
│   Flowise    │  multi-agent Agentflow (exported in /flowise)
└──────────────┘
```

**RAG pipeline:** PDF upload → text extraction → chunking → OpenAI embeddings → Qdrant → semantic search filtered by course → context for the LLM.

---

## Repository structure

```
PortalAI/
├── core-api/    Backend – NestJS (REST API, auth, RAG, AIS integration, quizzes, progress)
├── portal-ai/   Frontend – Next.js (UI + server-side proxy API routes)
└── flowise/     Flowise Agentflow export (conversational multi-agent assistant)
```

---

## Getting started

### Prerequisites
- Node.js 20+
- PostgreSQL, Qdrant, a Supabase project (Storage bucket), OpenAI API key
- A running Flowise instance with the imported Agentflow

### Backend (`core-api`)
```bash
cd core-api
npm install
cp .env.example .env          # fill in your values
npx prisma migrate deploy
npx prisma generate
npm run start:dev             # http://localhost:4000
```

### Frontend (`portal-ai`)
```bash
cd portal-ai
npm install
cp .env.example .env          # fill in your values
npm run dev                   # http://localhost:3000
```

### Flowise
1. Start your Flowise instance.
2. Import `flowise/agentflow-export.json` (Flowise UI → *Import*).
3. Set `FLOWISE_INTERNAL_URL`, `FLOWISE_BASE`, `FLOWISE_CHATFLOW_ID` in `portal-ai/.env`.

See [flowise/README.md](flowise/README.md) for the description of the agents.

---

## Documentation

The full bachelor's thesis is available in [`docs/BP_Kaminskyi.pdf`](docs/BP_Kaminskyi.pdf) (Slovak, with an English abstract). It covers:
- analysis of the previous solution and proposed changes,
- system architecture and data model,
- RAG pipeline, AIS integration, quiz generation,
- testing (20 manual scenarios) and performance measurements.

The thesis builds on the earlier bachelor's thesis by M. Petkes (FEI STU, 2025); in this work the system was redesigned and rewritten into a unified TypeScript stack (Next.js + NestJS).

---

## Security notes
- Real `.env` files are **not** committed; only `.env.example` templates with placeholders.
- The AIS session cookie is stored **encrypted** (AES-256-GCM, key from `AIS_COOKIE_ENCRYPTION_KEY`).
- Database and OpenAI access live only in `core-api`; the frontend talks to them through the backend.

---

## Known limitations (prototype)
- AIS STU integration relies on a manually copied `UISAuth` cookie and HTML scraping (no official API).
- Only STUDENT and TEACHER roles; no separate admin role.
- No automated test suite covering the main scenarios — tested manually.
- No production deployment / infrastructure automation.

---

## Author
**Dmytrii Kaminskyi** — [GitHub @kamshik28](https://github.com/kamshik28)
