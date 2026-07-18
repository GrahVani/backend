const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'info' },
    { emit: 'event', level: 'warn' },
    { emit: 'event', level: 'error' },
  ]
});

prisma.$on('query', (e) => {
  console.log('SQL Query: ' + e.query);
});

async function main() {
  console.log('----- EXISTING TABLES IN PUBLIC SCHEMA -----');
  try {
    const tables = await prisma.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public';");
    console.log(tables.map(t => t.tablename));
  } catch(e) {
    console.log('Failed to query pg_tables: ', e.message);
  }

  console.log('\n----- EXECUTING ROUTE LOGIC -----');
  try {
    const lesson = await prisma.lesson.findUnique({
      where: { slug: 'test' },
      include: {
        lessonSections: {
          orderBy: { sectionNumber: 'asc' },
        },
      },
    });
    console.log('Success:', lesson);
  } catch (err) {
    console.error('\n----- FULL PRISMA EXCEPTION -----');
    console.error(err.message);
    console.error('\n----- PRISMA ERROR CODE -----');
    console.error(err.code);
    console.error('\n----- STACK TRACE -----');
    console.error(err.stack);
  } finally {
    await prisma.$disconnect();
  }
}
main();
