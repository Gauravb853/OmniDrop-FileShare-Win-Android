// public/js/bluetooth.js - Bluetooth Integration & Pairing
class BluetoothManager {
  constructor() {
    this.isSupported = 'bluetooth' in navigator;
    this.connectedDevice = null;
  }

  // Scan for nearby Bluetooth devices via Web Bluetooth API
  async requestDevice() {
    if (!this.isSupported) {
      throw new Error('Web Bluetooth is not supported in this browser. Please use Chrome or Edge.');
    }

    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['generic_access'],
      });

      this.connectedDevice = device;
      return {
        id: device.id,
        name: device.name || 'Unnamed Bluetooth Device',
      };
    } catch (err) {
      if (err.name === 'NotFoundError') {
        return null; // User cancelled prompt
      }
      throw err;
    }
  }

  // Launch Windows built-in Bluetooth File Transfer (fsquirt)
  async launchWindowsBluetoothTransfer() {
    const res = await fetch('/api/system/launch-bluetooth', { method: 'POST' });
    return await res.json();
  }

  // Open Windows Bluetooth settings
  async openBluetoothSettings() {
    const res = await fetch('/api/system/open-bluetooth-settings', { method: 'POST' });
    return await res.json();
  }

  // Open Windows Mobile Hotspot settings
  async openHotspotSettings() {
    const res = await fetch('/api/system/open-hotspot', { method: 'POST' });
    return await res.json();
  }
}

window.BluetoothManager = BluetoothManager;
