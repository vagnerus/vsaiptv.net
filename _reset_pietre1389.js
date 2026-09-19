const Database = require('./server/node_modules/better-sqlite3');
const bcrypt = require('./server/node_modules/bcryptjs');
const path = require('path');
const { execSync } = require('child_process');

const newPassword = '123456';
const hash = bcrypt.hashSync(newPassword, 10);

console.log('=== RESET DE SENHA: Pietre1389 ===');

// 1. Atualizar banco local (Windows)
const localDbPath = path.join(__dirname, 'server/data/iptv.db');
const localDb = new Database(localDbPath);

const updateStmt = localDb.prepare(`
  UPDATE users
  SET password_hash = ?,
      plain_password = ?,
      must_change_password = 1,
      status = 'active'
  WHERE LOWER(username) = LOWER('pietre1389')
`);

const resLocal = updateStmt.run(hash, newPassword);
console.log(`✅ Banco local atualizado (${resLocal.changes} linha afetada).`);

const userLocal = localDb.prepare("SELECT id, username, role, status, plain_password, must_change_password FROM users WHERE LOWER(username) = 'pietre1389'").get();
console.log('   Dados no banco local:', userLocal);
localDb.close();

// 2. Atualizar banco de produção (WSL)
console.log('\n=== ATUALIZANDO BANCO DE PRODUÇÃO NO WSL ===');
try {
  const wslCmd = `wsl -e bash -lc "cd /home/vsai/vsaiptv/server && node -e \\"const Database = require('./node_modules/better-sqlite3'); const db = new Database('/home/vsai/vsaiptv/server/data/iptv.db'); const res = db.prepare(\\\\\\"UPDATE users SET password_hash = '${hash}', plain_password = '${newPassword}', must_change_password = 1, status = 'active' WHERE LOWER(username) = 'pietre1389'\\\\\\").run(); console.log('WSL rows updated:', res.changes); const u = db.prepare(\\\\\\"SELECT id, username, role, status, plain_password, must_change_password FROM users WHERE LOWER(username) = 'pietre1389'\\\\\\").get(); console.log('WSL user:', u); db.close();\\""`;
  const out = execSync(wslCmd).toString();
  console.log(out.trim());
  console.log('✅ Banco de produção no WSL atualizado com sucesso!');
} catch (err) {
  console.error('❌ Erro ao atualizar no WSL:', err.message);
  if (err.stdout) console.log(err.stdout.toString());
  if (err.stderr) console.error(err.stderr.toString());
}
