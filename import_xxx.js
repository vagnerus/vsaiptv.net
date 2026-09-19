/**
 * Importa a lista XXX para o catálogo.
 *
 * Fontes (todas automáticas):
 *  - Pasta local list/XXX (recursiva, arquivos .m3u/.m3u8)
 *  - http://adultiptv.net/chs.m3u
 *  - https://xc.adultiptv.net/get.php?username=adultiptv&password=adultiptv&type=m3u
 *
 * Uso:
 *   node import_xxx.js             -> importa de verdade
 *   node import_xxx.js --dry-run   -> apenas simula (não grava)
 *   node import_xxx.js --url=http://outra/lista.m3u
 */
const {
  importXxxSources,
  collectLocalM3UFiles,
  defaultLocalDir,
  countXxxCatalog,
} = require('./server/src/services/xxxImporter');

(async () => {
  const dryRun = process.argv.includes('--dry-run');
  const extraUrls = process.argv
    .filter((a) => a.startsWith('--url='))
    .map((a) => a.slice('--url='.length).trim())
    .filter(Boolean);

  const localDir = defaultLocalDir();
  const { files, totalBytes } = collectLocalM3UFiles(localDir);

  console.log('====================================================');
  console.log('🔞 Importação XXX (conteúdo adulto)');
  console.log(`📁 Pasta local: ${localDir}`);
  console.log(`📄 Arquivos .m3u encontrados: ${files.length} (${(totalBytes / 1024).toFixed(1)} KB)`);
  files.forEach((f) => console.log(`   - ${f}`));
  if (extraUrls.length) console.log(`🌐 URLs extras: ${extraUrls.join(', ')}`);
  console.log(`🧪 Modo dry-run: ${dryRun ? 'SIM' : 'não'}`);
  console.log('====================================================');

  try {
    const report = await importXxxSources({ extraUrls, dryRun });
    console.log(JSON.stringify(report, null, 2));

    if (!report.ok) {
      console.error('❌ Falha na importação:', report.error);
      process.exitCode = 1;
      return;
    }

    console.log(`✅ Total de itens XXX no catálogo agora: ${countXxxCatalog()}`);
  } catch (err) {
    console.error('❌ Erro inesperado na importação XXX:', err);
    process.exitCode = 1;
  }
})();