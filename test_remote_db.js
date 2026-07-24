const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgres://grahvani:grahvani2026prod@147.93.30.201:5432/grahvani?schema=app_tutor'
});
client.connect().then(() => {
  return client.query('SELECT count(*) FROM "app_tutor"."LessonEmbedding"');
}).then(res => {
  console.log('Rows:', res.rows[0].count);
  client.end();
}).catch(console.error);
