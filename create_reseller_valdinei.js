const Database = require('./server/node_modules/better-sqlite3');
const bcrypt = require('./server/node_modules/bcryptjs');
const path = require('path');

const targetDb = process.argv[2] || path.join(__dirname, 'server/data/iptv.db');
console.log(`Conectando ao banco: ${targetDb}`);

const db = new Database(targetDb);
db.pragma('journal_mode = WAL');

const password = '6957';
const hash = bcrypt.hashSync(password, 10);

const existing = db.prepare("SELECT * FROM users WHERE LOWER(username) = 'valdinei'").get();

if (existing) {
  console.log('Usuário valdinei encontrado. Atualizando para revendedor...');
  db.prepare(`
    UPDATE users
    SET role = 'reseller',
        password_hash = ?,
        plain_password = ?,
        status = 'active',
        name = 'Valdinei',
        notes = 'Painel Revendedor',
        must_change_password = 0
    WHERE id = ?
  `).run(hash, password, existing.id);
} else {
  console.log('Usuário valdinei não encontrado. Criando novo revendedor...');
  db.prepare(`
    INSERT INTO users (
      username, password_hash, plain_password, role, name,
      credits, max_connections, status, notes, must_change_password
    ) VALUES (
      'valdinei', ?, ?, 'reseller', 'Valdinei',
      100, 5, 'active', 'Painel Revendedor', 0
    )
  `).run(hash, password);
}

const updated = db.prepare("SELECT id, username, plain_password, role, credits, status, expires_at FROM users WHERE LOWER(username) = 'valdinei'").get();
console.log('✅ Revendedor configurado com sucesso:\n', updated);

db.close();
