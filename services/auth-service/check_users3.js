require('dotenv').config({ path: 'C:/CorpoAstroOfficial_grahavani/Grahvani/grahvani-backend/.env' });
const { PrismaClient: AuthPrisma } = require('C:/CorpoAstroOfficial_grahavani/Grahvani/grahvani-backend/services/auth-service/src/generated/prisma');
const { PrismaClient: UserPrisma } = require('C:/CorpoAstroOfficial_grahavani/Grahvani/grahvani-backend/services/user-service/src/generated/prisma');

async function main() {
    const authPrisma = new AuthPrisma();
    const userPrisma = new UserPrisma();
    try {
        console.log('--- AUTH USERS ---');
        const authUsers = await authPrisma.user.findMany({
            select: { id: true, email: true, createdAt: true }
        });
        console.table(authUsers);

        console.log('--- USER PROFILES ---');
        const profiles = await userPrisma.user.findMany({
            select: { id: true, email: true, createdAt: true }
        });
        console.table(profiles);
    } catch (err) {
        console.error(err);
    } finally {
        await authPrisma.$disconnect();
        await userPrisma.$disconnect();
    }
}
main();
