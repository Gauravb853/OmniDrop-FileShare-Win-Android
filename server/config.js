// server/config.js - Central configuration for OmniDrop
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

// Primary download directory in workspace or user downloads
const workspaceDownloads = path.join(process.cwd(), 'downloads');
const userDownloads = path.join(os.homedir(), 'Downloads', 'OmniDrop');

let targetDownloadsDir = workspaceDownloads;
try {
  if (!fs.existsSync(userDownloads)) {
    fs.mkdirSync(userDownloads, { recursive: true });
  }
  targetDownloadsDir = userDownloads;
} catch (e) {
  // If user folder has permission restrictions, use workspace downloads directory
  try {
    if (!fs.existsSync(workspaceDownloads)) {
      fs.mkdirSync(workspaceDownloads, { recursive: true });
    }
    targetDownloadsDir = workspaceDownloads;
  } catch (err) {
    targetDownloadsDir = path.join(os.tmpdir(), 'omnidrop-downloads');
    fs.mkdirSync(targetDownloadsDir, { recursive: true });
  }
}

const tempDir = path.join(os.tmpdir(), 'omnidrop-temp');
try {
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
} catch (e) {}

const config = {
  port: parseInt(process.env.PORT || '5050', 10),
  udpPort: 53317,
  hostname: os.hostname(),
  deviceName: `PC-${os.hostname().replace(/[^a-zA-Z0-9_-]/g, '')}`,
  deviceType: 'windows',
  downloadsDir: targetDownloadsDir,
  tempDir,
  chunkSize: 8 * 1024 * 1024, // 8MB per chunk
  autoAccept: false,
};

module.exports = config;
