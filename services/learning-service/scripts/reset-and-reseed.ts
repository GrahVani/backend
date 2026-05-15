import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Clearing old curriculum data...');
  
  // Delete in dependency order
  await prisma.interactiveEvent.deleteMany();
  await prisma.interactiveComponent.deleteMany();
  await prisma.spacedRepetitionCard.deleteMany();
  await prisma.userSRSession.deleteMany();
  await prisma.bibliographyEntry.deleteMany();
  await prisma.quizAttempt.deleteMany();
  await prisma.lessonProgress.deleteMany();
  await prisma.chapterProgress.deleteMany();
  await prisma.moduleProgress.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.chapter.deleteMany();
  await prisma.module.deleteMany();
  await prisma.tier.deleteMany();
  
  console.log('✅ Old data cleared');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
