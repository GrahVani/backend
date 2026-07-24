# Lesson Unlocking & Prerequisite Gates

This document explains the progression flow in Grahvani and how lessons are locked and unlocked dynamically based on a user's learning journey.

## Defining Prerequisites

The curriculum content is authored in Markdown files stored in the `curriculum/` directory. The structure and requirements for each lesson are defined in the file's **YAML Frontmatter**.

To specify that a lesson cannot be accessed until a previous lesson is mastered, curriculum authors define a `prerequisites` array.

Example Frontmatter:
```yaml
---
title: "The Limbs of the Veda"
slug: "vedanga-overview"
prerequisites:
  - "introduction-to-jyotisha"
---
```
When this file is parsed and seeded into the database, the backend creates logical links mapping the `vedanga-overview` lesson to require mastery of `introduction-to-jyotisha`.

---

## Dynamic Frontend Unlocking

Grahvani enforces these prerequisite locks strictly on the frontend to ensure users follow the correct pedagogical path.

### 1. Dashboard Visualization (The Padlock)
When the user views their curriculum dashboard, the frontend iterates over the lesson list and checks the `progress-store.ts` to see if the user has a `MasteryStatus` of `"Mastered"` for all listed prerequisites.
- **If Prerequisites are Met**: The lesson card is fully clickable and acts normally.
- **If Prerequisites are Missing**: The lesson card is greyed out, and a **Padlock (🔒)** icon is overlaid. The card is disabled, preventing the user from clicking into it.

### 2. URL Route Protection (`LessonGuard`)
If a curious user tries to bypass the dashboard by typing the URL of a locked lesson directly into their browser (e.g., `http://localhost:3000/learn/1/1/1/vedanga-overview`), the system will intercept them.

This is handled by the **`LessonGuard` Component**. 
- It wraps the dynamic `[lesson]/page.tsx` route.
- Upon mounting, it pulls the requested lesson's frontmatter and checks the `prerequisites` array against the local `progress-store`.
- If the user has not mastered the prerequisites, `LessonGuard` immediately blocks the render of the lesson content, displays an "Unauthorized / Lesson Locked" message, and automatically redirects the user back to the dashboard.
