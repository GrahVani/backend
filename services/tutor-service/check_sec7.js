const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const sec = await prisma.$queryRawUnsafe(`SELECT content FROM app_tutor."LessonEmbedding" WHERE "lessonSlug" = 'jyotisha-as-vedanga' AND "sectionNumber" = 7`);
    console.log("SECTION 7:");
    console.log(sec[0].content);
    
    const spec = await prisma.$queryRawUnsafe(`SELECT content, metadata FROM app_tutor."InteractiveSpecEmbedding" WHERE metadata->>'lessonSlug' = 'jyotisha-as-vedanga'`);
    console.log("\nINTERACTIVE SPEC:");
    console.log(JSON.stringify(spec[0].metadata));
    console.log(spec[0].content);
  } catch(e) {} finally { await prisma.$disconnect(); }
}
check();
