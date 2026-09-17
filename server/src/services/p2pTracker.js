const WebSocket = require('ws');

class P2PTracker {
  constructor(server) {
    this.wss = new WebSocket.Server({ server, path: '/tracker' });
    this.swarms = new Map(); // streamId -> Map(peerId -> wsClient)
    this.clients = new Map(); // wsClient -> { peerId, streamId }
    this.stats = {
      totalSwarmPeers: 0,
      totalChunksShared: 0,
      totalBytesP2P: 0,
    };

    this.init();
  }

  init() {
    this.wss.on('connection', (ws) => {
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleMessage(ws, data);
        } catch (err) {
          console.error('P2P Tracker message error:', err.message);
        }
      });

      ws.on('close', () => {
        this.leaveSwarm(ws);
      });
    });

    // Keepalive ping interval
    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);
  }

  handleMessage(ws, data) {
    switch (data.action) {
      case 'join': {
        const { streamId, peerId } = data;
        if (!streamId || !peerId) return;

        // Leave any prior swarm
        this.leaveSwarm(ws);

        if (!this.swarms.has(streamId)) {
          this.swarms.set(streamId, new Map());
        }

        const swarm = this.swarms.get(streamId);

        // Notify existing peers in this swarm about the new peer
        swarm.forEach((peerWs, existingPeerId) => {
          if (peerWs.readyState === WebSocket.OPEN) {
            peerWs.send(JSON.stringify({
              action: 'peer-joined',
              peerId,
              streamId,
            }));
          }
        });

        // Register peer
        swarm.set(peerId, ws);
        this.clients.set(ws, { peerId, streamId });

        // Send list of existing peers in this stream back to the newly joined peer
        const existingPeersList = Array.from(swarm.keys()).filter(id => id !== peerId);
        ws.send(JSON.stringify({
          action: 'joined',
          streamId,
          peerId,
          peers: existingPeersList,
          swarmSize: swarm.size,
        }));
        break;
      }

      case 'signal': {
        // Forward WebRTC SDP offer, answer, or ICE candidate to target peer
        const { toPeerId, signal } = data;
        const clientInfo = this.clients.get(ws);
        if (!clientInfo || !toPeerId) return;

        const swarm = this.swarms.get(clientInfo.streamId);
        if (swarm && swarm.has(toPeerId)) {
          const targetWs = swarm.get(toPeerId);
          if (targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({
              action: 'signal',
              fromPeerId: clientInfo.peerId,
              signal,
            }));
          }
        }
        break;
      }

      case 'report-p2p-stat': {
        // Collect real-time telemetry from client player on P2P bytes/chunks
        if (data.bytesDownloadedP2P) {
          this.stats.totalBytesP2P += data.bytesDownloadedP2P;
          this.stats.totalChunksShared += (data.chunksP2P || 1);
        }
        break;
      }

      case 'leave': {
        this.leaveSwarm(ws);
        break;
      }
    }
  }

  leaveSwarm(ws) {
    const clientInfo = this.clients.get(ws);
    if (!clientInfo) return;

    const { streamId, peerId } = clientInfo;
    const swarm = this.swarms.get(streamId);
    if (swarm) {
      swarm.delete(peerId);
      // Notify remaining peers
      swarm.forEach((peerWs) => {
        if (peerWs.readyState === WebSocket.OPEN) {
          peerWs.send(JSON.stringify({
            action: 'peer-left',
            peerId,
            streamId,
            swarmSize: swarm.size,
          }));
        }
      });

      if (swarm.size === 0) {
        this.swarms.delete(streamId);
      }
    }

    this.clients.delete(ws);
  }

  getSwarmStats() {
    let totalPeers = 0;
    const swarmDetails = [];

    this.swarms.forEach((peersMap, streamId) => {
      totalPeers += peersMap.size;
      swarmDetails.push({
        streamId,
        peersCount: peersMap.size,
      });
    });

    return {
      activeSwarms: this.swarms.size,
      totalConnectedPeers: totalPeers,
      swarmDetails,
      totalBytesP2P: this.stats.totalBytesP2P,
      totalChunksShared: this.stats.totalChunksShared,
    };
  }
}

module.exports = P2PTracker;
