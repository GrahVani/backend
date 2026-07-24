// Standalone test script to verify cooldown logic without DB dependencies

function calculateCooldown(failedAttempts: { createdAt: Date }[]) {
  if (failedAttempts.length === 0) {
    return { cooldownActive: false };
  }

  const lastFailedAttempt = failedAttempts[0]; // Assuming sorted desc
  const failCount = failedAttempts.length;

  let cooldownMs = 15 * 60 * 1000; // 15 mins
  if (failCount === 2) {
    cooldownMs = 8 * 60 * 60 * 1000; // 8 hours
  } else if (failCount >= 3) {
    cooldownMs = 24 * 60 * 60 * 1000; // 24 hours
  }

  const cooldownEnd = new Date(lastFailedAttempt.createdAt.getTime() + cooldownMs);

  if (new Date() < cooldownEnd) {
    return { cooldownActive: true, nextAttemptAt: cooldownEnd };
  }

  return { cooldownActive: false };
}

function runTests() {
  const now = new Date();
  let passedCount = 0;
  let totalCount = 0;

  function assert(name: string, condition: boolean) {
    totalCount++;
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passedCount++;
    } else {
      console.error(`❌ FAIL: ${name}`);
    }
  }

  // 1. No failed attempts
  let result = calculateCooldown([]);
  assert("No failed attempts -> No cooldown", result.cooldownActive === false);

  // 2. One failed attempt just now -> 15m cooldown
  result = calculateCooldown([{ createdAt: now }]);
  assert("1 failed attempt -> Cooldown Active", result.cooldownActive === true);
  assert("1 failed attempt -> 15m duration", 
    result.nextAttemptAt && Math.abs(result.nextAttemptAt.getTime() - (now.getTime() + 15 * 60 * 1000)) < 1000
  );

  // 3. One failed attempt 16 mins ago -> Expired
  let past16m = new Date(now.getTime() - 16 * 60 * 1000);
  result = calculateCooldown([{ createdAt: past16m }]);
  assert("1 failed attempt (16m ago) -> Expired", result.cooldownActive === false);

  // 4. Two failed attempts just now -> 8h cooldown
  result = calculateCooldown([{ createdAt: now }, { createdAt: new Date(now.getTime() - 10000) }]);
  assert("2 failed attempts -> Cooldown Active", result.cooldownActive === true);
  assert("2 failed attempts -> 8h duration", 
    result.nextAttemptAt && Math.abs(result.nextAttemptAt.getTime() - (now.getTime() + 8 * 60 * 60 * 1000)) < 1000
  );

  // 5. Two failed attempts 9 hours ago -> Expired
  let past9h = new Date(now.getTime() - 9 * 60 * 60 * 1000);
  result = calculateCooldown([{ createdAt: past9h }, { createdAt: new Date(past9h.getTime() - 10000) }]);
  assert("2 failed attempts (9h ago) -> Expired", result.cooldownActive === false);

  // 6. Three failed attempts just now -> 24h cooldown
  result = calculateCooldown([
    { createdAt: now }, 
    { createdAt: new Date(now.getTime() - 10000) },
    { createdAt: new Date(now.getTime() - 20000) }
  ]);
  assert("3 failed attempts -> Cooldown Active", result.cooldownActive === true);
  assert("3 failed attempts -> 24h duration", 
    result.nextAttemptAt && Math.abs(result.nextAttemptAt.getTime() - (now.getTime() + 24 * 60 * 60 * 1000)) < 1000
  );

  // 7. Four failed attempts -> 24h cooldown (cap)
  result = calculateCooldown([
    { createdAt: now }, 
    { createdAt: new Date(now.getTime() - 10000) },
    { createdAt: new Date(now.getTime() - 20000) },
    { createdAt: new Date(now.getTime() - 30000) }
  ]);
  assert("4 failed attempts -> 24h duration (Capped)", 
    result.nextAttemptAt && Math.abs(result.nextAttemptAt.getTime() - (now.getTime() + 24 * 60 * 60 * 1000)) < 1000
  );

  console.log(`\nResults: ${passedCount}/${totalCount} tests passed.`);
}

runTests();
