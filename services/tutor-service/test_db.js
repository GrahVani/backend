const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://grahvani:grahvani2026prod@147.93.30.201:5433/grahvani?schema=app_tutor' });
client.connect().then(() => {
  console.log('Connected!');
  return client.query('SELECT COUNT(*) FROM "InteractiveSpecEmbedding"');
}).then(res => {
  console.log('Rows:', res.rows[0].count);
  client.end();
}).catch(err => {
  console.error(err);
  client.end();
});
