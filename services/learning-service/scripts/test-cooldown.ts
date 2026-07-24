import { PrismaClient } from "@prisma/client";
import { checkCooldown } from "../src/services/quiz.service";

const prisma = new PrismaClient();

async function runTests() {
  console.log("Running checkCooldown tests...");
  const userId = "test-user-cooldown";
  const lessonId = "test-lesson-cooldown";

  // Clean up previous test data
  await prisma.quizAttempt.deleteMany({
    where: { userId, lessonId }
  });

  // Test 1: No attempts -> no cooldown
  let res = await checkCooldown(userId, lessonId);
  console.log("Test 1 (No attempts):", res.cooldownActive === false ? "PASS" : "FAIL");

  // Test 2: One failed attempt -> 15m cooldown
  await prisma.quizAttempt.create({
    data: {
      id: "attempt-1",
      userId,
      moduleId: "test-module-cooldown",
      lessonId,
      score: 50,
      totalQuestions: 10,
      startedAt: new Date(),
      createdAt: new Date()
    }
  });

  res = await checkCooldown(userId, lessonId);
  let expectedNextAttempt = new Date(Date.now() + 15 * 60 * 1000);
  let diff = Math.abs(res.nextAttemptAt!.getTime() - expectedNextAttempt.getTime());
  console.log("Test 2 (1 fail -> 15m):", (res.cooldownActive === true && diff < 1000) ? "PASS" : "FAIL");

  // Backdate attempt 1 by 16 minutes to expire the cooldown
  await prisma.quizAttempt.update({
    where: { id: "attempt-1" },
    data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) }
  });

  res = await checkCooldown(userId, lessonId);
  console.log("Test 3 (1 fail, 16m ago -> expired):", res.cooldownActive === false ? "PASS" : "FAIL");

  // Test 4: Two failed attempts -> 8h cooldown
  await prisma.quizAttempt.create({
    data: {
      id: "attempt-2",
      userId,
      moduleId: "test-module-cooldown",
      lessonId,
      score: 60,
      totalQuestions: 10,
      startedAt: new Date(),
      createdAt: new Date()
    }
  });

  res = await checkCooldown(userId, lessonId);
  expectedNextAttempt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  diff = Math.abs(res.nextAttemptAt!.getTime() - expectedNextAttempt.getTime());
  console.log("Test 4 (2 fails -> 8h):", (res.cooldownActive === true && diff < 1000) ? "PASS" : "FAIL");

  // Test 5: Three failed attempts -> 24h cooldown
  await prisma.quizAttempt.create({
    data: {
      id: "attempt-3",
      userId,
      moduleId: "test-module-cooldown",
      lessonId,
      score: 70,
      totalQuestions: 10,
      startedAt: new Date(),
      createdAt: new Date()
    }
  });

  res = await checkCooldown(userId, lessonId);
  expectedNextAttempt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  diff = Math.abs(res.nextAttemptAt!.getTime() - expectedNextAttempt.getTime());
  console.log("Test 5 (3 fails -> 24h):", (res.cooldownActive === true && diff < 1000) ? "PASS" : "FAIL");

  // Clean up
  await prisma.quizAttempt.deleteMany({
    where: { userId, lessonId }
  });

  await prisma.$disconnect();
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
