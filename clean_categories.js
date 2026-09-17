const Database = require('./server/node_modules/better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'server/data/iptv.db'));

console.log('🧹 Limpando e aperfeiçoando nomes das categorias...');

const renames = [
  ['Religiãosos', 'Religiosos'],
  ['SóporTV', 'SporTV & Esportes'],
  ['ESóPN', 'ESPN Internacional & BR'],
  ['Filmes e Sóéries', 'Cinema & Filmes BR'],
  ['Regionais Globos Sóudeste', 'Regionais Globo Sudeste'],
  ['Regionais Globos Sóul', 'Regionais Globo Sul'],
  ['Filmes | Ficcao', 'Filmes | Ficção Científica'],
  ['Filmes | Família', 'Filmes | Família & Animação'],
  ['Filmes | Guerra', 'Filmes | Guerra & História'],
  ['Filmes | Crime', 'Filmes | Policial & Crime'],
];

for (const [oldName, newName] of renames) {
  db.prepare('UPDATE categories SET name = ? WHERE name = ?').run(newName, oldName);
  console.log(` ✅ ${oldName} -> ${newName}`);
}

console.log('✨ Categorias aprimoradas com sucesso!');
