# Grahvani Curriculum Seed System

This directory contains all the data and logic for seeding the Grahvani learning curriculum into the database.

## Prerequisites

1. **PostgreSQL running locally** (port 5432)
2. **`.env` file configured** — copy `.env.example` to `.env` and set your `DATABASE_URL`
3. **Dependencies installed**:
   ```bash
   cd grahvani-backend/services/learning-service
   npm install
   ```
4. **Database schema pushed** (one-time):
   ```bash
   npm run db:push
   ```

## Quick Start

```bash
cd grahvani-backend/services/learning-service
npm run db:seed
```

The seed will wipe and re-create all course/lesson data (user progress is preserved). Run it after every pull to get the latest curriculum updates.

---

## File Structure

```
prisma/seed-data/
├── curriculum.ts          ← All courses, lessons, and base content
├── question-loader.ts     ← Question bank loader + lesson-to-question mapping
├── main-bank.json         ← 334 primary enhanced questions (10 modules)
├── supplemental.json      ← 40 extra questions for 4 lessons
├── corrective.json        ← 20 custom questions for topic-mismatched lessons
└── README.md              ← You are here
```

---

## How Lesson → Question Mapping Works

When you run `npm run db:seed`, the system looks for enhanced questions for each lesson in this priority order:

1. **`corrective.json`** — Custom questions written specifically for a lesson title. Highest priority.
2. **Explicit overrides** in `question-loader.ts` — Hardcoded `lessonTitle → {moduleId, lessonId}` mappings. Use this when fuzzy matching is ambiguous.
3. **`main-bank.json`** — The primary question bank. Fuzzy title matching finds the best-scoring question bank lesson.
4. **`supplemental.json`** — Extra questions for lessons not fully covered by the main bank.

---

## Common Developer Tasks

### 1. Add questions to an existing lesson

**Option A: The lesson already matches a question bank**
- Edit the questions directly in `main-bank.json` or `supplemental.json`
- Find the lesson by its `lessonTitle` inside the JSON
- Add/modify questions in the `questions` array
- Run `npm run db:seed`

**Option B: The lesson needs completely new questions**
- Open `corrective.json`
- Add a new entry to the `lessons` array:
  ```json
  {
    "lessonTitle": "Exact Lesson Title from curriculum.ts",
    "questions": [
      {
        "id": "ABC-001",
        "question": "Your question text?",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctAnswerIndex": 0,
        "explanationCorrect": "CORRECT. Explanation...",
        "explanationsWrong": {
          "A": "Why A is wrong...",
          "B": "Why B is wrong...",
          "C": "Why C is wrong..."
        },
        "difficulty": "medium",
        "tags": ["tag1", "tag2"],
        "grahavaniFeature": "Feature Name",
        "conceptLadder": 2
      }
    ]
  }
  ```
- Run `npm run db:seed`

### 2. Add a new lesson to an existing course

1. Open `curriculum.ts`
2. Find the course module (e.g., `Module 5: Micro-Analysis...`)
3. Add a new lesson object to the `lessons` array with a unique `sequenceOrder`
4. Add questions to `corrective.json` (or one of the question banks)
5. Run `npm run db:seed`

### 3. Add a brand new course module

1. Open `curriculum.ts`
2. Add a new course object to the `COURSES` array
3. Add lessons with `sequenceOrder` starting from 1
4. Add questions to `corrective.json` or a new question bank JSON
5. Run `npm run db:seed`

### 4. Fix a question-lesson mismatch

If you notice a lesson has questions about the wrong topic:

1. **Check if an explicit override exists:** Open `question-loader.ts` and search for the lesson title in `EXPLICIT_QUESTION_OVERRIDES`. If it's missing or wrong, fix it.
2. **Check question bank titles:** The lesson title in `curriculum.ts` must fuzzy-match the `lessonTitle` in the JSON bank. If they don't match at all, add an explicit override.
3. Run `npm run db:seed`

### 5. Validate before seeding

To check if all lessons will find their questions **without touching the database**:

```bash
npx tsx prisma/seed.ts --validate
```

This prints:
- ✅ Matched lessons with question counts
- ❌ Unmatched lessons (if any)

---

## Question Format

Questions use **Format A** (same as `main-bank.json`):

```json
{
  "id": "UNIQUE-ID-001",
  "question": "The question text?",
  "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
  "correctAnswerIndex": 0,
  "explanationCorrect": "CORRECT. Why the right answer is right...",
  "explanationsWrong": {
    "A": "Why this option is wrong...",
    "B": "Why this option is wrong...",
    "C": "Why this option is wrong..."
  },
  "difficulty": "easy|medium|hard",
  "tags": ["concept-tag", "another-tag"],
  "grahavaniFeature": "Grahvani Platform Feature Name",
  "conceptLadder": 1
}
```

- `conceptLadder: 1` = Remember, `2` = Understand, `3` = Apply, `4` = Analyze, `5` = Evaluate, `6` = Create
- The frontend `EnhancedQuiz` component normalizes both Format A and Format B automatically.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Lesson has 0 questions after seed | Run `npx tsx prisma/seed.ts --validate` to see if the lesson title matches any question bank |
| Lesson has wrong-topic questions | Add an explicit override in `question-loader.ts` |
| Seed throws "Cannot find module" | Make sure you're in `grahvani-backend/services/learning-service` and have run `npm install` |
| Want to start fresh | The seed is idempotent — it updates existing data without destroying user progress. To fully reset, use `npx prisma migrate reset` instead. |
