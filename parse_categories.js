const fs = require('fs');

function parseM3u(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const categories = {};
  let currentInfo = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      const nameMatch = line.match(/,(.*)$/);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const tvgIdMatch = line.match(/tvg-id="([^"]*)"/i);

      let group = (groupMatch && groupMatch[1].trim()) || 'Geral';
      // Clean up encoding artifacts if any
      group = group.replace(/SǸries/g, 'Séries')
                   .replace(/Documentǭrios/g, 'Documentários')
                   .replace(/NotǱcias/g, 'Notícias')
                   .replace(/MǦsica/g, 'Música');

      currentInfo = {
        name: nameMatch ? nameMatch[1].trim() : 'Canal',
        group,
        logo: logoMatch ? logoMatch[1] : '',
        tvgId: tvgIdMatch ? tvgIdMatch[1] : '',
      };
    } else if (line.length > 0 && !line.startsWith('#') && currentInfo) {
      if (!categories[currentInfo.group]) {
        categories[currentInfo.group] = [];
      }
      categories[currentInfo.group].push({
        ...currentInfo,
        url: line,
      });
      currentInfo = null;
    }
  }

  console.log(`\nArquivo: ${filePath}`);
  console.log('Categorias encontradas:');
  for (const [cat, items] of Object.entries(categories)) {
    console.log(` - ${cat}: ${items.length} canais`);
  }
}

parseM3u('repo_content/CanaisBR03.m3u8');
