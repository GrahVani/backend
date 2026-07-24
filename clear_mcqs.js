const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgres://grahvani:grahvani2026prod@localhost:5432/grahvani?schema=app_tutor'
});
client.connect().then(() => {
  return client.query('DELETE FROM "app_tutor"."McqEmbedding"');
}).then(results => {
  console.log('Cleared MCQ embeddings.');
  client.end();
}).catch(e => {
  console.error(e);
  client.end();
});
