const crypto = require('crypto');

async function testChat() {
  const sessionId = "sess-prod-" + crypto.randomUUID();
  const lessonSlug = "jyotisha-as-vedanga";
  const message = "I am looking at the interaction diagram. What does it show and what am I supposed to click on? Please explain this visual to me before going into the theory.";

  console.log(`Sending chat to production (https://api-tutor.grahvani.in) for lesson ${lessonSlug}...`);
  console.log(`User message: "${message}"\n`);

  try {
    const res = await fetch(`https://api-tutor.grahvani.in/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'admin-tester-01'
      },
      body: JSON.stringify({
        message,
        lessonSlug,
        context: {
          componentType: "vedic-ecosystem-orbital",
          sectionNumber: 7
        }
      })
    });

    const data = await res.json();

    if (res.ok) {
      console.log('✅ Response received successfully:\n');
      console.log('--- AI TUTOR RESPONSE ---');
      console.log(data.answer);
      console.log('\n-------------------------');
      console.log(`Prompt Version Used: ${data.promptVersion}`);
    } else {
      console.error('❌ Request failed with status', res.status);
      console.error(data);
    }
  } catch (err) {
    console.error('❌ Fetch failed:', err.message);
  }
}

testChat();
