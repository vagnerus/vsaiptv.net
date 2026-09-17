// VSAIPTV WSL-LAN Bridge
// Automatically relays external Wi-Fi / TV Box traffic to the WSL2 PM2 backend
const net = require('net');
const os = require('os');

function getLocalIp() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        if (!net.address.startsWith('169.254.') && !net.address.startsWith('172.')) {
          candidates.push(net.address);
        }
      }
    }
  }
  return candidates[0] || '192.168.1.108';
}

const localIp = getLocalIp();
const PORT = 5000;
const TARGET_PORT = 5000;
const TARGET_HOST = '127.0.0.1';

const server = net.createServer(clientSocket => {
  const targetSocket = net.connect(TARGET_PORT, TARGET_HOST, () => {
    clientSocket.pipe(targetSocket);
    targetSocket.pipe(clientSocket);
  });

  clientSocket.on('error', () => targetSocket.destroy());
  targetSocket.on('error', () => clientSocket.destroy());
});

server.listen(PORT, localIp, () => {
  console.log(`====================================================`);
  console.log(`🌐 VSAIPTV WSL LAN Bridge Active`);
  console.log(`📡 Relaying http://${localIp}:${PORT} -> WSL 127.0.0.1:${TARGET_PORT}`);
  console.log(`📱 TV Box & Mobile devices can connect to: http://${localIp}:${PORT}`);
  console.log(`====================================================`);
});
