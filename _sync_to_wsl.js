const { execSync } = require('child_process');

console.log('=== SINCRONIZANDO VSAIPTV COM O AMBIENTE DE PRODUÇÃO WSL ===');

function run(cmd) {
  console.log(`> ${cmd}`);
  const out = execSync(cmd, { stdio: 'pipe' }).toString();
  if (out.trim()) console.log(out.trim());
}

try {
  // 1. Pausa o backend no WSL para desanexar o banco de dados
  console.log('\n1. Parando vsaiptv-backend no WSL...');
  run('wsl -e bash -lc "pm2 stop vsaiptv-backend"');

  // 2. Limpa WALs antigos no WSL e copia o banco completo e organizado (iptv.db)
  console.log('\n2. Copiando banco completo e organizado (iptv.db) para o WSL...');
  run('wsl -e bash -lc "rm -f /home/vsai/vsaiptv/server/data/iptv.db-wal /home/vsai/vsaiptv/server/data/iptv.db-shm && cp -f /mnt/c/Users/Vagner/Desktop/IPTV/server/data/iptv.db /home/vsai/vsaiptv/server/data/iptv.db"');

  // 2b. Sincroniza as capas locais (imagens baixadas) para o WSL
  console.log('\n2b. Copiando capas locais (server/data/images e storage/images) para o WSL...');
  run('wsl -e bash -lc "mkdir -p /home/vsai/vsaiptv/server/data/images /home/vsai/vsaiptv/server/storage/images && cp -rf /mnt/c/Users/Vagner/Desktop/IPTV/server/data/images/* /home/vsai/vsaiptv/server/data/images/ && cp -rf /mnt/c/Users/Vagner/Desktop/IPTV/server/storage/images/* /home/vsai/vsaiptv/server/storage/images/"');

  // 3. Sincronizando backend server/src
  console.log('\n3. Atualizando server/src no WSL...');
  run('wsl -e bash -lc "cp -rf /mnt/c/Users/Vagner/Desktop/IPTV/server/src/* /home/vsai/vsaiptv/server/src/"');

  // 4. Sincronizando client/dist
  console.log('\n4. Atualizando client/dist (build de produção) no WSL...');
  run('wsl -e bash -lc "cp -rf /mnt/c/Users/Vagner/Desktop/IPTV/client/dist/* /home/vsai/vsaiptv/client/dist/"');

  // 5. Reiniciando backend no PM2
  console.log('\n5. Iniciando vsaiptv-backend no PM2...');
  run('wsl -e bash -lc "pm2 start vsaiptv-backend"');

  // 6. Validando status
  console.log('\n6. Verificando status dos serviços...');
  run('wsl -e bash -lc "pm2 list"');

  // 7. Testando integridade do banco no WSL
  console.log('\n7. Validando integridade e dados ativos no WSL...');
  run('wsl -e bash -lc "cd /home/vsai/vsaiptv/server && node -e \\"const D=require(\'./node_modules/better-sqlite3\'); const d=new D(\'/home/vsai/vsaiptv/server/data/iptv.db\'); console.log(\'Integrity check:\', d.pragma(\'integrity_check\')); console.log(\'Online streams:\', d.prepare(\'SELECT count(*) as c FROM streams WHERE status=\\\\\'online\\\\\'\').get().c); console.log(\'Channels with icons:\', d.prepare(\'SELECT count(*) as c FROM streams WHERE icon_url IS NOT NULL AND icon_url != \\\\\'\\\\\'\').get().c); d.close();\\""');

  console.log('\n🚀 DEPLOY E SINCRONIZAÇÃO CONCLUÍDOS COM SUCESSO TOTAL!');
} catch (err) {
  console.error('❌ Erro no sync para WSL:', err.message);
  if (err.stdout) console.log('STDOUT:', err.stdout.toString());
  if (err.stderr) console.error('STDERR:', err.stderr.toString());
  process.exit(1);
}
