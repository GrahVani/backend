import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const modules = await prisma.module.findMany({
    orderBy: { number: 'asc' },
    include: { chapters: { include: { lessons: { orderBy: { sequence: 'asc' } } } } }
  });
  for (const m of modules) {
    const lessonCount = m.chapters.reduce((s, c) => s + c.lessons.length, 0);
    if (lessonCount > 0) {
      console.log(`Module ${String(m.number).padStart(2, '0')} (${m.slug}): ${lessonCount} lessons`);
      for (const ch of m.chapters) {
        if (ch.lessons.length > 0) {
          console.log(`  Chapter ${ch.number} (${ch.slug}): ${ch.lessons.length} lessons`);
          for (const l of ch.lessons) {
            console.log(`    #${l.sequence} ${l.slug} [${l.authoringStatus}]`);
          }
        }
      }
    }
  }
  const total = modules.reduce((s, m) => s + m.chapters.reduce((s2, c) => s2 + c.lessons.length, 0), 0);
  console.log(`\n--- TOTAL: ${total} lessons ---`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
