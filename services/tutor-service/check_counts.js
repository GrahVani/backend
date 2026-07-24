const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const l = await prisma.lessonEmbedding.count();
  const m = await prisma.mcqEmbedding.count();
  const i = await prisma.interactiveSpecEmbedding.count();
  console.log(`Lessons: ${l}, MCQs: ${m}, Interactives: ${i}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
