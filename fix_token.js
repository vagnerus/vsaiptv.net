const fs = require('fs');
const f = 'client/src/components/VideoPlayer.jsx';
let c = fs.readFileSync(f, 'utf8');
c = c.replace(/localStorage\.getItem\('token'\)/g, "localStorage.getItem('iptv_token')");
fs.writeFileSync(f, c);
console.log('✅ Done - replaced token -> iptv_token');