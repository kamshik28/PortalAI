# Portál pre študentov s AI pomocníkom (PortalAI)

Webová aplikácia portálu pre študentov s integrovaným AI pomocníkom postaveným
na technike **RAG** (Retrieval-Augmented Generation). Aplikácia poskytuje
prehľad informácií o štúdiu spolu s konverzačným asistentom a modularitou, ktorá
používateľom sprístupňuje len funkcionalitu zodpovedajúcu ich roli.

> **Charakter projektu.** Ide o **prototyp** vytvorený v rámci bakalárskej práce
> *Portál pre študentov s AI pomocníkom*. Riešenie je určené na lokálne
> vývojové a testovacie prostredie, nie na produkčné nasadenie. Niektoré časti
> (najmä integrácia s AIS STU) sú vedome zjednodušené — viď [Obmedzenia
> prototypu](#obmedzenia-prototypu).

---

## Štruktúra projektu

```
PortalAI/
├── core-api/      Backend – NestJS (REST API, RAG, AIS integrácia, kvízy)
├── portal-ai/     Frontend – Next.js (App Router, proxy API trasy, UI)
└── flowise/       Export externého Flowise Agentflow (konverzačný asistent)
```

| Priečinok    | Popis |
|--------------|-------|
| `core-api/`  | Serverová časť v **NestJS**. Obsahuje autentifikáciu, správu kurzov a materiálov, integráciu s AIS STU, RAG spracovanie dokumentov, generovanie kvízov a sledovanie pokroku. Pristupuje k PostgreSQL (cez Prisma), Qdrant, Supabase Storage a OpenAI. |
| `portal-ai/` | Klientská časť v **Next.js** (App Router). Obsahuje používateľské rozhranie a serverové **proxy API trasy**, ktoré preposielajú požiadavky na `core-api` a na Flowise. |
| `flowise/`   | Export konfigurácie **Flowise Agentflow**. Flowise beží ako **samostatná externá služba** a importuje sa zvlášť (viď [Flowise](#flowise-import)). |

---

## Použité technológie

- **Jazyk:** TypeScript
- **Frontend:** Next.js 15 (App Router), React 19
- **Backend:** NestJS 11
- **ORM / databáza:** Prisma + PostgreSQL
- **Vektorová databáza:** Qdrant
- **Úložisko súborov:** Supabase Storage (PDF materiály)
- **AI modely (OpenAI):**
  - `text-embedding-3-small` — embeddingy dokumentov pre RAG,
  - `gpt-4o-mini` — generovanie kvízov a hodnotenie otvorených odpovedí.
- **Konverzačný asistent:** Flowise Agentflow (externá služba)
- **Spracovanie PDF:** `pdf-parse`
- **Web scraping AIS:** Cheerio + Playwright (len vo vývojovom prostredí)
- **Šifrovanie AIS relácie:** AES-256-GCM (Node.js `crypto`)

---

## Externé služby

Na spustenie celého riešenia sú potrebné nasledujúce externé služby:

| Služba         | Účel                                            |
|----------------|-------------------------------------------------|
| **PostgreSQL** | Relačné dáta (používatelia, kurzy, kvízy, pokrok) |
| **Supabase**   | Storage bucket pre nahrané PDF materiály        |
| **Qdrant**     | Vektorová databáza pre embeddingy dokumentov    |
| **OpenAI**     | Embeddingy a jazykový model (kvízy, hodnotenie) |
| **Flowise**    | Konverzačný AI asistent (Agentflow)             |

---

## Požiadavky

- **Node.js 20+** a npm
- Bežiaca inštancia **PostgreSQL**
- Bežiaca inštancia **Qdrant**
- **Supabase** projekt so Storage bucketom
- **OpenAI** API kľúč
- Bežiaca inštancia **Flowise** s naimportovaným Agentflow

> Konfiguračné hodnoty sa zadávajú cez `.env` súbory. V repozitári sú priložené
> vzory `core-api/.env.example` a `portal-ai/.env.example` — viď
> [Bezpečnostná poznámka](#bezpečnostná-poznámka-k-env).

---

## Spustenie backendu (`core-api`)

```bash
cd core-api
npm install

# 1. Vytvor .env podľa vzoru a doplň reálne hodnoty
cp .env.example .env

# 2. Aplikuj databázové migrácie
npx prisma migrate deploy

# 3. Vygeneruj Prisma klienta
npx prisma generate

# 4. Spusti server (vývojový režim)
npm run start:dev
```

Backend počúva na **`http://localhost:4000`**.

## Spustenie frontendu (`portal-ai`)

```bash
cd portal-ai
npm install

# 1. Vytvor .env podľa vzoru a doplň reálne hodnoty
cp .env.example .env

# 2. Spusti vývojový server
npm run dev
```

Frontend beží na **`http://localhost:3000`** a komunikuje s backendom cez
premennú `CORE_API_URL`.

---

## Prisma migrácie

Databázová schéma a jej história sú v `core-api/prisma/`:

- `core-api/prisma/schema.prisma` — definícia dátového modelu,
- `core-api/prisma/migrations/` — verzované migrácie.

Aplikovanie migrácií na čistú databázu:

```bash
cd core-api
npx prisma migrate deploy
npx prisma generate
```

Na overenie schémy bez zásahu do databázy možno použiť `npx prisma validate`.

---

## Flowise import

Konverzačný asistent je realizovaný ako **Flowise Agentflow** a beží ako
**samostatná externá služba** (nie je súčasťou backendu ani frontendu).

1. Spusti vlastnú inštanciu Flowise.
2. Naimportuj `flowise/agentflow-export.json` (Flowise UI → *Import*).
3. Adresu inštancie a ID chatflow-u nastav vo `portal-ai/.env`
   (`FLOWISE_INTERNAL_URL`, `FLOWISE_BASE`, `FLOWISE_CHATFLOW_ID`).

Frontend posiela do Flowise kontext používateľa (rola, `userId`, `courseId`),
podľa ktorého Agentflow vetví správanie. Bližší popis agentov je v
[`flowise/README.md`](flowise/README.md).

---

## Bezpečnostná poznámka k `.env`

- **Reálne `.env` súbory nie sú a nesmú byť súčasťou tohto balíka.** Obsahovali
  by citlivé údaje (databázové pripojenie, API kľúče, Supabase service role key,
  Qdrant kľúč, šifrovací kľúč AIS relácie).
- V repozitári sú iba **vzory** `core-api/.env.example` a
  `portal-ai/.env.example` s **placeholder** hodnotami.
- Pred spustením skopíruj vzory na `.env` a doplň vlastné hodnoty.
- UISAuth cookie z AIS sa v databáze ukladá **šifrovane** (AES-256-GCM);
  šifrovací kľúč sa zadáva cez `AIS_COOKIE_ENCRYPTION_KEY`.

---

## Obmedzenia prototypu

Riešenie je prototyp a má vedomé obmedzenia, ktoré sú priznané aj v texte práce:

- **Integrácia s AIS STU** vyžaduje **manuálne skopírovanie cookie `UISAuth`**
  z prehliadača; nejde o oficiálne API.
- Synchronizácia dokumentov z AIS je **závislá od HTML štruktúry AIS** (scraping
  cez Cheerio/Playwright) a môže sa pokaziť pri jej zmene.
- Implementované sú len role **STUDENT** a **TEACHER**; samostatná
  administrátorská rola nie je súčasťou aplikácie.
- Projekt **neobsahuje automatizované testy** pokrývajúce hlavné scenáre;
  testovanie prebiehalo manuálne.
- Nie je riešené **produkčné nasadenie** ani infraštruktúrna automatizácia.
- **Flowise konfigurácia je externá** voči aplikácii; v repozitári je priložená
  ako export (`flowise/agentflow-export.json`) pre reprodukovateľnosť.
