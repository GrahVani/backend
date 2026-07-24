const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSpecs() {
  try {
    const specs = await prisma.$queryRawUnsafe(`
      SELECT id, content, metadata
      FROM app_tutor."InteractiveSpecEmbedding"
      WHERE metadata->>'lessonSlug' = 'jyotisha-as-vedanga';
    `);
    console.log('Found specs:', specs.length);
    specs.forEach(s => {
      console.log('---');
      console.log('ID:', s.id);
      console.log('Metadata:', JSON.stringify(s.metadata));
      console.log('Content starts with:', s.content.substring(0, 100).replace(/\n/g, ' '));
    });
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}
checkSpecs();
