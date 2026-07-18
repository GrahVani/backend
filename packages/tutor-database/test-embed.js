const { PrismaClient } = require('@prisma/client'); 
const prisma = new PrismaClient(); 
prisma.lessonEmbedding.count()
  .then(c => console.log('Vector Embeddings Count:', c))
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
