import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const lesson = await prisma.lesson.findUnique({ where: { slug: 'jyotisha-as-vedanga' } });
  if (lesson) {
    console.log('✅ Lesson found:', lesson.title);
    console.log('   Tier:', lesson.tier, 'Module:', lesson.module, 'Chapter:', lesson.chapter, 'Seq:', lesson.sequence);
    console.log('   Type:', lesson.lessonType);
    console.log('   Body length:', lesson.bodyMarkdown?.length);
  } else {
    console.log('❌ Lesson not found');
  }
  await prisma.$disconnect();
}
main();
