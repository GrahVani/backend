import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  // Check first lesson (jyotisha-as-vedanga)
  const l1 = await prisma.lesson.findUnique({
    where: { slug: 'jyotisha-as-vedanga' },
    include: { mcqBank: true }
  });
  console.log('Lesson 1:', l1?.title);
  console.log('  body length:', l1?.bodyMarkdown?.length || 0);
  console.log('  bloomLevels:', l1?.bloomLevels);
  console.log('  mcqCount:', l1?.mcqCount);
  console.log('  has McqBank:', !!l1?.mcqBank);
  console.log('  McqBank questions:', (l1?.mcqBank?.questions as any[])?.length || 0);
  console.log('  prerequisites:', l1?.prerequisites);
  
  // Check a module 02 lesson
  const l2 = await prisma.lesson.findUnique({
    where: { slug: 'computing-lahiri-by-hand' },
    include: { mcqBank: true }
  });
  console.log('\nLesson computing-lahiri-by-hand:', l2?.title);
  console.log('  body length:', l2?.bodyMarkdown?.length || 0);
  console.log('  has McqBank:', !!l2?.mcqBank);
  console.log('  McqBank questions:', (l2?.mcqBank?.questions as any[])?.length || 0);
  
  // Count lessons with McqBank rows
  const allLessons = await prisma.lesson.findMany({ select: { slug: true, mcqCount: true } });
  const mcqBankCount = await prisma.mcqBank.count();
  console.log('\nLessons with McqBank rows:', mcqBankCount, '/', allLessons.length);
  
  // Check for any null bodyMarkdown
  const nullBody = allLessons.filter(l => !l.bodyMarkdown);
  console.log('Lessons with empty body:', nullBody.length);
}
main().catch(console.error).finally(() => prisma.$disconnect());
