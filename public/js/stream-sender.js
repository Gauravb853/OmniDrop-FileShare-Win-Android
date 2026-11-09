// public/js/stream-sender.js - High-throughput streaming uploader for files of any size
class StreamSender {
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || 4 * 1024 * 1024; // 4MB chunks
    this.activeTransfers = new Map(); // transferId -> { isPaused, isCancelled }
  }

  // Format bytes to human readable format
  static formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(i >= 2 ? 2 : 1) + ' ' + sizes[i];
  }

  // Format seconds to mm:ss or hh:mm:ss
  static formatDuration(seconds) {
    if (!seconds || seconds <= 0 || !isFinite(seconds)) return '--:--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}h ${m < 10 ? '0' : ''}${m}m`;
    }
    return `${m < 10 ? '0' : ''}${m}m ${s < 10 ? '0' : ''}${s}s`;
  }

  // Initiate transfer session with server
  async initiateTransfer(senderName, files, targetId = null, senderId = null, isStaged = false, senderType = 'windows') {
    const fileMetadata = files.map(file => ({
      id: 'f_' + Math.random().toString(36).substring(2, 10),
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
    }));

    const direction = isStaged || senderType === 'windows' ? 'pc_to_phone' : 'phone_to_pc';

    const res = await fetch('/api/transfer/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId,
        senderName: senderName || 'Peer Device',
        targetId,
        files: fileMetadata,
        isStaged: !!isStaged,
        direction,
        senderType,
      }),
    });

    if (!res.ok) throw new Error('Transfer request failed');
    const data = await res.json();
    return {
      transferId: data.transferId,
      status: data.status,
      files: fileMetadata,
    };
  }

  // Stream a single file of any size (1MB to 100GB+) chunk-by-chunk
  async uploadFile(transferId, file, fileMeta, onProgress = () => {}, isStaged = false) {
    const totalBytes = file.size;
    const totalChunks = Math.max(1, Math.ceil(totalBytes / this.chunkSize));
    let chunkIndex = 0;
    let offset = 0;

    // Check for resumable progress from server
    try {
      const statusRes = await fetch(`/api/transfer/status/${transferId}/${fileMeta.id}`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.bytesReceived && statusData.bytesReceived < totalBytes) {
          offset = statusData.bytesReceived;
          chunkIndex = Math.floor(offset / this.chunkSize);
          console.log(`Resuming upload for ${file.name} from byte offset ${offset}`);
        }
      }
    } catch (e) {
      // Start from scratch if status check fails
    }

    const control = { isPaused: false, isCancelled: false };
    this.activeTransfers.set(transferId, control);

    let lastTime = performance.now();
    let lastBytes = offset;
    let smoothedSpeed = 0;

    while (offset < totalBytes && !control.isCancelled) {
      while (control.isPaused) {
        await new Promise(r => setTimeout(r, 500));
        if (control.isCancelled) break;
      }
      if (control.isCancelled) break;

      const chunkEnd = Math.min(offset + this.chunkSize, totalBytes);
      const chunkBlob = file.slice(offset, chunkEnd);
      const isLast = chunkEnd >= totalBytes;

      // Upload chunk with retry mechanism
      let retries = 0;
      let success = false;
      while (!success && retries < 4) {
        try {
          const res = await fetch('/api/transfer/chunk', {
            method: 'POST',
            headers: {
              'x-transfer-id': transferId,
              'x-file-id': fileMeta.id,
              'x-file-name': encodeURIComponent(file.name),
              'x-file-size': totalBytes.toString(),
              'x-chunk-index': chunkIndex.toString(),
              'x-total-chunks': totalChunks.toString(),
              'x-chunk-offset': offset.toString(),
              'x-is-last': isLast ? 'true' : 'false',
              'x-is-staged': isStaged ? 'true' : 'false',
              'Content-Type': 'application/octet-stream',
            },
            body: chunkBlob,
          });

          if (!res.ok) throw new Error(`Chunk ${chunkIndex} HTTP ${res.status}`);
          success = true;
        } catch (err) {
          retries++;
          console.warn(`Chunk ${chunkIndex} upload error, retry ${retries}/3:`, err.message);
          if (retries >= 3) throw err;
          await new Promise(r => setTimeout(r, 1000 * retries));
        }
      }

      offset = chunkEnd;
      chunkIndex++;

      // Progress & Speed calculations
      const now = performance.now();
      const timeDelta = (now - lastTime) / 1000;
      if (timeDelta >= 0.25 || isLast) {
        const bytesDelta = offset - lastBytes;
        const instantSpeed = bytesDelta / timeDelta;
        smoothedSpeed = smoothedSpeed === 0 ? instantSpeed : smoothedSpeed * 0.7 + instantSpeed * 0.3;

        const remainingBytes = totalBytes - offset;
        const eta = smoothedSpeed > 0 ? Math.round(remainingBytes / smoothedSpeed) : 0;

        onProgress({
          fileId: fileMeta.id,
          fileName: file.name,
          bytesReceived: offset,
          totalBytes,
          percent: Math.min(100, (offset / totalBytes) * 100).toFixed(1),
          speed: smoothedSpeed,
          speedStr: StreamSender.formatBytes(smoothedSpeed) + '/s',
          eta,
          etaStr: StreamSender.formatDuration(eta),
          chunkIndex,
          totalChunks,
        });

        lastTime = now;
        lastBytes = offset;
      }
    }

    this.activeTransfers.delete(transferId);
    return { success: !control.isCancelled, offset };
  }

  pause(transferId) {
    const c = this.activeTransfers.get(transferId);
    if (c) c.isPaused = true;
  }

  resume(transferId) {
    const c = this.activeTransfers.get(transferId);
    if (c) c.isPaused = false;
  }

  cancel(transferId) {
    const c = this.activeTransfers.get(transferId);
    if (c) {
      c.isCancelled = true;
      c.isPaused = false;
    }
  }
}

window.StreamSender = StreamSender;
