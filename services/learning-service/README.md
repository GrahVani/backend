# Grahvani Learning Service — Backend Runbook

> The Express + Prisma + Postgres service that owns: lesson + chapter + module + tier content (mirrored from markdown), per-user mastery, MCQ grading, spaced repetition, streaks, points, badges, and the dashboard composite endpoint.

**Service name:** `learning-service`
**Port:** `3013`
**Tech stack:** Node 22 · TypeScript · Express 4 · Prisma 5 · Postgres 16 · Redis 7
**Doc owner:** Goutham Kadumuru.
**Version:** 1.0 — 2026-05-22 (LOCKED).
**Read time:** ~45 minutes.

---

## 0. TL;DR

```bash
# Start prerequisites
cd ../../   # → backend/
docker compose up -d postgres redis

# Apply schema
cd services/learning-service
npx prisma generate && npx prisma db push

# Seed (idempotent)
JWT_SECRET="cd240d9031f96046b4f42411d59ea3edc90a35a769ae4096042449b5508ad8ce" \
  NODE_ENV=development npm run db:seed

# Boot
JWT_SECRET="..." NODE_ENV=development npm run dev

# Verify
curl -sS http://localhost:3013/health   # → {"status":"ok",...}
```

After this, hit endpoints with a JWT signed by the canonical secret. Frontend can be configured with `NEXT_PUBLIC_LEARNING_SERVICE_URL=http://localhost:3013/api/v1`.

---

## 1. What this service is responsible for

