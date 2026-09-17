/**
 * VSAIPTV — Deploy Script Fase 4
 * Executa:
 * 1. Backup transacional do SQLite com db.backup()
 * 2. Validação de integridade do backup (PRAGMA integrity_check)
 * 3. Backup de snapshot do diretório da aplicação
 * 4. Migração dos 6 índices com medição de tempo
 * 5. Validação de integridade pós-migração
 * 6. Geração de segredos criptográficos fortes e rotação de credenciais
 * 7. Atualização do .env de produção
 * 
 * Regra estrita: NUNCA imprimir segredos em stdout/logs.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const PROD_DIR = '/home/vsai/vsaiptv';
const PROD_DB_PATH = path.join(PROD_DIR, 'server/data/iptv.db');
const BACKUP_DB_PATH = path.join(PROD_DIR, 'server/data/iptv_backup_pre_fase4.db');
const BACKUP_CODE_DIR = '/home/vsai/vsaiptv_backup_pre_fase4';
const PROD_ENV_PATH = path.join(PROD_DIR, 'server/.env');

async function main() {
  console.log('====================================================');
  console.log('🛡️  VSAIPTV FASE 4: PRE-DEPLOY & MIGRAÇÃO CONTROLADA');
  console.log('====================================================\n');

  // --- 1. BACKUP TRANSACIONAL DO SQLITE ---
  console.log('--- 1. Backup Seguro do SQLite de Produção ---');
  if (!fs.existsSync(PROD_DB_PATH)) {
    throw new Error(`Banco de produção não encontrado em: ${PROD_DB_PATH}`);
  }

  const prodDb = new Database(PROD_DB_PATH);
  console.log('Conectado ao banco ativo:', PROD_DB_PATH);
  console.log('Iniciando db.backup() para consistência com WAL...');
  const t0Backup = Date.now();
  await prodDb.backup(BACKUP_DB_PATH);
  const backupDuration = Date.now() - t0Backup;

  const backupStat = fs.statSync(BACKUP_DB_PATH);
  console.log(`✅ Backup SQLite concluído com sucesso em ${backupDuration}ms`);
  console.log(`   Local: ${BACKUP_DB_PATH}`);
  console.log(`   Tamanho: ${(backupStat.size / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   Timestamp: ${new Date().toISOString()}`);

  // --- 2. VALIDAÇÃO DO BACKUP EM PROCESSO SEPARADO ---
  console.log('\n--- 2. Validação da Integridade do Backup ---');
  const backupDb = new Database(BACKUP_DB_PATH, { readonly: true });
  const backupIntegrity = backupDb.prepare('PRAGMA integrity_check;').get();
  backupDb.close();

  console.log('Resultado do PRAGMA integrity_check no backup:', backupIntegrity);
  if (backupIntegrity.integrity_check !== 'ok') {
    throw new Error(`FALHA CRÍTICA: Backup inconsistente: ${JSON.stringify(backupIntegrity)}`);
  }
  console.log('✅ Integridade do backup validada: OK');

  // --- 3. BACKUP DO CÓDIGO DA APLICAÇÃO ---
  console.log('\n--- 3. Snapshot de Código de Produção ---');
  const { execSync } = require('child_process');
  if (!fs.existsSync(BACKUP_CODE_DIR)) {
    fs.mkdirSync(BACKUP_CODE_DIR, { recursive: true });
  }
  execSync(`cp -r ${PROD_DIR}/server ${BACKUP_CODE_DIR}/server`);
  execSync(`cp -r ${PROD_DIR}/client ${BACKUP_CODE_DIR}/client`);
  if (fs.existsSync(`${PROD_DIR}/ecosystem.config.js`)) {
    execSync(`cp ${PROD_DIR}/ecosystem.config.js ${BACKUP_CODE_DIR}/`);
  }
  console.log(`✅ Snapshot de código salvo em: ${BACKUP_CODE_DIR}`);

  // --- 4. MIGRAÇÃO DOS ÍNDICES DE ALTA PERFORMANCE ---
  console.log('\n--- 4. Aplicação de Índices no Banco de Produção ---');
  const indexesBefore = prodDb.prepare("SELECT name FROM sqlite_master WHERE type='index'").all();
  console.log('Total de índices antes da migração:', indexesBefore.length);

  const indexStatements = [
    { name: 'idx_streams_type_status', sql: 'CREATE INDEX IF NOT EXISTS idx_streams_type_status ON streams(type, status);' },
    { name: 'idx_streams_category', sql: 'CREATE INDEX IF NOT EXISTS idx_streams_category ON streams(category_id);' },
    { name: 'idx_streams_name', sql: 'CREATE INDEX IF NOT EXISTS idx_streams_name ON streams(name);' },
    { name: 'idx_episodes_series', sql: 'CREATE INDEX IF NOT EXISTS idx_episodes_series ON series_episodes(series_id, season_num);' },
    { name: 'idx_user_progress_user', sql: 'CREATE INDEX IF NOT EXISTS idx_user_progress_user ON user_progress(user_id, stream_id);' },
    { name: 'idx_categories_type', sql: 'CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);' },
  ];

  for (const idx of indexStatements) {
    const t0 = Date.now();
    prodDb.exec(idx.sql);
    const dt = Date.now() - t0;
    console.log(`  ⚡ Índice [${idx.name}]: criado/verificado em ${dt}ms`);
  }

  const indexesAfter = prodDb.prepare("SELECT name FROM sqlite_master WHERE type='index'").all();
  console.log('Total de índices após migração:', indexesAfter.length);

  const prodIntegrity = prodDb.prepare('PRAGMA integrity_check;').get();
  console.log('Integridade do banco de produção pós-migração:', prodIntegrity);
  if (prodIntegrity.integrity_check !== 'ok') {
    throw new Error('FALHA CRÍTICA: Integridade do banco de produção corrompida pós-migração!');
  }
  console.log('✅ Integridade pós-migração validada: OK');

  // --- 5. ROTAÇÃO DE SEGREDOS E CREDENCIAIS ---
  console.log('\n--- 5. Rotação Segura de Credenciais e Segredos ---');

  // Gerar JWT_SECRET criptográfico forte de 64 caracteres
  const newJwtSecret = crypto.randomBytes(32).toString('hex');

  // Gerar novas senhas fortes
  const newAdminPassword = 'Adm_' + crypto.randomBytes(12).toString('base64url') + '!';
  const newClientPassword = 'Cli_' + crypto.randomBytes(12).toString('base64url') + '!';

  const adminHash = bcrypt.hashSync(newAdminPassword, 10);
  const clientHash = bcrypt.hashSync(newClientPassword, 10);

  // Atualizar no banco de produção
  prodDb.prepare(`
    UPDATE users 
    SET password_hash = ?, plain_password = ? 
    WHERE username = 'vagner'
  `).run(adminHash, newAdminPassword);

  prodDb.prepare(`
    UPDATE users 
    SET password_hash = ?, plain_password = ? 
    WHERE username = 'valdinei'
  `).run(clientHash, newClientPassword);

  // Fechar conexão com banco
  prodDb.close();
  console.log('✅ Credenciais dos usuários vagner e valdinei atualizadas no banco.');

  // Escrever novo server/.env em produção com permissões restritas (0600)
  const envContent = [
    `PORT=5000`,
    `NODE_ENV=production`,
    `JWT_SECRET=${newJwtSecret}`,
    `ADMIN_PASSWORD=${newAdminPassword}`,
    `CLIENT_PASSWORD=${newClientPassword}`,
    `CORS_ORIGIN=https://iptv.vsai.com.br`,
    ``
  ].join('\n');

  fs.writeFileSync(PROD_ENV_PATH, envContent, { mode: 0o600 });
  console.log(`✅ Arquivo .env de produção gravado em: ${PROD_ENV_PATH} (chmod 600)`);

  // Atualizar ecosystem.config.js sem nenhum segredo hardcoded
  const cleanEcosystem = `module.exports = {
  apps: [
    {
      name: 'vsaiptv-backend',
      script: 'src/server.js',
      cwd: './server',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      }
    }
  ]
};
`;
  fs.writeFileSync(path.join(PROD_DIR, 'ecosystem.config.js'), cleanEcosystem);
  console.log('✅ Arquivo ecosystem.config.js sanitizado (sem segredos)');

  // Salvar credenciais para smoke test em arquivo local temporário isolado
  const secretsForSmokeTestPath = '/home/vsai/.smoke_credentials_fase4.json';
  fs.writeFileSync(secretsForSmokeTestPath, JSON.stringify({
    username_admin: 'vagner',
    password_admin: newAdminPassword,
    username_client: 'valdinei',
    password_client: newClientPassword,
    timestamp: new Date().toISOString()
  }, null, 2), { mode: 0o600 });

  // Confirmação de status (REGRA: NUNCA EXIBIR VALOR)
  console.log('\n--- Status de Configuração de Segredos ---');
  console.log('JWT_SECRET: CONFIGURADO');
  console.log('ADMIN_PASSWORD: CONFIGURADO');
  console.log('CLIENT_PASSWORD: CONFIGURADO');
  console.log('Credenciais salvas em cofre isolado de teste em:', secretsForSmokeTestPath);

  console.log('\n====================================================');
  console.log('✨ ETAPA DE PRÉ-DEPLOY E MIGRAÇÃO CONCLUÍDA COM SUCESSO');
  console.log('====================================================\n');
}

main().catch(err => {
  console.error('\n❌ ERRO NO DEPLOY FASE 4:', err.message);
  process.exit(1);
});
