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

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log(`Starting to trigger Production Embedding API for ${slugs.length} lessons...`);
  
  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    console.log(`[${i + 1}/${slugs.length}] Triggering production index for: ${slug}`);
    
    try {
      const res = await fetch(`https://api-tutor.grahvani.in/admin/index-lesson/${slug}`, {
        method: 'POST'
      });
      const data = await res.json();
      
      if (res.ok) {
        console.log(`   ✅ Success: ${data.message || 'Started'}`);
      } else {
        console.error(`   ❌ Failed with status ${res.status}:`, data);
      }
      
    } catch (e) {
      console.error(`   ❌ Request failed: ${e.message}`);
    }
    
    // Wait 15 seconds to avoid hitting the Gemini API rate limit in production
    if (i < slugs.length - 1) {
      console.log(`   Waiting 15 seconds before next request...`);
      await sleep(15000);
    }
  }
  
  console.log('Production Embedding trigger sequence completed!');
}

main();
