# Progress Tracking

This document explains how user learning progress is recorded and managed across the Grahvani platform. Grahvani uses a dual-state architecture combining robust backend database persistence with a fast, optimistic frontend store.

## Overview of the Dual-State Architecture

Grahvani ensures seamless user experience and data integrity by maintaining learning progress in two places:

1. **The Frontend Store (`progress-store.ts`)**: Built using Zustand with the `persist` middleware. It stores a user's progress locally in the browser. This allows the application to instantly reflect progress (e.g., locking/unlocking lessons, updating scores) without waiting for a server response.
2. **The Backend Database (`learning-service`)**: Built using Prisma ORM and PostgreSQL. It acts as the single source of truth, persisting every action securely.

---

## The Backend Schema: How Data is Stored

In the `learning-service` database, learning progress is tracked using two primary models:

### 1. `LessonProgress`
This model represents a user's overall journey through a single lesson.
- **`status`**: Can be `AVAILABLE`, `IN_PROGRESS`, `COMPLETED`, or `MASTERED`.
- **`score`**: The highest score achieved by the user in the lesson's quiz.
- **`completionPercentage`**: Tracks how far the user has read/scrolled through the lesson material.

### 2. `QuizAttempt`
This model records every individual attempt a user makes at a lesson's assessment (MCQ).
- **`score` & `correctAnswers`**: The result of the attempt.
- **`answersJson`**: A detailed JSON snapshot of exactly what the user answered for each question.
- **`createdAt`**: Used to determine when the user took the quiz, which is critical for **Cooldown Enforcement**.

---

## The Cooldown Enforcement Engine

To prevent users from blindly guessing MCQ answers, Grahvani implements a **Dynamic Cooldown Engine** inspired by industry-leading academic platforms (like Coursera and edX).

When a user fails a quiz (scores below 80%), they are placed on a cooldown timeout before they can retry. 

### Cooldown Tiers
The cooldown duration is dynamically calculated based on the total number of times the user has failed that specific lesson's quiz:
- **1st Failure**: 15-minute wait. (Encourages a quick review of the material).
- **2nd Failure**: 8-hour wait. (Forces the user to step away and digest the concepts).
- **3rd+ Failure**: 24-hour wait. (Caps at 24 hours to enforce spaced repetition learning).

### Dual Enforcement
- **Frontend**: The `progress-store.ts` locally calculates the cooldown and displays a countdown timer on the UI to provide immediate feedback.
- **Backend**: The `quiz.service.ts` inspects the `QuizAttempt` table. It counts the number of past failures and recalculates the exact same tier (15m, 8h, 24h). If a user attempts to bypass the frontend timer by tampering with local storage, the backend API route (`learn.routes.ts`) will reject the request with a `429 Too Many Requests` status, ensuring strict academic integrity.

---

## Mastery Status

Once a user scores **80% or higher** on a quiz, their `status` is permanently upgraded to **MASTERED**. 
- Mastering a lesson removes all future cooldowns for that specific lesson. 
- The user enters "Practice Mode", meaning they can retake the quiz as many times as they want to practice without any penalty or lockouts.
