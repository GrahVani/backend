const fs = require('fs');

async function main() {
  const sql = fs.readFileSync('packages/tutor-database/prod_schema.sql', 'utf8');
  const statements = sql
    .replace(/^\uFEFF/, '')
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (let stmt of statements) {
    if (stmt.includes('--')) {
      stmt = stmt.replace(/--.*$/gm, '').trim();
    }
    if (!stmt) continue;
    
    // Fix vector without public.
    stmt = stmt.replace(/"vector" vector\(/g, '"vector" public.vector(');
    
    console.log('Executing:', stmt.substring(0, 50) + '...');
    
    const cmd = `cat << 'EOF' > /tmp/exec_sql.js
const { prisma } = require('/app/services/tutor-service/dist/database/prisma');
prisma.$executeRawUnsafe(\`${stmt.replace(/`/g, '\\`')}\`)
  .then(() => console.log('OK'))
  .catch(e => { console.error('Failed:', e.message); }) // DO NOT EXIT ON ERROR
  .finally(() => process.exit(0));
EOF
node /tmp/exec_sql.js
`;
    
    try {
      const res = await fetch('https://api-tutor.grahvani.in/admin/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd })
      });
      const d = await res.json();
      if (!d.success) {
        console.error('Command failed:', d.stderr || d.error);
        // Continue anyway
      } else {
        console.log('Success:', d.stdout.trim());
      }
    } catch(e) {
      console.error(e.message);
    }
  }
}

main();
