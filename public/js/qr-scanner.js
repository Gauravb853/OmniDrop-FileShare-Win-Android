// public/js/qr-scanner.js - In-browser Camera QR Code Scanner
class QRScanner {
  constructor(videoElement, onScanCallback) {
    this.video = videoElement;
    this.onScan = onScanCallback;
    this.stream = null;
    this.isScanning = false;
    this.detector = null;
    this.animationFrameId = null;

    if ('BarcodeDetector' in window) {
      try {
        this.detector = new BarcodeDetector({ formats: ['qr_code'] });
      } catch (e) {
        this.detector = null;
      }
    }
  }

  async start() {
    if (this.isScanning) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      this.video.srcObject = this.stream;
      await this.video.play();
      this.isScanning = true;
      this.scanLoop();
    } catch (err) {
      console.error('Camera access error:', err);
      throw err;
    }
  }

  async scanLoop() {
    if (!this.isScanning) return;

    if (this.detector && this.video.readyState >= 2) {
      try {
        const barcodes = await this.detector.detect(this.video);
        if (barcodes.length > 0) {
          const rawValue = barcodes[0].rawValue;
          if (rawValue) {
            this.stop();
            if (this.onScan) this.onScan(rawValue);
            return;
          }
        }
      } catch (e) {}
    }

    this.animationFrameId = requestAnimationFrame(() => this.scanLoop());
  }

  stop() {
    this.isScanning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
    }
  }
}

window.QRScanner = QRScanner;
