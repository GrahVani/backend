const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgres://grahvani:grahvani2026prod@localhost:5432/grahvani?schema=app_tutor'
});
client.connect().then(() => {
  return Promise.all([
    client.query('SELECT count(*) FROM "app_tutor"."InteractiveSpecEmbedding"'),
    client.query('SELECT count(*) FROM "app_tutor"."McqEmbedding"'),
    client.query('SELECT count(*) FROM "app_tutor"."LessonEmbedding"'),
    client.query('SELECT id, content FROM "app_tutor"."McqEmbedding"')
  ]);
}).then(results => {
  console.log('Interactives:', results[0].rows[0].count);
  console.log('MCQs:', results[1].rows[0].count);
  console.log('Lessons:', results[2].rows[0].count);
  console.log('MCQ Rows:', results[3].rows.length, results[3].rows.map(r => r.id));
  client.end();
}).catch(e => {
  console.error(e);
  client.end();
});
