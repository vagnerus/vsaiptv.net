/**
 * scripts/build_tv_packages.js — VSAIPTV Smart TV Multi-Platform Packaging
 * Compila e empacota os artefatos para Web, Smart TV Genérica, Samsung Tizen e LG webOS.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const clientDir = path.join(rootDir, 'client');
const clientDist = path.join(clientDir, 'dist');
const distTarget = path.join(rootDir, 'dist');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log('===> 1. Compilando o Frontend com Vite...');
execSync('npm run build', { cwd: clientDir, stdio: 'inherit' });

console.log('===> 2. Preparando estrutura de diretórios em dist/...');
const targets = ['web', 'tv', 'tizen', 'webos', 'reports'];
targets.forEach((target) => {
  const dir = path.join(distTarget, target);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

console.log('===> 3. Gerando pacote Web & Generic Smart TV...');
copyRecursiveSync(clientDist, path.join(distTarget, 'web'));
copyRecursiveSync(clientDist, path.join(distTarget, 'tv'));

console.log('===> 4. Gerando pacote Samsung Tizen...');
copyRecursiveSync(clientDist, path.join(distTarget, 'tizen'));
if (fs.existsSync(path.join(clientDir, 'tizen', 'config.xml'))) {
  fs.copyFileSync(
    path.join(clientDir, 'tizen', 'config.xml'),
    path.join(distTarget, 'tizen', 'config.xml')
  );
}

console.log('===> 5. Gerando pacote LG webOS...');
copyRecursiveSync(clientDist, path.join(distTarget, 'webos'));
if (fs.existsSync(path.join(clientDir, 'webos', 'appinfo.json'))) {
  fs.copyFileSync(
    path.join(clientDir, 'webos', 'appinfo.json'),
    path.join(distTarget, 'webos', 'appinfo.json')
  );
}

// Relatório dos pacotes gerados
const summary = {
  timestamp: new Date().toISOString(),
  targets: {
    web: { path: 'dist/web', status: 'READY' },
    tv: { path: 'dist/tv', status: 'READY' },
    tizen: { path: 'dist/tizen', status: 'READY_FOR_PACKAGING', command: 'tizen package -t wgt -- dist/tizen' },
    webos: { path: 'dist/webos', status: 'READY_FOR_PACKAGING', command: 'ares-package dist/webos' }
  }
};

fs.writeFileSync(
  path.join(distTarget, 'reports', 'build-summary.json'),
  JSON.stringify(summary, null, 2)
);

console.log('\n============================================================');
console.log('SUCESSO: Pacotes distribuíveis de Smart TV gerados em dist/');
console.log(' - dist/web/     -> Aplicação Web padrão');
console.log(' - dist/tv/      -> Versão otimizada Smart TV Genérica');
console.log(' - dist/tizen/   -> Pacote Samsung Tizen (com config.xml)');
console.log(' - dist/webos/   -> Pacote LG webOS (com appinfo.json)');
console.log(' - dist/reports/ -> Sumário de compilação');
console.log('============================================================\n');
