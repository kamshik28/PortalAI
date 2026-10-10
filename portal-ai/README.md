# portal-ai — PortalAI frontend

Next.js 15 (App Router) + React 19 + Tailwind CSS UI for [PortalAI](../README.md). Server-side API routes in `src/app/api` proxy requests to `core-api` and Flowise.

```bash
npm install
cp .env.example .env      # fill in values
npm run dev               # http://localhost:3000
```

Main areas: `src/app/student`, `src/app/teacher`, `src/app/auth`, shared UI in `src/components`.
