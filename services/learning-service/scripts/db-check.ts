import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const tiers = await prisma.tier.count();
  const modules = await prisma.module.count();
  const chapters = await prisma.chapter.count();
  const lessons = await prisma.lesson.count();
  console.log(`DB: ${tiers} tiers, ${modules} modules, ${chapters} chapters, ${lessons} lessons`);
  await prisma.$disconnect();
}
main();
