async function main() {
  const slug = "jyotisha-as-vedanga";
  console.log(`Triggering production index for: ${slug}`);
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
}
main();
