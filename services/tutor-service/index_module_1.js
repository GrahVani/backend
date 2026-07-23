const { execSync } = require('child_process');
const slugs = [
"jyotisha-as-vedanga",
"the-six-vedangas-and-their-relationship",
"jyotisha-vs-western-astrology-vs-pop-astrology",
"philosophy-of-karma-and-prediction",
"the-historical-timeline-of-jyotisha",
"parashara-the-foundational-rishi",
"varahamihira-the-systematic-codifier",
"medieval-codifiers-kalyanavarma-mantresvara",
"jaimini-and-the-second-tradition",
"modern-founders-krishnamurti-and-joshi",
"three-skandhas-overview",
"seven-sub-branches",
"where-grahvani-sits-in-the-skandha-map",
"regional-schools-and-lineages",
"modern-lineage-threads",
"lineage-matters-worked-example",
"the-3-step-protocol-overview",
"step-1-lagna-assessment",
"step-2-dasha-bhukti-analysis",
"step-3-gochara-confirmation",
"worked-example-3-step-protocol-end-to-end",
"parashara-as-default-and-when-to-layer",
"kp-for-cuspal-yes-no-questions",
"jaimini-for-cara-karaka-and-dharma-questions",
"lal-kitab-and-tajika-when-to-invoke",
"the-layered-framework-decision-logic-applied",
"the-four-confidence-tiers",
"the-two-yes-principle",
"deterministic-vs-probabilistic-prediction",
"confidence-tier-phrasing-rewriter",
"the-predictive-write-up-structure",
"worked-example-marriage-question-end-to-end",
"worked-example-career-change-question-end-to-end",
"multi-domain-synthesis-workbench-walkthrough",
"the-eight-predictive-failure-modes-overview",
"failure-modes-1-4-indicator-and-timing-errors",
"failure-modes-5-8-tone-and-scope-errors",
"the-self-audit-discipline-applying-failure-modes-to-your-own-draft"
];

console.log(`Starting bulk indexing of ${slugs.length} lessons...`);
for (const slug of slugs) {
  console.log(`\n\n--- Indexing: ${slug} ---`);
  try {
    const output = execSync(`npm run index:lesson ${slug}`, { stdio: 'inherit' });
  } catch(e) {
    console.error(`Failed to index ${slug}`);
  }
}
console.log('\n\nBulk indexing complete!');
