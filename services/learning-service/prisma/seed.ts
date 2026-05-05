import { PrismaClient } from "@prisma/client";
import { findQuestionsForLesson } from "./seed-data/question-loader";
import { transformQuestions } from "./seed-data/question-transformer";
import { COURSES } from "./seed-data/curriculum";
const prisma = new PrismaClient();

async function main() {
  await prisma.userProgress.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.course.deleteMany();

  // Seed all modules with question bank integration
  const allCourses = COURSES;
  let totalQuestions = 0;
  let lessonsEnhanced = 0;

  for (const courseData of allCourses) {
    const { lessons, ...courseFields } = courseData;
    const course = await prisma.course.create({
      data: {
        ...courseFields,
        lessons: {
          create: lessons.map((lesson) => {
            // Load enhanced questions from question banks
            const { questions, source } = findQuestionsForLesson(lesson.title);
            let contentJson = lesson.contentJson;

            if (questions && questions.length > 0) {
              const transformed = transformQuestions(questions);
              contentJson = {
                ...contentJson,
                quiz: transformed,
              };
              totalQuestions += transformed.length;
              lessonsEnhanced++;
              console.log(`  📖 ${lesson.title}: ${transformed.length} questions (${source})`);
            } else {
              console.log(`  ⚠️  ${lesson.title}: no questions found`);
            }

            return {
              title: lesson.title,
              sequenceOrder: lesson.sequenceOrder,
              lessonType: lesson.lessonType,
              contentJson: contentJson,
            };
          }),
        },
      },
    });
    console.log(`Seeded: ${course.title} (${lessons.length} lessons)`);
  }

  const totalLessons = allCourses.reduce((sum, c) => sum + c.lessons.length, 0);
  console.log("\n✅ FULL CURRICULUM SEEDED!");
  console.log(`📚 ${allCourses.length} Modules | ${totalLessons} Lessons | ${lessonsEnhanced}/${totalLessons} enhanced | ${totalQuestions} Total Questions`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
