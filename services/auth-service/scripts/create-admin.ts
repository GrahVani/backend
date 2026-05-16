import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { PrismaClient } from "../src/generated/prisma";
import * as bcrypt from "bcryptjs";
import { createClient } from "redis";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.AUTH_DATABASE_URL || process.env.DATABASE_URL,
    },
  },
});

async function main() {
  const email = "chandukomera999@gmail.com";
  const password = "Chandu@123";
  const name = "Chandu Komera";
  const role = "admin";
  const hashedPassword = await bcrypt.hash(password, 12);
  const tenantId = "00000000-0000-0000-0000-000000000000";

  console.log(`Creating admin user: ${email}...`);

  // Step 1: Create or update user in auth database
  let userId: string;
  try {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hashedPassword,
        name,
        role,
        status: "active",
        emailVerified: true,
        tenantId,
      },
    });
    userId = user.id;
    console.log("✅ Admin created in app_auth.auth_users:", userId);
  } catch (e: any) {
    if (e.code === "P2002") {
      console.log("⚠️  User already exists. Updating to admin...");
      const user = await prisma.user.update({
        where: { email },
        data: {
          passwordHash: hashedPassword,
          name,
          role,
          emailVerified: true,
          status: "active",
        },
      });
      userId = user.id;
      console.log("✅ Admin updated:", userId);
    } else {
      console.error("❌ Error:", e);
      process.exit(1);
    }
  }

  // Step 2: Publish "user.registered" event to Redis
  // This tells user-service to create a profile in app_users.users
  console.log("Publishing user.registered event to Redis...");
  const redis = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
  });
  await redis.connect();

  const event = JSON.stringify({
    type: "user.registered",
    data: {
      userId,
      tenantId,
      email,
      name,
      role,
    },
    timestamp: new Date().toISOString(),
  });

  // Publish to both channels (same as auth-service does)
  await redis.publish("grahvani:events:auth", event);
  await redis.publish("grahvani:events:user", event);

  console.log("✅ Event published! User-service should now create profile in app_users.users");

  await redis.disconnect();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
