// server/network.js - Network interface discovery & prioritization
const os = require('node:os');

function getNetworkInfo(preferredPort = 5050) {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const [name, netList] of Object.entries(interfaces)) {
    if (!netList) continue;
    for (const net of netList) {
      // Only IPv4, non-internal (not loopback)
      if (net.family !== 'IPv4' || net.internal) continue;

      const lowerName = name.toLowerCase();
      const addr = net.address;

      // Skip obviously useless virtual/tunnel addresses
      if (lowerName.includes('vethernet') || lowerName.includes('wsl') || lowerName.includes('hyper-v')) continue;
      if (addr.startsWith('172.') || addr.startsWith('169.254.')) continue; // WSL / APIPA

      let type = 'lan';
      if (lowerName.includes('wi-fi') || lowerName.includes('wifi') || lowerName.includes('wireless') || lowerName.includes('wlan')) {
        type = 'wifi';
      } else if (addr.startsWith('192.168.137.') || lowerName.includes('hotspot') || lowerName.includes('local area connection*')) {
        type = 'hotspot';
      } else if (lowerName.includes('ethernet') || lowerName.includes('eth') || lowerName.includes('lan')) {
        type = 'ethernet';
      }

      addresses.push({
        name,
        address: addr,
        type,
        url: `http://${addr}:${preferredPort}`,
      });
    }
  }

  // Sort: Wi-Fi first (phone connects via Wi-Fi), Hotspot second, Ethernet third, LAN last
  const priority = { wifi: 1, hotspot: 2, ethernet: 3, lan: 4, virtual: 99 };
  addresses.sort((a, b) => (priority[a.type] || 50) - (priority[b.type] || 50));

  // Determine primary IP — prefer Wi-Fi adapter first
  let primary = addresses[0];

  // If top-sorted adapter is not Wi-Fi, ensure an active Wi-Fi or Hotspot adapter is selected if present
  if (primary && primary.type !== 'wifi') {
    const wireless = addresses.find(a => a.type === 'wifi' || a.type === 'hotspot');
    if (wireless) primary = wireless;
  }

  if (!primary) {
    primary = {
      name: 'Loopback',
      address: '127.0.0.1',
      type: 'localhost',
      url: `http://localhost:${preferredPort}`,
    };
  }

  return {
    primary,
    all: addresses,
    port: preferredPort,
  };
}

module.exports = {
  getNetworkInfo,
};
