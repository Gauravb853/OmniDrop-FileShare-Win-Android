// server/sse.js - Real-Time Server-Sent Events broker
const crypto = require('node:crypto');

class SSEBroker {
  constructor() {
    this.clients = new Map(); // clientId -> { res, peerInfo, lastSeen }
  }

  handleConnection(req, res, initialPeerInfo = {}) {
    const clientId = initialPeerInfo.clientId || crypto.randomUUID();

    // Standard SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // For proxies
      'Access-Control-Allow-Origin': '*',
    });

    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', clientId })}\n\n`);

    const client = {
      id: clientId,
      res,
      peerInfo: {
        id: clientId,
        name: initialPeerInfo.name || 'Unknown Device',
        type: initialPeerInfo.type || 'browser',
        ip: req.socket.remoteAddress,
        userAgent: req.headers['user-agent'] || '',
        connectedAt: Date.now(),
      },
      lastSeen: Date.now(),
    };

    this.clients.set(clientId, client);

    // Keep-alive heartbeat every 15 seconds
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch (e) {
        clearInterval(heartbeat);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      this.clients.delete(clientId);
      this.broadcast('PEER_LEFT', { peerId: clientId });
      this.broadcastPeers();
    });

    // Notify others of new peer
    this.broadcastPeers();

    return clientId;
  }

  updatePeerInfo(clientId, info) {
    const client = this.clients.get(clientId);
    if (client) {
      client.peerInfo = { ...client.peerInfo, ...info };
      this.broadcastPeers();
    }
  }

  getPeers() {
    return Array.from(this.clients.values()).map(c => c.peerInfo);
  }

  broadcastPeers() {
    const peers = this.getPeers();
    this.broadcast('PEERS_UPDATE', { peers });
  }

  sendTo(clientId, type, payload) {
    const client = this.clients.get(clientId);
    if (client && client.res) {
      try {
        client.res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
        return true;
      } catch (e) {
        this.clients.delete(clientId);
        return false;
      }
    }
    return false;
  }

  broadcast(type, payload, excludeClientId = null) {
    const data = `data: ${JSON.stringify({ type, ...payload })}\n\n`;
    for (const [id, client] of this.clients.entries()) {
      if (excludeClientId && id === excludeClientId) continue;
      try {
        client.res.write(data);
      } catch (e) {
        this.clients.delete(id);
      }
    }
  }

  broadcastFiltered(type, payload, filterFn) {
    const data = `data: ${JSON.stringify({ type, ...payload })}\n\n`;
    for (const [id, client] of this.clients.entries()) {
      if (filterFn && !filterFn(id, client)) continue;
      try {
        client.res.write(data);
      } catch (e) {
        this.clients.delete(id);
      }
    }
  }
}

const sseBroker = new SSEBroker();
module.exports = sseBroker;
