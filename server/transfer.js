// server/transfer.js - Production-Grade Streaming & Resumable Transfer Engine
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('./config.js');
const sse = require('./sse.js');

// Senior-grade filename sanitizer (cross-platform safe)
function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') return 'unnamed_file';
  // Strip null bytes
  name = name.replace(/\0/g, '');
  // Extract basename to prevent directory traversal
  name = path.basename(name);
  // Replace Windows illegal characters: < > : " / \ | ? *
  name = name.replace(/[<>:"/\\|?*]/g, '_');
  // Strip leading/trailing dots and spaces
  name = name.replace(/^[. ]+|[. ]+$/g, '');
  // Guard against Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
  const reservedRegex = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
  if (reservedRegex.test(name)) {
    name = '_' + name;
  }
  if (!name) name = 'unnamed_file';
  // Truncate if exceeds safe filesystem limits (preserve extension)
  if (name.length > 240) {
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    name = base.slice(0, 240 - ext.length) + ext;
  }
  return name;
}

class TransferManager {
  constructor() {
    this.activeTransfers = new Map(); // transferId -> transfer object
    this.stagedFiles = new Map();     // fileId -> staged file metadata
    this.history = [];
    this.historyFile = path.join(config.downloadsDir, '.history.json');
    this.loadHistory();
  }

  loadHistory() {
    try {
      if (fs.existsSync(this.historyFile)) {
        const raw = fs.readFileSync(this.historyFile, 'utf8');
        this.history = JSON.parse(raw);
        if (!Array.isArray(this.history)) this.history = [];
      }
    } catch (e) {
      this.history = [];
    }
  }

  saveHistory() {
    try {
      fs.writeFileSync(this.historyFile, JSON.stringify(this.history.slice(0, 50), null, 2));
    } catch (e) {}
  }

  addHistory(entry) {
    this.history.unshift({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...entry,
    });
    if (this.history.length > 50) this.history.pop();
    this.saveHistory();
  }

  deleteHistoryItem(id) {
    const initialLen = this.history.length;
    this.history = this.history.filter(item => item.id !== id);
    if (this.history.length !== initialLen) {
      this.saveHistory();
      return true;
    }
    return false;
  }

  clearHistory() {
    this.history = [];
    this.saveHistory();
    return true;
  }

  getHistory() {
    return this.history;
  }

  createTransfer(senderId, senderName, targetId, files, isStaged = false, direction = null, senderType = 'windows') {
    const transferId = crypto.randomUUID();
    const sanitizedFiles = (files || []).map(f => ({
      id: f.id || crypto.randomUUID(),
      name: sanitizeFilename(f.name),
      originalName: f.name || 'unnamed_file',
      size: Number(f.size) || 0,
      type: f.type || 'application/octet-stream',
      bytesReceived: 0,
      status: 'pending',
      downloadUrl: `/api/transfer/download/${transferId}/${f.id || ''}`,
      startTime: null,
      endTime: null,
    }));

    const totalBytes = sanitizedFiles.reduce((acc, f) => acc + f.size, 0);
    const resolvedDirection = direction || (isStaged ? 'pc_to_phone' : 'phone_to_pc');

    const transfer = {
      id: transferId,
      senderId,
      senderName: senderName || 'Peer Device',
      targetId,
      files: sanitizedFiles,
      totalBytes,
      bytesTransferred: 0,
      status: config.autoAccept ? 'accepted' : 'awaiting_approval',
      isStaged: !!isStaged,
      direction: resolvedDirection,
      senderType,
      createdAt: Date.now(),
      speed: 0,
      eta: 0,
      lastProgressUpdate: Date.now(),
      lastBytesTransferred: 0,
    };

    this.activeTransfers.set(transferId, transfer);

    // Broadcast transfer approval request to receiver before any file chunks are sent
    if (config.autoAccept) {
      sse.broadcast('TRANSFER_ACCEPTED', { transferId });
    } else {
      const requestPayload = {
        transferId,
        senderId,
        senderName: transfer.senderName,
        files: transfer.files,
        totalBytes: transfer.totalBytes,
        direction: resolvedDirection,
        isStaged: !!isStaged,
      };

      if (targetId) {
        sse.sendTo(targetId, 'TRANSFER_REQUEST', requestPayload);
      } else {
        // Strictly exclude sender ID, and any client of the same device type (e.g., windows sender will never broadcast to windows clients)
        sse.broadcastFiltered('TRANSFER_REQUEST', requestPayload, (id, client) => {
          if (id === senderId) return false;
          if (client.peerInfo && client.peerInfo.type === senderType) return false;
          if (client.peerInfo && client.peerInfo.name === transfer.senderName) return false;
          return true;
        });
      }
    }

    return transfer;
  }

  approveTransfer(transferId, accepted = true, peerName = 'Peer Device') {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer) return null;

    if (accepted) {
      transfer.status = 'accepted';
      sse.broadcast('TRANSFER_ACCEPTED', {
        transferId,
        peerName,
      });
    } else {
      transfer.status = 'rejected';
      sse.broadcast('TRANSFER_REJECTED', {
        transferId,
        declinedByName: peerName || 'Peer Device',
        files: transfer.files.map(f => f.name),
      });
      this.cleanupTransferTempFiles(transferId, transfer.files);
      this.activeTransfers.delete(transferId);
    }
    return transfer;
  }

  cancelTransfer(transferId, cancelledByName = 'Peer Device') {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer) return null;

    transfer.status = 'cancelled';

    // Broadcast cancellation to BOTH sender and receiver
    sse.broadcast('TRANSFER_CANCELLED', {
      transferId,
      cancelledByName: cancelledByName || 'Peer Device',
      files: transfer.files.map(f => f.name),
      timestamp: Date.now(),
    });

    this.cleanupTransferTempFiles(transferId, transfer.files);
    this.activeTransfers.delete(transferId);
    return transfer;
  }

  cleanupTransferTempFiles(transferId, files = []) {
    for (const f of files) {
      const partPath = path.join(config.tempDir, `${transferId}_${f.id}.part`);
      const stagedPath = path.join(config.tempDir, `${transferId}_${f.id}.staged`);
      if (fs.existsSync(partPath)) {
        try { fs.unlinkSync(partPath); } catch (e) {}
      }
      if (fs.existsSync(stagedPath)) {
        try { fs.unlinkSync(stagedPath); } catch (e) {}
      }
    }
  }

  getTransfer(transferId) {
    return this.activeTransfers.get(transferId);
  }

  getUniqueDestinationPath(targetDir, originalName) {
    const ext = path.extname(originalName);
    const base = path.basename(originalName, ext);
    let destPath = path.join(targetDir, originalName);
    let counter = 1;

    while (fs.existsSync(destPath)) {
      destPath = path.join(targetDir, `${base} (${counter})${ext}`);
      counter++;
    }
    return destPath;
  }

  async handleChunk(req, res) {
    const transferId = req.headers['x-transfer-id'];
    const fileId = req.headers['x-file-id'];
    const rawFileName = req.headers['x-file-name'] ? decodeURIComponent(req.headers['x-file-name']) : 'file';
    const fileName = sanitizeFilename(rawFileName);
    const fileSize = parseInt(req.headers['x-file-size'] || '0', 10);
    const chunkIndex = parseInt(req.headers['x-chunk-index'] || '0', 10);
    const totalChunks = parseInt(req.headers['x-total-chunks'] || '1', 10);
    const chunkOffset = parseInt(req.headers['x-chunk-offset'] || '0', 10);
    const isLast = req.headers['x-is-last'] === 'true' || chunkIndex === totalChunks - 1;

    let transfer = this.activeTransfers.get(transferId);
    if (!transfer) {
      transfer = this.createTransfer('unknown', 'Direct Device', null, [{ id: fileId, name: fileName, size: fileSize }]);
      transfer.status = 'accepted';
    }

    let fileRecord = transfer.files.find(f => f.id === fileId);
    if (!fileRecord) {
      fileRecord = {
        id: fileId,
        name: fileName,
        originalName: rawFileName,
        size: fileSize,
        bytesReceived: 0,
        status: 'active',
        startTime: Date.now(),
      };
      transfer.files.push(fileRecord);
    }

    if (fileRecord.status === 'pending') {
      fileRecord.status = 'active';
      fileRecord.startTime = Date.now();
    }

    const partPath = path.join(config.tempDir, `${transferId}_${fileId}.part`);

    try {
      // Ensure part file exists before opening with r+
      if (chunkOffset === 0 || !fs.existsSync(partPath)) {
        if (!fs.existsSync(config.tempDir)) {
          fs.mkdirSync(config.tempDir, { recursive: true });
        }
        fs.writeFileSync(partPath, Buffer.alloc(0));
      }

      await new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(partPath, { flags: 'r+', start: chunkOffset });
        let chunkBytes = 0;

        req.on('data', chunk => {
          chunkBytes += chunk.length;
        });

        req.pipe(writeStream);

        writeStream.on('finish', () => {
          fileRecord.bytesReceived = chunkOffset + chunkBytes;
          resolve();
        });

        writeStream.on('error', reject);
        req.on('error', reject);
      });

      // Update transfer progress
      const now = Date.now();
      const timeDelta = (now - transfer.lastProgressUpdate) / 1000;

      transfer.bytesTransferred = transfer.files.reduce((acc, f) => acc + f.bytesReceived, 0);

      const isStagedTransfer = transfer.isStaged || req.headers['x-is-staged'] === 'true';

      // Only broadcast progress from handleChunk for direct transfers (Phone -> PC).
      // For staged transfers (PC -> Phone), progress is broadcast exclusively by /api/transfer/download
      // to reflect actual Wi-Fi delivery to the mobile phone without competing duplicate events.
      if (!isStagedTransfer && (timeDelta >= 0.2 || isLast)) {
        const bytesDelta = transfer.bytesTransferred - transfer.lastBytesTransferred;
        if (timeDelta > 0) {
          const instantSpeed = bytesDelta / timeDelta;
          transfer.speed = transfer.speed === 0 ? instantSpeed : transfer.speed * 0.7 + instantSpeed * 0.3;
        }

        const bytesRemaining = Math.max(0, transfer.totalBytes - transfer.bytesTransferred);
        transfer.eta = transfer.speed > 0 ? Math.round(bytesRemaining / transfer.speed) : 0;

        transfer.lastProgressUpdate = now;
        transfer.lastBytesTransferred = transfer.bytesTransferred;

        sse.broadcast('TRANSFER_PROGRESS', {
          transferId,
          fileId,
          fileName: fileRecord.name,
          bytesReceived: fileRecord.bytesReceived,
          fileSize: fileRecord.size,
          bytesTransferred: transfer.bytesTransferred,
          totalBytes: transfer.totalBytes,
          bytesRemaining,
          speed: Math.round(transfer.speed),
          eta: transfer.eta,
          chunkIndex,
          totalChunks,
        });
      }

      // Check for file completion
      if (isLast || fileRecord.bytesReceived >= fileRecord.size) {
        fileRecord.status = 'completed';
        fileRecord.endTime = Date.now();

        const isStagedTransfer = transfer.isStaged || req.headers['x-is-staged'] === 'true';

        if (isStagedTransfer) {
          // File was uploaded from PC to local staging area for Phone to download!
          // Rename part file to .staged in temp dir
          const stagedPath = path.join(config.tempDir, `${transferId}_${fileId}.staged`);
          try {
            if (fs.existsSync(stagedPath)) fs.unlinkSync(stagedPath);
            fs.renameSync(partPath, stagedPath);
          } catch (renameErr) {
            fs.copyFileSync(partPath, stagedPath);
            fs.unlinkSync(partPath);
          }

          fileRecord.downloadUrl = `/api/transfer/download/${transferId}/${fileId}`;

          // Staging complete for this file: emit FILE_READY_FOR_DOWNLOAD to the receiver (mobile phone)
          const readyPayload = {
            transferId,
            fileId,
            fileName: fileRecord.name,
            fileSize: fileRecord.size,
            downloadUrl: `/api/transfer/download/${transferId}/${fileId}`,
            direction: 'pc_to_phone',
          };

          if (transfer.targetId) {
            sse.sendTo(transfer.targetId, 'FILE_READY_FOR_DOWNLOAD', readyPayload);
          } else {
            sse.broadcastFiltered('FILE_READY_FOR_DOWNLOAD', readyPayload, (id, client) => {
              if (id === transfer.senderId) return false;
              if (client.peerInfo && client.peerInfo.type === 'windows') return false;
              if (client.peerInfo && client.peerInfo.name === transfer.senderName) return false;
              return true;
            });
          }
        } else {
          // Standard upload from Mobile Phone to PC! Destination is PC Downloads.
          if (!fs.existsSync(config.downloadsDir)) {
            fs.mkdirSync(config.downloadsDir, { recursive: true });
          }

          const destPath = this.getUniqueDestinationPath(config.downloadsDir, fileRecord.name);

          // Rename part file to final path in PC Downloads
          try {
            fs.renameSync(partPath, destPath);
          } catch (renameErr) {
            fs.copyFileSync(partPath, destPath);
            fs.unlinkSync(partPath);
          }

          const duration = Math.max(0.1, (fileRecord.endTime - fileRecord.startTime) / 1000);
          const avgSpeed = Math.round(fileRecord.size / duration);

          this.addHistory({
            type: 'received',
            name: path.basename(destPath),
            size: fileRecord.size,
            savedPath: destPath,
            sender: transfer.senderName,
            duration,
            avgSpeed,
          });

          sse.broadcast('TRANSFER_COMPLETE', {
            transferId,
            fileId,
            fileName: path.basename(destPath),
            savedPath: destPath,
            size: fileRecord.size,
            avgSpeed,
            duration,
          });
        }

        const allDone = transfer.files.every(f => f.status === 'completed');
        if (allDone && !isStagedTransfer) {
          transfer.status = 'completed';
          sse.broadcast('ALL_TRANSFERS_COMPLETE', { transferId });
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        bytesReceived: fileRecord.bytesReceived,
        isComplete: fileRecord.status === 'completed',
      }));
    } catch (err) {
      console.error('Error handling chunk:', err);
      fileRecord.status = 'error';
      sse.broadcast('TRANSFER_ERROR', { transferId, fileId, error: err.message });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  getFileStatus(transferId, fileId) {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer) return null;
    const file = transfer.files.find(f => f.id === fileId);
    if (!file) return null;

    const partPath = path.join(config.tempDir, `${transferId}_${fileId}.part`);
    let partSize = 0;
    if (fs.existsSync(partPath)) {
      try {
        partSize = fs.statSync(partPath).size;
      } catch (e) {}
    }

    return {
      transferId,
      fileId,
      fileName: file.name,
      totalSize: file.size,
      bytesReceived: Math.max(file.bytesReceived, partSize),
      status: file.status,
    };
  }

  stageFileForDownload(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const stats = fs.statSync(filePath);
    const id = crypto.randomUUID();
    const record = {
      id,
      path: filePath,
      name: path.basename(filePath),
      size: stats.size,
      createdAt: Date.now(),
    };
    this.stagedFiles.set(id, record);
    return record;
  }

  stageUploadedBuffer(buffer, originalName) {
    const safeName = sanitizeFilename(originalName);
    const id = crypto.randomUUID();
    const stagedPath = path.join(config.tempDir, `staged_${id}_${safeName}`);
    fs.writeFileSync(stagedPath, buffer);

    const record = {
      id,
      path: stagedPath,
      name: safeName,
      size: buffer.length,
      createdAt: Date.now(),
    };
    this.stagedFiles.set(id, record);
    return record;
  }

  getStagedFile(id) {
    return this.stagedFiles.get(id);
  }

  listStagedFiles() {
    return Array.from(this.stagedFiles.values());
  }

  clearStagedFile(id) {
    const item = this.stagedFiles.get(id);
    if (item && item.path && item.path.includes('staged_') && fs.existsSync(item.path)) {
      try { fs.unlinkSync(item.path); } catch (e) {}
    }
    this.stagedFiles.delete(id);
  }
}

const transferManager = new TransferManager();
module.exports = transferManager;
