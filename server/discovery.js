// server/discovery.js - UDP Broadcast & Multicast auto-discovery service
const dgram = require('node:dgram');
const config = require('./config.js');
const network = require('./network.js');
const sse = require('./sse.js');

class DiscoveryService {
  constructor() {
    this.socket = null;
    this.broadcastTimer = null;
    this.discoveredDevices = new Map(); // ip:port -> device
  }

  start() {
    try {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.socket.on('error', err => {
        console.warn('UDP Discovery socket error (non-fatal):', err.message);
      });

      this.socket.on('message', (msg, rinfo) => {
        try {
          const data = JSON.parse(msg.toString('utf8'));
          if (data && data.app === 'omnidrop') {
            const key = `${rinfo.address}:${data.port || 5050}`;
            const isNew = !this.discoveredDevices.has(key);

            const device = {
              id: key,
              name: data.name || 'OmniDrop Device',
              ip: rinfo.address,
              port: data.port || 5050,
              type: data.type || 'unknown',
              url: `http://${rinfo.address}:${data.port || 5050}`,
              lastSeen: Date.now(),
            };

            this.discoveredDevices.set(key, device);

            if (isNew) {
              sse.broadcast('DISCOVERED_PEER', device);
            }
          }
        } catch (e) {
          // Ignore invalid UDP packets
        }
      });

      this.socket.bind(config.udpPort, () => {
        try {
          this.socket.setBroadcast(true);
        } catch (e) {}

        // Periodically announce self to the local network
        this.broadcastTimer = setInterval(() => {
          this.announceSelf();
          this.cleanupStaleDevices();
        }, 3000);

        this.announceSelf();
      });
    } catch (err) {
      console.warn('Could not initialize UDP discovery:', err.message);
    }
  }

  announceSelf() {
    if (!this.socket) return;
    const netInfo = network.getNetworkInfo(config.port);
    const packet = Buffer.from(
      JSON.stringify({
        app: 'omnidrop',
        version: '1.0',
        name: config.deviceName,
        port: config.port,
        type: config.deviceType,
        ips: netInfo.all.map(n => n.address),
      })
    );

    // Send broadcast to subnet
    try {
      this.socket.send(packet, 0, packet.length, config.udpPort, '255.255.255.255');
    } catch (e) {}
  }

  cleanupStaleDevices() {
    const now = Date.now();
    for (const [key, dev] of this.discoveredDevices.entries()) {
      if (now - dev.lastSeen > 12000) { // 12 seconds timeout
        this.discoveredDevices.delete(key);
        sse.broadcast('DISCOVERED_PEER_LEFT', { id: key });
      }
    }
  }

  getDiscoveredDevices() {
    return Array.from(this.discoveredDevices.values());
  }

  stop() {
    if (this.broadcastTimer) clearInterval(this.broadcastTimer);
    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {}
    }
  }
}

const discoveryService = new DiscoveryService();
module.exports = discoveryService;
