// server/system.js - Windows native integrations (Explorer, Bluetooth, Hotspot)
const { exec, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config.js');

function openDownloadsFolder(targetPath = null) {
  const pathToOpen = targetPath || config.downloadsDir;
  if (!fs.existsSync(pathToOpen)) {
    fs.mkdirSync(pathToOpen, { recursive: true });
  }

  if (process.platform === 'win32') {
    // If it's a file, select it in Explorer; if it's a folder, open it
    if (fs.existsSync(pathToOpen) && fs.statSync(pathToOpen).isFile()) {
      exec(`explorer.exe /select,"${pathToOpen}"`);
    } else {
      exec(`explorer.exe "${pathToOpen}"`);
    }
    return true;
  }
  return false;
}

function launchBluetoothTransfer() {
  if (process.platform === 'win32') {
    const fsquirtPath = 'C:\\Windows\\System32\\fsquirt.exe';
    if (fs.existsSync(fsquirtPath)) {
      // Detached spawn so it runs independently
      const proc = spawn(fsquirtPath, [], {
        detached: true,
        stdio: 'ignore',
      });
      proc.unref();
      return { success: true, message: 'Windows Bluetooth Transfer Wizard launched.' };
    }
  }
  return { success: false, message: 'fsquirt.exe not found or non-Windows system.' };
}

function openHotspotSettings() {
  if (process.platform === 'win32') {
    exec('start ms-settings:network-mobilehotspot');
    return { success: true };
  }
  return { success: false, message: 'Only supported on Windows.' };
}

function openBluetoothSettings() {
  if (process.platform === 'win32') {
    exec('start ms-settings:bluetooth');
    return { success: true };
  }
  return { success: false, message: 'Only supported on Windows.' };
}

function setDownloadsDirectory(newPath) {
  if (!newPath || typeof newPath !== 'string') return false;
  try {
    if (!fs.existsSync(newPath)) {
      fs.mkdirSync(newPath, { recursive: true });
    }
    config.downloadsDir = newPath;
    return true;
  } catch (err) {
    console.error('Failed to change downloads dir:', err);
    return false;
  }
}

module.exports = {
  openDownloadsFolder,
  launchBluetoothTransfer,
  openHotspotSettings,
  openBluetoothSettings,
  setDownloadsDirectory,
};
