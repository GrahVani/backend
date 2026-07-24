const { execSync } = require('child_process');
const slugs = [
  "worked-example-career-change-question-end-to-end",
  "the-self-audit-discipline-applying-failure-modes-to-your-own-draft"
];

console.log(`Starting bulk indexing of ${slugs.length} failed lessons...`);
for (const slug of slugs) {
  console.log(`\n\n--- Indexing: ${slug} ---`);
  try {
    const output = execSync(`npm run index:lesson ${slug}`, { stdio: 'inherit' });
  } catch(e) {
    console.error(`Failed to index ${slug}`);
  }
}
console.log('\n\nBulk indexing of failed lessons complete!');
