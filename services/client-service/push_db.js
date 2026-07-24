const { execSync } = require('child_process');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve('../../.env') });

try {
  console.log("Running prisma db push for client-service...");
  execSync('npx prisma db push --accept-data-loss', { 
    cwd: __dirname, 
    stdio: 'inherit',
    env: { ...process.env }
  });
  console.log("Prisma db push completed!");
  
  // also run generate
  console.log("Running prisma generate for client-service...");
  execSync('npx prisma generate', { 
    cwd: __dirname, 
    stdio: 'inherit',
    env: { ...process.env }
  });
  console.log("Prisma generate completed!");
} catch (error) {
  console.error("Failed to run prisma commands:", error);
}