| Domain | Yes / No |
|---|---|
| Storing lesson markdown content (DB mirror of `curriculum/`) | ✅ |
| Grading MCQ submissions (server-side authority) | ✅ |
| Enforcing 24-hour cooldown on failed attempts | ✅ |
| Computing chapter/module/tier progress aggregates | ✅ |
| Awarding points, tracking streaks, unlocking badges | ✅ |
| Spaced-repetition card scheduling | ✅ |
| Serving the dashboard composite payload | ✅ |
| User authentication / JWT issuance | ❌ (that's `auth-service`) |
| User profile (name, email) | ❌ (that's `user-service`) |
| Astrological computations (charts, panchanga) | ❌ (that's `astro-engine`) |
| Long-form knowledge lookups | ❌ (that's `knowledge-service`) |

---

## 2. The 21 Prisma tables

Schema lives at `prisma/schema.prisma`. Full grouped list:

### 2.1 Curriculum hierarchy (mirrored from markdown)

| Table | Purpose | Key fields |
|---|---|---|
| `Tier` | 3 tiers (Foundation, Practice, Mastery) | `number @unique`, `title`, `status` |
| `Module` | 24 modules per tier | `tierId`, `number`, `slug @unique`, `title`, `learningObjectives[]` |
| `Chapter` | 3-6 chapters per module | `moduleId`, `number`, `slug`, `title`, `learningObjectives[]` |
| `Lesson` | 3-7 lessons per chapter | `chapterId`, `slug @unique`, `tier`, `module`, `chapter`, `sequence`, `title`, `targetMinutesTotal`, `bloomLevels[]`, `streams[]`, `prerequisites[]`, `postrequisites[]`, `learningOutcomes[]`, `primarySources` (JSON), `modernSources` (JSON), `interactiveEnabled` |
| `LessonSection` | 12 sections per lesson typically | `lessonId`, `number` (1-12), `title`, `body`, `bloomFocus` |

### 2.2 Assessment

| Table | Purpose | Key fields |
|---|---|---|
| `McqBank` | One per lesson | `lessonId`, `version`, `streamNeutral` |
| `McqQuestion` | 5-8 per bank | `bankId`, `questionId @unique`, `stem`, `questionType`, `bloomLevel`, `difficulty`, `options` (JSON), `explanation`, `citation` |
| `QuizAttempt` | One per submission attempt | `userId`, `lessonId`, `score`, `correctAnswers`, `answersJson`, `startedAt`, `completedAt`, `pointsEarned` |

### 2.3 Per-user progress

| Table | Purpose | Key fields |
|---|---|---|
| `UserLearningProfile` | One per user | `userId @unique`, `totalPoints`, `currentTier`, `currentStreak`, `longestStreak`, `lastActivityDate` |
| `LessonProgress` | One per (user, lesson) | `userId`, `lessonId`, `status` (NOT_STARTED \| IN_PROGRESS \| COMPLETED \| MASTERED), `score`, `completionPercentage`, `sectionsViewedJson` (number[]), `interactiveInteracted` |
| `ChapterProgress` | One per (user, chapter) — derived | `userId`, `chapterId`, `status`, `lessonsCompleted`, `lessonsTotal` |
| `ModuleProgress` | One per (user, module) — derived | `userId`, `moduleId`, `status`, `chaptersCompleted`, `chaptersTotal` |

### 2.4 Gamification

| Table | Purpose | Key fields |
|---|---|---|
| `BadgeDefinition` | 5 seeded; more added over time | `slug @unique`, `name`, `description`, `iconUrl`, `rarity`, `unlockCondition` (JSON) |
| `UserBadge` | One per (user, badge) when unlocked | `userId`, `badgeId`, `earnedAt` |
| `PointsTransaction` | Every points-earning event | `userId`, `points`, `reason`, `referenceType`, `referenceId`, `createdAt` |
| `DailyActivity` | One per (user, day) | `userId`, `date`, `pointsEarned`, `hadLogin`, `hadLessonActivity`, `hadPanchangaCheck` |
| `LeaderboardSnapshot` | Periodic recompute (cron, future) | `userId`, `snapshotDate`, `totalPoints`, `rank` |

### 2.5 Spaced repetition

| Table | Purpose | Key fields |
|---|---|---|
| `SpacedRepetitionCard` | One per (user, lesson) per concept | `userId`, `lessonId`, `front`, `back`, `intervalDays`, `dueAt`, `easeFactor` |
| `UserSRSession` | Daily review session aggregate | `userId`, `date`, `cardsReviewed`, `cardsCorrect` |

### 2.6 Interactive analytics

| Table | Purpose | Key fields |
|---|---|---|
| `InteractiveComponent` | Registry of components | `slug @unique`, `componentType`, `version` |
| `InteractiveEvent` | Per-event log | `userId`, `componentSlug`, `eventType`, `payloadJson`, `createdAt` |

### 2.7 Misc

| Table | Purpose |
|---|---|
| `BibliographyEntry` | Cross-lesson source registry (planned v1.1 use) |

### Status enums

```
TierStatus:        ACTIVE | ARCHIVED | DRAFT
ModuleStatus:      DRAFT | TECHNICAL_AUDIT | PEDAGOGICAL_AUDIT | PUBLISHED | REVISION_NEEDED
ChapterStatus:     DRAFT | PUBLISHED
LessonType:        CONCEPTUAL | PROCEDURAL | PRACTICAL
LessonProgress.status: NOT_STARTED | IN_PROGRESS | COMPLETED | MASTERED
```

---

## 3. Service architecture (TS files)

```
src/
├── main.ts                       Express bootstrap, routes, port listen
├── config/
│   ├── index.ts                  Env validation (zod) — JWT_SECRET, PORT, DB_URL
│   ├── prisma.ts                 PrismaClient export
│   ├── logger.ts                 Pino + pino-pretty
│   └── game-constants.ts         Tier thresholds, titles, module unlock rules
├── interfaces/http/
│   ├── middlewares/
│   │   ├── auth.middleware.ts    JWT verification → req.user
│   │   └── admin-auth.middleware.ts
│   └── routes/
│       ├── learn.routes.ts       Most endpoints (24+ routes)
│       └── admin.routes.ts       Admin-only mutations
├── routes/
│   └── gamification.routes.ts    /gamification/* — streak, badges, profile, leaderboard
├── services/
│   ├── progress.service.ts       Aggregate computation
│   ├── gamification.service.ts   Point award, streak, badge unlock
│   ├── quiz.service.ts           Server-side grading, mastery gate, cooldown
│   ├── spaced-repetition.service.ts
│   ├── milestone.service.ts      Chapter/Module completion bonuses
│   ├── prerequisite.service.ts   Lock/unlock checks
│   ├── interactive.service.ts    Interactive analytics
│   └── bibliography.service.ts
├── linter/
│   └── section-linter.ts         Lints lesson markdown sections
├── validators/
│   ├── lesson.validator.ts       Zod for frontmatter
│   └── mcq.validator.ts          Zod for MCQ JSON
└── types/                        Shared types
```

---

## 4. The complete endpoint list

Base URL pattern: `/api/v1/learn` for learner-facing, `/api/v1/learn/admin` for admin, `/api/v1/learn/gamification` for gamification.

### 4.1 Curriculum tree (mostly admin / system)

| Method | Path | Purpose |
|---|---|---|
| GET | `/tiers` | List all tiers |
| GET | `/tiers/:id/modules` | Modules in a tier |
| GET | `/modules/:id` | Module detail with chapters |
| GET | `/chapters/:id` | Chapter detail with lessons |
| GET | `/courses` | Top-level course list (seeder-driven) |
| GET | `/courses/:id` | Course detail |
| GET | `/curriculum-tree` | Full curriculum tree in one payload |

### 4.2 Lesson runtime (frontend-facing)

| Method | Path | Purpose |
|---|---|---|
| GET | `/lessons/by-slug/:slug` | Lesson by slug |
| GET | `/lessons/:slugOrId` | Full lesson detail |
| GET | `/lessons/:slugOrId/quiz` | MCQ bank for client display |
| GET | `/lessons/:slugOrId/progress?userId=…` | Per-user progress for one lesson |
| POST | `/lessons/:slugOrId/section-view` | Track section view; body `{ userId, sectionId: number }` |
| POST | `/lessons/:slugOrId/submit` | **Server-grader**; body `{ userId, answers: [{ questionId, answer, timeSpentSeconds }] }` |
| GET | `/lessons/:slug/prerequisites` | Locks/unlocks for prerequisites |
| POST | `/lessons/:slug/access-check` | Can this user access this lesson? |
| GET | `/modules/:id/unlock-status` | Unlock map for a module's chapters |

### 4.3 Chapter MCQ (planned tier exams)

| Method | Path | Purpose |
|---|---|---|
| GET | `/chapters/:id/quiz` | Chapter-level MCQ bank |
| POST | `/chapters/:id/submit` | Submit chapter exam |

### 4.4 Dashboard

| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard?userId=…` | **Composite payload** — tier, streak, points, progress[], badges, full picture |

### 4.5 Spaced repetition

| Method | Path | Purpose |
|---|---|---|
| GET | `/sr/today?userId=…` | Cards due today |
| POST | `/sr/:cardId/review` | Submit review quality (SM-2 algorithm) |
| POST | `/lessons/:slugOrId/generate-sr-cards` | Generate cards after mastery |

### 4.6 Interactive analytics

| Method | Path | Purpose |
|---|---|---|
| POST | `/interactive-events` | Log a learner's interaction event |
| GET | `/interactive-components/:slug/analytics` | Component-level usage analytics |
| GET | `/users/:userId/interactive-stats` | User-level interactive stats |

### 4.7 Gamification

| Method | Path | Purpose |
|---|---|---|
| POST | `/gamification/lessons/:lessonId/submit` | Alternative submit path (deprecated; use `/learn/lessons/:slug/submit`) |
| GET | `/gamification/profile/:userId` | Skill score, tier, points, title |
| GET | `/gamification/leaderboard` | Top users by points |
| GET | `/gamification/badges/:userId` | `{ earned[], upcoming[] }` |
| GET | `/gamification/streak/:userId` | Streak detail |
| POST | `/gamification/daily/login/:userId` | Daily login award + streak bump |
| GET | `/gamification/points/history/:userId` | Points transaction history |
| GET | `/gamification/modules/:userId` | Per-module gamification stats |

### 4.8 Admin

| Method | Path | Purpose |
|---|---|---|
| Various | `/admin/*` | Mutations gated by `admin-auth.middleware.ts` (requires `role: admin` in JWT) |

---

## 5. Authentication

The service expects JWTs signed with the **canonical** secret in `backend/.env`:

```
JWT_SECRET=cd240d9031f96046b4f42411d59ea3edc90a35a769ae4096042449b5508ad8ce
```

JWT payload shape:

```json
{
  "userId": "user-cuid",
  "sub":    "user-cuid",
  "email":  "learner@example.com",
  "role":   "learner",
  "iat": 1700000000,
  "exp": 1700086400
}
```

`auth.middleware.ts` verifies the token and decorates `req.user`. Admin routes additionally require `role: admin`.

**Forging dev JWTs:**

```js
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { userId: 'dev-user-1', sub: 'dev-user-1', email: 'dev@local', role: 'learner' },
  'cd240d9031f96046b4f42411d59ea3edc90a35a769ae4096042449b5508ad8ce',
  { expiresIn: '30d' }
);
console.log(token);
```

---

## 6. Mastery rules — what passes a lesson

A lesson moves to `status: MASTERED` if and only if ALL of:

1. **MCQ score ≥80%** (the `PASS_THRESHOLD` in the frontend store + server `quiz.service.ts`)
2. **All sections viewed** (`sectionsViewedJson` contains every §-number that the lesson markdown defines)
3. **Interactive interacted** (if the lesson has an interactive, the learner must have triggered at least one event via `/interactive-events`)

If MCQ passes but other gates fail, status becomes `COMPLETED` (intermediate state). If MCQ fails, status stays `IN_PROGRESS` and a 24-hour cooldown starts.

The full check is `checkLessonMasteryRequirements(userId, lessonId)` in `progress.service.ts`.

---

## 7. Cooldown

After a failed MCQ submission, the user enters a 24-hour cooldown. During this window:

- `POST /lessons/:slug/submit` returns HTTP 429 with `{ data: { nextAttemptAt, hoursRemaining } }`
- The frontend MCQFlow phase transitions to "cooldown" and shows the countdown

This is intentional pedagogical friction — re-attempting failed MCQs immediately defeats the spaced-mastery design. Cooldown duration is `24` hours, defined in both `quiz.service.ts` and `frontend/src/lib/learning-runtime/progress-store.ts` (must match).

---

## 8. Mutations + their idempotency

| Endpoint | Idempotent? | Notes |
|---|---|---|
| `POST /lessons/:slug/section-view` | YES | Adds sectionId to `sectionsViewedJson` if not already present; otherwise no-op |
| `POST /lessons/:slug/submit` | NO | Creates a new `QuizAttempt` row every call. Server enforces cooldown after fails |
| `POST /sr/:cardId/review` | NO | Advances the SM-2 schedule each call |
| `POST /gamification/daily/login/:userId` | YES (per day) | Backend dedupes by `DailyActivity.date == today` |
| `POST /interactive-events` | NO | Log table |

For non-idempotent POSTs, frontend MUST handle network failure carefully: queue via `mutation-queue` and replay on reconnect. The dedupe responsibility is server-side for daily-login; client-side for submits (don't retry submits on 5xx — the cooldown logic may have already advanced).

---

## 9. The seeding flow (deep)

See [`../../../frontend/docs/learning-module/SEEDING_AND_INGESTION.md`](../../../frontend/docs/learning-module/SEEDING_AND_INGESTION.md) for the canonical detailed flow. Quick reference:

```bash
# Validate one lesson without writing
JWT_SECRET="..." npm run import-lesson -- ../../../curriculum/.../lesson-NN-*.md --dry-run

# Import one lesson
JWT_SECRET="..." npm run import-lesson -- ../../../curriculum/.../lesson-NN-*.md

# Seed all (idempotent)
JWT_SECRET="..." npm run db:seed

# Lint all
JWT_SECRET="..." npm run curriculum:lint

# Nuke + reseed (dev only — destructive)
JWT_SECRET="..." npm run db:reset-seed
```

The seeder reads `path.join(__dirname, "..", "..", "..", "..", "curriculum")` — meaning it expects the curriculum folder at the project root. Don't move it.

---

## 10. Local development

### 10.1 Pre-requisites

- Node 22 (use nvm: `nvm install 22 && nvm use 22`)
- Docker Desktop running
- `psql` CLI (optional, for direct DB poking)

### 10.2 First-run bootstrap

```bash
cd backend
docker compose up -d postgres redis

cd services/learning-service
npm install
npx prisma generate
npx prisma db push

JWT_SECRET="cd240d9031f96046b4f42411d59ea3edc90a35a769ae4096042449b5508ad8ce" \
  NODE_ENV=development npm run db:seed
```

### 10.3 Boot the service

```bash
JWT_SECRET="..." NODE_ENV=development npm run dev
```

`tsx watch` reloads on file changes. The service logs to console via Pino.

### 10.4 Verify

```bash
curl -sS http://localhost:3013/health   # → {"status":"ok",...}

# Forge a JWT (see §5) and hit dashboard
JWT="$(node ...)"
curl -sS http://localhost:3013/api/v1/learn/dashboard?userId=dev-user-1 \
  -H "Authorization: Bearer $JWT" | python3 -m json.tool
```

### 10.5 Connect frontend

Set in `frontend/.env.local`:

```
NEXT_PUBLIC_LEARNING_SERVICE_URL=http://localhost:3013/api/v1
```

Restart Next.js dev server (env vars only loaded at boot).

---

## 11. Production deployment

This service is deployed on **Coolify (KVM4 server)** alongside the other backend services. See [`../../../docs/03-deployment.md`](../../../docs/03-deployment.md) for the deployment pipeline.

In production:

- The service binds to whatever port Coolify assigns; internal-only.
- The api-gateway (`backend/services/api-gateway`, port 8080) proxies `/api/v1/learn/*` to this service.
- Postgres + Redis are managed Coolify services.
- `JWT_SECRET` lives in Coolify's encrypted env-var store; matches `auth-service`'s secret.

Production smoke commands:

```bash
curl -sS https://api-gateway.grahvani.in/api/v1/learn/health
curl -sS https://api-gateway.grahvani.in/api/v1/learn/dashboard?userId=… \
  -H "Authorization: Bearer $PROD_JWT"
```

---

## 12. Observability

- **Logs:** Pino structured JSON; in dev, pino-pretty colorises. In prod, Coolify captures stdout.
- **Health:** `GET /health` → `{ status, service, version, timestamp }`. Hooked into Coolify's health-check.
- **Metrics:** Not yet wired (v1.1). Plan: Prometheus scrape of process metrics + key timers (`/dashboard` p50/p95, `/submit` p50/p95, DB pool saturation).
- **Tracing:** Not yet wired. Plan: OpenTelemetry → Honeycomb (v1.2).

---

## 13. Common failures + recovery

### 13.1 "Cannot connect to database"

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

→ `docker ps | grep grahvani-pg` — if not running: `docker start grahvani-pg`.

### 13.2 "JWT_SECRET env var not provided"

```
ZodError: Required at "JWT_SECRET"
```

→ Set `JWT_SECRET` to the canonical secret. Don't use the test-mode default in dev — your tokens won't verify with auth-service.

### 13.3 "Lesson not found" on a slug that exists

```
{ success: false, error: "Lesson not found" }
```

→ Run `npm run db:seed`. The markdown exists; the DB doesn't reflect it yet.

### 13.4 "MCQ bank not loaded for this lesson"

→ The lesson has no `assessment-bank/.../*.json` file, OR it failed validation. Run `npm run import-lesson -- <path> --dry-run` to see validation errors.

### 13.5 24-hour cooldown stuck on dev account

```bash
# Direct DB poke (dev only)
psql -h localhost -U grahvani -d grahvani -c \
  "UPDATE \"LessonProgress\" SET status='IN_PROGRESS' WHERE \"userId\"='dev-user-1';"
```

Then re-attempt the MCQ.

### 13.6 Migration mismatch after pulling main

```bash
cd backend/services/learning-service
npx prisma generate
npx prisma db push  # dev only; in prod use proper migrations
```

---

## 14. Adding a new endpoint — pattern

```typescript
// src/interfaces/http/routes/learn.routes.ts
router.post("/my-new-endpoint", async (req, res) => {
  try {
    const { userId, foo } = req.body;
    if (!userId || !foo) return res.status(400).json({ success: false, error: "userId and foo required" });
    const data = await myNewService.doTheThing(userId, foo);
    res.json({ success: true, data });
  } catch (err) {
    logger.error({ err }, "Failed to do the thing");
    res.status(500).json({ success: false, error: "Failed to do the thing" });
  }
});
```

Conventions:
- Always wrap in try/catch
- Always return `{ success: bool, data | error }` envelope
- Validate inputs explicitly (return 400 on missing required fields)
- Log errors via Pino
- 5xx for unexpected server errors, 4xx for client errors

Add the corresponding typed client in `frontend/src/lib/api/learning.ts`. Both files MUST move in the same PR.

---

## 15. Adding a new table — pattern

```bash
# 1. Edit prisma/schema.prisma — add the model
# 2. Push to DB
npx prisma db push
# 3. Regenerate the Prisma client
npx prisma generate
# 4. Add service methods in src/services/
# 5. Add route handlers in src/interfaces/http/routes/learn.routes.ts
# 6. Update the frontend client + types
# 7. In prod: use proper migrations (prisma migrate), NOT db push
```

---

## 16. Reseed safety

`npm run db:seed` is idempotent because the seeder uses `prisma.upsert()` on `slug @unique` columns. It is safe to re-run after any markdown change without losing per-user state. Per-user tables (`LessonProgress`, `UserBadge`, etc.) are never touched by the seeder.

`npm run db:reset-seed` is **destructive**. It drops all tables and re-creates them. Per-user data is lost. **Never run in production.**

---

*End of learning-service README v1.0 — 2026-05-22.*
