import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  console.log('Checking DB...');
  const count = await prisma.lesson.count();
  console.log('Lessons:', count);
  const tiers = await prisma.tier.findMany();
  console.log('Tiers:', tiers.length);
  const modules = await prisma.module.findMany();
  console.log('Modules:', modules.length);
  const chapters = await prisma.chapter.findMany();
  console.log('Chapters:', chapters.length);
}
main().catch(e => console.error('ERR:', e)).finally(() => prisma.$disconnect());
