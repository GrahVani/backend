const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSections() {
  try {
    const sections = await prisma.$queryRawUnsafe(`
      SELECT "sectionNumber", content
      FROM app_tutor."LessonEmbedding"
      WHERE "lessonSlug" = 'jyotisha-as-vedanga'
      ORDER BY "sectionNumber" ASC;
    `);
    console.log('Total sections:', sections.length);
    sections.forEach(s => {
      console.log('--- Section', s.sectionNumber, '---');
      console.log(s.content.substring(0, 300));
    });
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}
checkSections();
