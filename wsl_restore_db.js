const fs = require('fs');
const { execSync } = require('child_process');

const windowsDb = 'server/data/iptv.db';
const wslDbPath = '/home/vsai/vsaiptv/server/data/iptv.db';

// 1. Verificar banco do Windows
console.log('=== BANCO DO WINDOWS ===');
const stat = fs.statSync(windowsDb);
console.log(`Tamanho: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);

// 2. Copiar para WSL
console.log('\n=== RESTAURANDO NO WSL ===');
try {
  fs.copyFileSync(windowsDb, wslDbPath);
  console.log('Banco copiado com sucesso');
  
  // Remover WAL/SHM corrompidos
  ['-shm', '-wal'].forEach(suffix => {
    const p = wslDbPath + suffix;
    if (fs.existsSync(p.replace(/^\//, ''))) {
      fs.unlinkSync(p.replace(/^\//, ''));  // no Windows path
    }
  });
  console.log('WAL/SHM removidos');
} catch (e) {
  console.log('Erro:', e.message);
  process.exit(1);
}

// 3. Verificar no WSL
console.log('\n=== VERIFICAÇÃO WSL ===');
try {
  const out = execSync(
    `wsl -e bash -lc 'cd /home/vsai/vsaiptv && node -e "const D=require(\\\"better-sqlite3\\\"); const d=new D(\\\"server/data/iptv.db\\\"); console.log(d.prepare(\\\"SELECT COUNT(*) FROM streams\\\").get()[\\\"COUNT(*)\\\"]+\\\" streams, \\\",\\\"+d.prepare(\\\"SELECT COUNT(*) FROM categories\\\").get()[\\\"COUNT(*)\\\"]+\\\" categorias\\\"); d.close();"'`,
    { encoding: 'utf8', timeout: 30000 }
  );
  console.log(out.trim());
} catch (e) {
  console.log('Erro WSL:', e.message);
}

// 4. Reiniciar PM2
console.log('\n=== REINICIANDO BACKEND ===');
try {
  execSync('wsl -e bash -lc "cd /home/vsai/vsaiptv && pm2 restart vsaiptv-backend"', { timeout: 30000 });
  console.log('Backend reiniciado');
} catch (e) {
  console.log('Erro ao reiniciar:', e.message);
}
