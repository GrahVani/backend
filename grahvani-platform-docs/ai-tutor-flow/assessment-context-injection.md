# Assessment Context Injection

This document details how the AI Tutor is made aware of a user's quiz performance, allowing it to act as a personalized coach rather than just a textbook.

## The Problem

When a user fails a quiz and asks the AI, "Why did I get this wrong?", the AI historically lacked the context of *what* the user actually answered. This led to generic or hallucinated explanations.

## The Solution: The `QuizAttemptContext`

We designed an injection pipeline that passes exact quiz attempt data directly into the AI's "brain" (system prompt).

### 1. Capturing the Attempt on the Frontend
When a user submits a quiz inside `MCQFlow.tsx`, the frontend receives a detailed grading response from the backend.
If the score is below 80%, the frontend isolates the incorrect answers. It records:
- The question text.
- The choice the user selected (the wrong answer).
- The correct answer.

This data is saved into the `useTutorStore.ts` under the `quizAttempt` state object.

### 2. Hydrating the Query
When the user subsequently asks a question in the Tutor Panel, the `_computeEnrichedMessage` function intercepts it.
It converts the stored `quizAttempt` data into a readable XML-like string and appends it to the user's message.

Example of what the backend actually receives:
```xml
[USER QUERY]
I chose option B for the Jyotisha original function, why is it wrong?

<user_recent_quiz_attempt>
User recently failed a quiz with score 50%.
Incorrect Question: What was the original function of Jyotisha according to Lagadha?
User chose: Philosophical contemplation
Correct answer: Timing of Vedic rituals
</user_recent_quiz_attempt>
```

### 3. The "Progressive Disclosure" Policy
If the AI just gave the user the correct answer directly, the user wouldn't learn. To enforce a true tutoring experience, the `prompt.service.ts` injects a strict rule block called `<assessment_policy>` into the system prompt.

This policy instructs the LLM:
1. **Never reveal the exact answer directly.**
2. **Use the Socratic Method**: Analyze the user's *wrong choice* and explain why that logic is flawed based on the lesson text.
3. **Provide a hint**: Nudge the user toward the correct reasoning without spoiling it.

This pipeline ensures that the AI Tutor acts as a genuine academic guide, dynamically responding to the specific misconceptions of the user.
