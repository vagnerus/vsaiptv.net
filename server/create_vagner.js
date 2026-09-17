const bcrypt = require('bcryptjs');
const db = require('./src/db/database.js');

const plainPassword = process.env.CLIENT_PASSWORD || process.env.ADMIN_PASSWORD;
if (!plainPassword) {
  console.error('ERRO: Defina a variável CLIENT_PASSWORD ou ADMIN_PASSWORD antes de executar este script.');
  process.exit(1);
}
const hash = bcrypt.hashSync(plainPassword, 10);

db.prepare('DELETE FROM users WHERE username = ?').run(username);

const res = db.prepare(`
  INSERT INTO users (
    username, password_hash, plain_password, role, name,
    max_connections, status, is_trial, expires_at, notes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  username,
  hash,
  plainPassword,
  'client',
  'Vagner (VIP)',
  10, // 10 telas simultaneas liberadas
  'active',
  0,
  '2099-12-31 23:59:59', // Vitalicio
  'Acesso Master VIP Vitalicio - Tudo Liberado'
);

db.prepare('UPDATE system_settings SET value = ? WHERE key = ?').run('VSA IPTV Premium', 'server_name');

console.log('Usuario Vagner configurado com sucesso! ID:', res.lastInsertRowid);
const user = db.prepare('SELECT id, username, role, name, max_connections, status, expires_at FROM users WHERE username = ?').get(username);
console.log('Dados do usuario:', user);
