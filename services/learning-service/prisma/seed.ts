import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Create Astro-Lingo Course
  const course = await prisma.course.create({
    data: {
      title: "Astrology",
      description: "Level 1: The Astronomical Grid — Learn the foundations of Vedic astrology calculations.",
      level: "LEVEL_1",
      category: "FOUNDATIONS",
      lessons: {
        create: [
          {
            title: "The Shifting Sky (Ayanamsa)",
            sequenceOrder: 1,
            lessonType: "THEORY",
            contentJson: {
              intro: "Welcome to your first Astro-Lingo lesson! Today we learn how to turn raw space data into precise astrological coordinates.",
              concepts: [
                {
                  id: 1,
                  title: "The Shifting Sky (Ayanamsa)",
                  description: "There are two main ways to measure the zodiac. The Tropical Zodiac is tied to seasons. The Sidereal Zodiac (used in Vedic astrology) is anchored to actual stars. Because Earth slowly wobbles, these systems drift apart. To align with the true sky, we use a mathematical offset called Ayanamsa. For highest accuracy, astrologers apply the True Citra Ayanamsa."
                },
                {
                  id: 2,
                  title: "The Shadow Planets (Nodes)",
                  description: "Rahu and Ketu are not physical rocks; they are mathematical points where Sun and Moon orbits intersect. The Moon's orbit wobbles, so we calculate two ways: 1. Mean Node: averaged position. 2. True Node: exact real-time position. For precision — like calculating a sub-lord — True Node is required."
                },
                {
                  id: 3,
                  title: "Computational Precision",
                  description: "A chart is only as good as its math. To calculate exact planetary longitudes, you need an ephemeris. While standard tools handle most planets, the Sun requires extreme precision. For flawless daily solar calculations like exact sunrise, specialized libraries like Skyfield are used over standard math."
                }
              ],
              quiz: [
                {
                  questionId: 1,
                  question: "You are writing a calculation to ensure planetary longitudes match the physical, fixed stars perfectly. Which mathematical correction must you apply?",
                  options: { A: "Combustion Offset", B: "True Citra Ayanamsa", C: "The Jaimini Aspect", D: "Argala" },
                  correctAnswer: "B",
                  explanation: "True Citra Ayanamsa aligns the math to the physical stars."
                },
                {
                  questionId: 2,
                  question: "You are trying to determine a highly precise sub-lord for a micro-divisional chart. Which calculation for Rahu and Ketu should you use?",
                  options: { A: "True Node", B: "Mean Node", C: "Exalted Node", D: "Dispositor Node" },
                  correctAnswer: "A",
                  explanation: "True Node gives the exact, real-time coordinate without averaging."
                },
                {
                  questionId: 3,
                  question: "Your system's sunrise calculation keeps failing or giving inaccurate times. What is the most computationally sound way to fix this?",
                  options: { A: "Add a flat 5-minute manual offset", B: "Switch to calculating the Moon", C: "Utilize a specialized astronomical library like Skyfield", D: "Use the Mean Node position of the Sun" },
                  correctAnswer: "C",
                  explanation: "Specialized libraries handle precise solar metrics."
                }
              ]
            }
          },
          {
            title: "The Shadow Planets Deep Dive",
            sequenceOrder: 2,
            lessonType: "THEORY",
            contentJson: {
              intro: "Understanding Rahu and Ketu in depth.",
              concepts: [
                { id: 1, title: "Rahu — The North Node", description: "Rahu represents desire, ambition, and material pursuit. It shows where we obsess and what we chase." },
                { id: 2, title: "Ketu — The South Node", description: "Ketu represents detachment, spirituality, and past life karma. It shows what we have mastered and no longer need." }
              ],
              quiz: [
                { questionId: 1, question: "Rahu represents:", options: { A: "Detachment", B: "Desire and ambition", C: "Sleep", D: "Wealth" }, correctAnswer: "B", explanation: "Rahu is the head — always hungry, always chasing." }
              ]
            }
          },
          {
            title: "Computational Precision Lab",
            sequenceOrder: 3,
            lessonType: "THEORY",
            contentJson: {
              intro: "Practice calculating precise planetary positions.",
              concepts: [
                { id: 1, title: "Ephemeris Data", description: "An ephemeris is a table giving the coordinates of celestial objects at regular intervals." },
                { id: 2, title: "Interpolation", description: "When you need a position between two ephemeris entries, you interpolate linearly." }
              ],
              quiz: [
                { questionId: 1, question: "What is an ephemeris?", options: { A: "A type of yoga", B: "A table of celestial positions", C: "A house system", D: "A planet" }, correctAnswer: "B", explanation: "Ephemeris = table of planetary positions over time." }
              ]
            }
          }
        ]
      }
    }
  });

  console.log(`Seeded course: ${course.title} with ${course.id}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
