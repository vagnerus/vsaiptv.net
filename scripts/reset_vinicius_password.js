const db = require('../server/src/db/database');
const bcrypt = require('../server/node_modules/bcryptjs');

const hash = bcrypt.hashSync('123456', 10);
db.prepare(`
  UPDATE users
  SET password_hash = ?,
      plain_password = '123456',
      must_change_password = 1,
      status = 'active',
      expires_at = '2099-12-31 23:59:59',
      notes = 'Revendedor oficial - Senha provisoria 123456 para alteracao no primeiro login'
  WHERE username = 'vinicius4447'
`).run(hash);

const updated = db.prepare('SELECT id, username, role, name, credits, max_connections, expires_at, status, must_change_password FROM users WHERE username = ?').get('vinicius4447');
console.log('Updated Local Windows DB:', updated);
console.log('Password 123456 valid?', bcrypt.compareSync('123456', updated.password_hash || hash));
