const fs = require('fs');
const path = require('path');

function findEnvVars(dir, keys) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist' && file !== '.git') {
        findEnvVars(fullPath, keys);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const matches = content.match(/process\.env\.([A-Z0-9_]+)/g);
      if (matches) {
        for (const match of matches) {
          keys.add(match.replace('process.env.', ''));
        }
      }
    }
  }
}

const keys = new Set();
findEnvVars('c:/CorpoAstroOfficial_grahavani/Grahvani/grahvani-backend/services', keys);
findEnvVars('c:/CorpoAstroOfficial_grahavani/Grahvani/grahvani-backend/packages', keys);
findEnvVars('c:/CorpoAstroOfficial_grahavani/Grahvani/grahvani-backend/contracts', keys);

const envContent = fs.readFileSync('c:/CorpoAstroOfficial_grahavani/Grahvani/grahvani-backend/.env', 'utf8');

const missing = [];
for (const key of keys) {
  if (!envContent.includes(`${key}=`)) {
    missing.push(key);
  }
}

console.log('Missing backend:', missing.join(', '));
