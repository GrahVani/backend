const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSpecs() {
  try {
    const specs = await prisma.$queryRawUnsafe(`
      SELECT id, "componentType", metadata
      FROM app_tutor."InteractiveSpecEmbedding"
      LIMIT 10;
    `);
    console.log('Total Interactive Specs found:', specs.length);
    specs.forEach(s => {
      console.log('---');
      console.log('ID:', s.id);
      console.log('Type:', s.componentType);
      console.log('Metadata:', JSON.stringify(s.metadata));
    });
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}
checkSpecs();
