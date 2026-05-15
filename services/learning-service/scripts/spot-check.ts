import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  // Check first lesson (jyotisha-as-vedanga)
  const l1 = await prisma.lesson.findUnique({ where: { slug: 'jyotisha-as-vedanga' } });
  console.log('Lesson 1:', l1?.title);
  console.log('  body length:', l1?.bodyMarkdown?.length || 0);
  console.log('  bloomLevels:', l1?.bloomLevels);
  console.log('  mcqCount:', l1?.mcqCount);
  console.log('  mcqBankFile:', l1?.mcqBankFile);
  console.log('  prerequisites:', l1?.prerequisites);
  
  // Check a module 02 lesson
  const l2 = await prisma.lesson.findUnique({ where: { slug: 'computing-lahiri-by-hand' } });
  console.log('\nLesson computing-lahiri-by-hand:', l2?.title);
  console.log('  body length:', l2?.bodyMarkdown?.length || 0);
  console.log('  mcqBankFile:', l2?.mcqBankFile);
  
  // Count MCQ bank files referenced
  const allLessons = await prisma.lesson.findMany({ select: { slug: true, mcqBankFile: true, mcqCount: true } });
  const withMcq = allLessons.filter(l => l.mcqBankFile);
  console.log('\nLessons with MCQ banks:', withMcq.length, '/', allLessons.length);
  
  // Check for any null bodyMarkdown
  const nullBody = allLessons.filter(l => !l.bodyMarkdown);
  console.log('Lessons with empty body:', nullBody.length);
}
main().catch(console.error).finally(() => prisma.$disconnect());
