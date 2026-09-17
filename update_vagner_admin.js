const path = require('path');
const db = require('./server/src/db/database');
const bcrypt = require('./server/node_modules/bcryptjs');

const vagner = db.prepare('SELECT * FROM users WHERE username = ?').get('vagner');
const admin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');

console.log('Vagner antes:', vagner ? { id: vagner.id, username: vagner.username, role: vagner.role } : null);
console.log('Admin antes:', admin ? { id: admin.id, username: admin.username, role: admin.role } : null);

const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) {
  console.error('ERRO DE SEGURANÇA: Defina a variável ADMIN_PASSWORD antes de executar este script.');
  process.exit(1);
}

const hash = bcrypt.hashSync(adminPassword, 10);

if (vagner) {
  db.prepare(`
    UPDATE users 
    SET role = 'master', 
        name = 'Vagner', 
        password_hash = ?, 
        plain_password = ?, 
        credits = 99999, 
        max_connections = 100, 
        status = 'active',
        expires_at = NULL
    WHERE username = 'vagner'
  `).run(hash, adminPassword);
} else {
  db.prepare(`
    INSERT INTO users (username, password_hash, plain_password, role, name, credits, max_connections, status) 
    VALUES ('vagner', ?, ?, 'master', 'Vagner', 99999, 100, 'active')
  `).run(hash, adminPassword);
}

const vagnerUpdated = db.prepare('SELECT * FROM users WHERE username = ?').get('vagner');

if (admin) {
  try { db.prepare('UPDATE credit_transactions SET reseller_id = ? WHERE reseller_id = ?').run(vagnerUpdated.id, admin.id); } catch(e) {}
  try { db.prepare('UPDATE audit_logs SET user_id = ? WHERE user_id = ?').run(vagnerUpdated.id, admin.id); } catch(e) {}
  try { db.prepare('UPDATE users SET reseller_id = ? WHERE reseller_id = ?').run(vagnerUpdated.id, admin.id); } catch(e) {}
  db.prepare('DELETE FROM users WHERE username = ?').run('admin');
  console.log('Antigo usuário admin deletado com sucesso.');
}

const users = db.prepare('SELECT id, username, role, status FROM users').all();
console.log('✅ Usuários no banco de dados agora:\n', JSON.stringify(users, null, 2));
process.exit(0);
