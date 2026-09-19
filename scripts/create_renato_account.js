const Database = require('../server/node_modules/better-sqlite3');
const bcrypt = require('../server/node_modules/bcryptjs');
const path = require('path');

const targetDb = process.argv[2] || path.join(__dirname, '../server/data/iptv.db');
console.log(`Conectando ao banco de dados: ${targetDb}`);

const db = new Database(targetDb);
db.pragma('journal_mode = WAL');

const password = '123456';
const hash = bcrypt.hashSync(password, 10);

// Remover quaisquer contas duplicadas ou variações
console.log('Verificando contas renatovarvalho1235 e renatocarvalho1235 para unificar...');
db.prepare("DELETE FROM users WHERE LOWER(username) IN ('renatovarvalho1235', 'renatocarvalho1235')").run();

// Verificar se renato1235 já existe
const existing = db.prepare("SELECT * FROM users WHERE LOWER(username) = 'renato1235'").get();

if (existing) {
  console.log('Usuário renato1235 encontrado. Atualizando para revendedor com 10 créditos e acesso ilimitado...');
  db.prepare(`
    UPDATE users
    SET role = 'reseller',
        password_hash = ?,
        plain_password = ?,
        name = 'Renato Carvalho',
        credits = 10,
        max_connections = 100,
        status = 'active',
        is_trial = 0,
        expires_at = '2099-12-31 23:59:59',
        notes = 'Painel Revendedor - 10 Creditos + Player Ilimitado',
        must_change_password = 1
    WHERE id = ?
  `).run(hash, password, existing.id);
  console.log(`✅ Usuário renato1235 (ID: ${existing.id}) atualizado com sucesso!`);
} else {
  console.log('Criando conta renato1235 (Revendedor + 10 Créditos + Player Ilimitado)...');
  const result = db.prepare(`
    INSERT INTO users (
      username, password_hash, plain_password, role, name,
      email, phone, credits, max_connections, status, is_trial,
      expires_at, notes, must_change_password
    ) VALUES (
      'renato1235', ?, ?, 'reseller', 'Renato Carvalho',
      'renato@iptv.com', '', 10, 100, 'active', 0,
      '2099-12-31 23:59:59', 'Painel Revendedor - 10 Creditos + Player Ilimitado', 1
    )
  `).run(hash, password);
  console.log(`✅ Conta renato1235 criada com sucesso! ID: ${result.lastInsertRowid}`);
}

// Verificação final
const user = db.prepare("SELECT id, username, role, name, credits, max_connections, expires_at, status, must_change_password FROM users WHERE username = 'renato1235'").get();
console.log('\n--- DADOS DA CONTA RENATO1235 ---');
console.log(JSON.stringify(user, null, 2));

db.close();
