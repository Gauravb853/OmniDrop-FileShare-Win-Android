// public/js/stream-receiver.js - Real-time SSE event broker, Audio feedback & WakeLock
class StreamReceiver {
  constructor(options = {}) {
    this.eventSource = null;
    this.handlers = new Map();
    this.audioCtx = null;
    this.wakeLock = null;
    this.clientId = null;
    this.initAudio();
  }

  initAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    } catch (e) {}
  }

  // Play synthesized notification sound without needing external MP3s
  playSound(type = 'success') {
    if (!this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      const now = this.audioCtx.currentTime;
      if (type === 'success') {
        // High-low gentle chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'alert') {
        // Double pulse for incoming file
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now); // C5
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      }
    } catch (e) {}
  }

  // Keep screen awake during large transfers (crucial on Android!)
  async acquireWakeLock() {
    try {
      if ('wakeLock' in navigator && !this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
        });
      }
    } catch (e) {}
  }

  releaseWakeLock() {
    if (this.wakeLock) {
      try {
        this.wakeLock.release();
      } catch (e) {}
      this.wakeLock = null;
    }
  }

  connect(deviceName, deviceType, clientId = null) {
    if (this.eventSource) {
      this.eventSource.close();
    }

    const params = new URLSearchParams({
      id: clientId || '',
      name: deviceName || 'Device',
      type: deviceType || 'client',
    });

    this.eventSource = new EventSource(`/api/events?${params.toString()}`);

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'CONNECTED') {
          this.clientId = data.clientId;
        }
        this.emit(data.type, data);
      } catch (e) {
        // Heartbeat or malformed comment
      }
    };

    this.eventSource.onerror = () => {
      this.emit('DISCONNECTED', {});
    };
  }

  on(eventType, callback) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType).push(callback);
  }

  off(eventType, callback) {
    if (!this.handlers.has(eventType)) return;
    const list = this.handlers.get(eventType);
    const idx = list.indexOf(callback);
    if (idx !== -1) {
      list.splice(idx, 1);
    }
  }

  emit(eventType, data) {
    const callbacks = this.handlers.get(eventType) || [];
    callbacks.forEach(cb => {
      try {
        cb(data);
      } catch (e) {
        console.error(`Error in ${eventType} handler:`, e);
      }
    });

    // Also notify wildcard listeners
    const wildcard = this.handlers.get('*') || [];
    wildcard.forEach(cb => cb(eventType, data));
  }
}

window.StreamReceiver = StreamReceiver;
