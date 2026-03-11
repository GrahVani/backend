const { Client } = require('pg');
(async () => {
  const c = new Client({connectionString: 'postgres://grahvani:grahvani2026prod@localhost:5432/grahvani'});
  await c.connect();

  console.log('========================================');
  console.log('TABLE 1: app_auth.auth_users (PASSWORDS STORED HERE)');
  console.log('========================================');
  const auth = await c.query("SELECT email, password_hash, role, status FROM app_auth.auth_users WHERE email='naveenmotika9652@gmail.com'");
  if (auth.rows[0]) {
    console.log('Email:', auth.rows[0].email);
    console.log('password_hash:', auth.rows[0].password_hash);
    console.log('Role:', auth.rows[0].role);
    console.log('Status:', auth.rows[0].status);
  }

  console.log('');
  console.log('========================================');
  console.log('TABLE 2: app_users.users (PROFILE ONLY - NO PASSWORD)');
  console.log('========================================');
  const users = await c.query("SELECT email, password_hash, role, status FROM app_users.users WHERE email='naveenmotika9652@gmail.com'").catch(() => ({rows:[]}));
  if (users.rows[0]) {
    console.log('Email:', users.rows[0].email);
    console.log('password_hash:', users.rows[0].password_hash);
    console.log('Role:', users.rows[0].role);
    console.log('Status:', users.rows[0].status);
  }

  await c.end();
  process.exit(0);
})();
