const Database = require("./server/node_modules/better-sqlite3");
const db = new Database("./server/data/iptv.db");

// Verificar novelas existentes
const novelas = db.prepare("SELECT name FROM streams WHERE name LIKE '%Bang Bang%' OR name LIKE '%Rebeldes%' OR name LIKE '%novela%' OR name LIKE '%Novela%'").all();
console.log("=== Novelas existentes ===");
console.log(JSON.stringify(novelas, null, 2));

// Verificar categorias de esportes
const sportsCats = db.prepare("SELECT * FROM categories WHERE name LIKE '%port%' OR name LIKE '%Sport%' OR name LIKE '%Esporte%'").all();
console.log("\n=== Categorias de esportes ===");
console.log(JSON.stringify(sportsCats, null, 2));

// Contar conteúdo atual
const counts = db.prepare("SELECT type, status, COUNT(*) as total FROM streams GROUP BY type, status").all();
console.log("\n=== Contagem atual ===");
console.log(JSON.stringify(counts, null, 2));

// Verificar usuário valdinei
const user = db.prepare("SELECT * FROM users WHERE username = 'valdinei'").get();
console.log("\n=== Usuário valdinei ===");
console.log(JSON.stringify(user, null, 2));

db.close();