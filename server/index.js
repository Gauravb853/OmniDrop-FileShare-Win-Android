// server/index.js - OmniDrop Main Server Entry
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config.js');
const network = require('./network.js');
const sse = require('./sse.js');
const transfer = require('./transfer.js');
const discovery = require('./discovery.js');
const qr = require('./qr.js');
const system = require('./system.js');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
};

// Helper: Parse JSON body
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) { // Max 5MB for JSON payloads
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// Helper: Send JSON response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(data));
}

// Helper: Serve static file
function serveStaticFile(req, res, pathname) {
  let relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  // Sanitize path against directory traversal
  const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA/PWA routing
      const indexPath = path.join(PUBLIC_DIR, 'index.html');
      fs.stat(indexPath, (indexErr, indexStats) => {
        if (indexErr || !indexStats.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          return res.end('Not Found');
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(indexPath).pipe(res);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Headers
    const headers = {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Access-Control-Allow-Origin': '*',
    };

    // Never cache application scripts, HTML or stylesheets so updates take effect immediately
    if (ext === '.html' || ext === '.js' || ext === '.css' || ext === '.json' || filePath.endsWith('sw.js')) {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
    } else {
      headers['Cache-Control'] = 'public, max-age=86400';
    }

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }

  const host = req.headers.host || 'localhost';
  const reqUrl = new URL(req.url, `http://${host}`);
  const pathname = reqUrl.pathname;
  const searchParams = reqUrl.searchParams;

  try {
    // 1. API: System Info & Network URLs
    if (pathname === '/api/info' && req.method === 'GET') {
      const netInfo = network.getNetworkInfo(config.port);
      return sendJson(res, 200, {
        deviceName: config.deviceName,
        deviceType: config.deviceType,
        hostname: config.hostname,
        port: config.port,
        network: netInfo,
        config: {
          downloadsDir: config.downloadsDir,
          autoAccept: config.autoAccept,
          chunkSize: config.chunkSize,
        },
        discoveredPeers: discovery.getDiscoveredDevices(),
      });
    }

    // 2. API: QR Code Generation
    if (pathname === '/api/qr' && req.method === 'GET') {
      const targetUrl = searchParams.get('url') || network.getNetworkInfo(config.port).primary.url;
      const svg = qr.generateSVG(targetUrl, { size: 280, padding: 3 });
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      });
      return res.end(svg);
    }

    // 3. API: Real-time Server-Sent Events (SSE)
    if (pathname === '/api/events' && req.method === 'GET') {
      const clientId = searchParams.get('id') || null;
      const peerName = searchParams.get('name') || 'Mobile Client';
      const peerType = searchParams.get('type') || 'android';
      sse.handleConnection(req, res, { clientId, name: peerName, type: peerType });
      return;
    }

    // 4. API: Update Peer Info
    if (pathname === '/api/peers/update' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      if (body.clientId) {
        sse.updatePeerInfo(body.clientId, body);
      }
      return sendJson(res, 200, { success: true });
    }

    // 5. API: Transfer Handshake Request
    if (pathname === '/api/transfer/request' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const session = transfer.createTransfer(
        body.senderId,
        body.senderName,
        body.targetId,
        body.files || [],
        body.isStaged || false,
        body.direction || (body.isStaged ? 'pc_to_phone' : 'phone_to_pc'),
        body.senderType || 'windows'
      );
      return sendJson(res, 200, {
        transferId: session.id,
        status: session.status,
        autoAccepted: session.status === 'accepted',
      });
    }

    // 6. API: Transfer Approval (Accept / Reject)
    if (pathname === '/api/transfer/approve' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const result = transfer.approveTransfer(body.transferId, body.accepted, body.peerName);
      if (!result) return sendJson(res, 404, { error: 'Transfer not found' });
      return sendJson(res, 200, { success: true, status: result.status });
    }

    // 6b. API: Transfer Cancellation (by either sender or receiver)
    if (pathname === '/api/transfer/cancel' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const result = transfer.cancelTransfer(body.transferId, body.cancelledByName);
      if (!result) return sendJson(res, 404, { error: 'Transfer not found or already ended' });
      return sendJson(res, 200, { success: true, status: 'cancelled' });
    }

    // 7. API: Streaming Chunk Upload (Handles files of any size)
    if (pathname === '/api/transfer/chunk' && req.method === 'POST') {
      return await transfer.handleChunk(req, res);
    }

    // 8. API: Resumable File Status
    if (pathname.startsWith('/api/transfer/status/') && req.method === 'GET') {
      const parts = pathname.replace('/api/transfer/status/', '').split('/');
      const transferId = parts[0];
      const fileId = parts[1];
      const status = transfer.getFileStatus(transferId, fileId);
      if (!status) return sendJson(res, 404, { error: 'File status not found' });
      return sendJson(res, 200, status);
    }

    // 9. API: Transfer History (GET, DELETE, POST clear / delete)
    if (pathname === '/api/transfer/history' && req.method === 'GET') {
      return sendJson(res, 200, transfer.getHistory());
    }

    if ((pathname === '/api/transfer/history' && req.method === 'DELETE') || (pathname === '/api/transfer/history/clear' && req.method === 'POST')) {
      transfer.clearHistory();
      return sendJson(res, 200, { success: true, message: 'Transfer history cleared' });
    }

    if ((pathname.startsWith('/api/transfer/history/') && req.method === 'DELETE') || (pathname === '/api/transfer/history/delete' && req.method === 'POST')) {
      let id = pathname.replace('/api/transfer/history/', '');
      if (req.method === 'POST') {
        const body = await parseJsonBody(req);
        id = body.id || id;
      }
      const deleted = transfer.deleteHistoryItem(id);
      return sendJson(res, 200, { success: deleted });
    }

    // 10. API: Stage files on PC for Phone to Download
    if (pathname === '/api/files/stage' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const staged = [];
      if (Array.isArray(body.paths)) {
        for (const p of body.paths) {
          const rec = transfer.stageFileForDownload(p);
          if (rec) staged.push(rec);
        }
      }
      sse.broadcast('FILES_OFFERED', {
        files: staged.map(f => ({
          id: f.id,
          name: f.name,
          size: f.size,
          url: `/api/files/download/${f.id}`,
        })),
      });
      return sendJson(res, 200, { success: true, staged });
    }

    // 11. API: List Staged Files
    if (pathname === '/api/files/staged' && req.method === 'GET') {
      return sendJson(res, 200, transfer.listStagedFiles());
    }

    // 12. API: Download File to Phone with HTTP Range Streaming Support
    if (pathname.startsWith('/api/files/download/') && req.method === 'GET') {
      const fileId = pathname.replace('/api/files/download/', '');
      const staged = transfer.getStagedFile(fileId);
      if (!staged || !fs.existsSync(staged.path)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('File not found or expired');
      }

      const filePath = staged.path;
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        const fileStream = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(staged.name)}"`,
        });
        return fileStream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': 'application/octet-stream',
          'Accept-Ranges': 'bytes',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(staged.name)}"`,
        });
        return fs.createReadStream(filePath).pipe(res);
      }
    }

    // 12c. API: Streaming Download for Staged Transfer (When Phone downloads file from PC)
    if (pathname.startsWith('/api/transfer/download/') && req.method === 'GET') {
      const parts = pathname.replace('/api/transfer/download/', '').split('/');
      const transferId = parts[0];
      const fileId = parts[1];

      const transferSession = transfer.getTransfer(transferId);
      if (!transferSession || transferSession.status === 'cancelled') {
        res.writeHead(410, { 'Content-Type': 'text/plain' });
        return res.end('Transfer was cancelled or expired');
      }

      const fileRecord = transferSession ? transferSession.files.find(f => f.id === fileId) : null;
      const fileName = fileRecord ? fileRecord.name : 'downloaded_file';

      const stagedPath = path.join(config.tempDir, `${transferId}_${fileId}.staged`);
      const partPath = path.join(config.tempDir, `${transferId}_${fileId}.part`);
      const destPath = path.join(config.downloadsDir, fileName);

      let targetPath = null;
      if (fs.existsSync(stagedPath)) targetPath = stagedPath;
      else if (fs.existsSync(partPath)) targetPath = partPath;
      else if (fs.existsSync(destPath)) targetPath = destPath;

      if (!targetPath) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('File not found or transfer expired');
      }

      const stat = fs.statSync(targetPath);
      const fileSize = stat.size;
      const range = req.headers.range;

      // ISOLATED PER-FILE progress tracker on transferSession:
      // Prevents multiple files in a batch from interfering with each other's progress.
      if (!transferSession.fileProgress) {
        transferSession.fileProgress = new Map();
      }
      let prog = transferSession.fileProgress.get(fileId);
      if (!prog) {
        prog = {
          maxBytesDelivered: 0,
          lastTime: Date.now(),
          lastBytes: 0,
          smoothedSpeed: 0,
          completeFired: false,
        };
        transferSession.fileProgress.set(fileId, prog);
      }

      const broadcastProgress = (absoluteBytesSoFar) => {
        // Clamp: never report less than what this file has already reported
        if (absoluteBytesSoFar <= prog.maxBytesDelivered && absoluteBytesSoFar < fileSize) return;
        prog.maxBytesDelivered = Math.max(prog.maxBytesDelivered, absoluteBytesSoFar);

        const now = Date.now();
        const timeDelta = (now - prog.lastTime) / 1000;
        if (timeDelta >= 0.25 || prog.maxBytesDelivered >= fileSize) {
          const bytesDelta = prog.maxBytesDelivered - prog.lastBytes;
          const instantSpeed = timeDelta > 0 ? bytesDelta / timeDelta : 0;
          prog.smoothedSpeed = prog.smoothedSpeed === 0 ? instantSpeed : prog.smoothedSpeed * 0.7 + instantSpeed * 0.3;
          const remaining = Math.max(0, fileSize - prog.maxBytesDelivered);
          const eta = prog.smoothedSpeed > 0 ? Math.round(remaining / prog.smoothedSpeed) : 0;

          prog.lastTime = now;
          prog.lastBytes = prog.maxBytesDelivered;

          sse.broadcast('TRANSFER_PROGRESS', {
            transferId,
            fileId,
            fileName,
            bytesReceived: prog.maxBytesDelivered,
            fileSize,
            bytesTransferred: prog.maxBytesDelivered,
            totalBytes: fileSize,
            bytesRemaining: remaining,
            speed: Math.round(prog.smoothedSpeed),
            eta,
          });
        }
      };

      const fireCompleteOnce = () => {
        if (prog.completeFired) return;
        prog.completeFired = true;

        if (fileRecord) {
          fileRecord.status = 'completed';
        }

        // Add history entry on server so newly sent files appear in History tab
        transfer.addHistory({
          type: 'sent',
          name: fileName,
          size: fileSize,
          recipient: transferSession ? (transferSession.targetName || 'Mobile Device') : 'Mobile Device',
          sender: transferSession ? transferSession.senderName : 'Windows PC',
          avgSpeed: Math.round(prog.smoothedSpeed || 0),
        });

        sse.broadcast('TRANSFER_COMPLETE', {
          transferId,
          fileId,
          fileName,
          size: fileSize,
          avgSpeed: Math.round(prog.smoothedSpeed || 0),
        });

        // If all files in batch transfer have completed, notify all parties
        const allCompleted = transferSession.files.every(f => f.status === 'completed');
        if (allCompleted) {
          transferSession.status = 'completed';
          sse.broadcast('ALL_TRANSFERS_COMPLETE', { transferId });
        }

        // Delete staged file after successful delivery
        if (targetPath.includes('.staged')) {
          setTimeout(() => {
            try { if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath); } catch (e) {}
          }, 15000);
        }
      };

      if (range) {
        const rangeParts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(rangeParts[0], 10);
        const end = rangeParts[1] ? parseInt(rangeParts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        const fileStream = fs.createReadStream(targetPath, { start, end });

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': (fileRecord && fileRecord.type) || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        });

        let rangeStreamed = 0;
        fileStream.on('data', chunk => {
          rangeStreamed += chunk.length;
          broadcastProgress(start + rangeStreamed);
        });

        fileStream.on('end', () => {
          // Only fire complete when we've delivered the very last byte of the file
          if (start + rangeStreamed >= fileSize) {
            fireCompleteOnce();
          }
        });

        return fileStream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': (fileRecord && fileRecord.type) || 'application/octet-stream',
          'Accept-Ranges': 'bytes',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        });

        const fileStream = fs.createReadStream(targetPath);
        let fullStreamed = 0;

        fileStream.on('data', chunk => {
          fullStreamed += chunk.length;
          broadcastProgress(fullStreamed);
        });

        fileStream.on('end', () => {
          fireCompleteOnce();
        });

        return fileStream.pipe(res);
      }
    }

    // 12b. API: Download Any Received File by Name (Allows Phone to download previously received files)
    if (pathname.startsWith('/api/transfer/file/') && req.method === 'GET') {
      const rawName = decodeURIComponent(pathname.replace('/api/transfer/file/', ''));
      const safeName = path.basename(rawName);
      const filePath = path.join(config.downloadsDir, safeName);

      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('File not found');
      }

      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        const fileStream = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(safeName)}"`,
        });
        return fileStream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': 'application/octet-stream',
          'Accept-Ranges': 'bytes',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(safeName)}"`,
        });
        return fs.createReadStream(filePath).pipe(res);
      }
    }

    // 13. API: Shared Clipboard / Text
    if (pathname === '/api/clipboard' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      if (body.text) {
        sse.broadcast('CLIPBOARD_RECEIVED', {
          text: body.text,
          senderName: body.senderName || 'Peer Device',
          timestamp: Date.now(),
        });
        return sendJson(res, 200, { success: true });
      }
      return sendJson(res, 400, { error: 'Text required' });
    }

    // 14. API: System Integrations
    if (pathname === '/api/system/open-folder' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      system.openDownloadsFolder(body.path);
      return sendJson(res, 200, { success: true });
    }

    if (pathname === '/api/system/launch-bluetooth' && req.method === 'POST') {
      const result = system.launchBluetoothTransfer();
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/system/open-hotspot' && req.method === 'POST') {
      const result = system.openHotspotSettings();
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/system/open-bluetooth-settings' && req.method === 'POST') {
      const result = system.openBluetoothSettings();
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/system/settings' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      if (body.downloadsDir) system.setDownloadsDirectory(body.downloadsDir);
      if (typeof body.autoAccept === 'boolean') config.autoAccept = body.autoAccept;
      return sendJson(res, 200, {
        success: true,
        downloadsDir: config.downloadsDir,
        autoAccept: config.autoAccept,
      });
    }

    // Fallthrough: Serve Frontend Web Application
    serveStaticFile(req, res, pathname);
  } catch (err) {
    console.error('Unhandled server error:', err);
    sendJson(res, 500, { error: err.message });
  }
});

// Start Server
function startServer() {
  server.listen(config.port, '0.0.0.0', () => {
    const netInfo = network.getNetworkInfo(config.port);
    console.log('\n====================================================');
    console.log(`🚀 OmniDrop running on port ${config.port}`);
    console.log(`📡 PC browser:    http://localhost:${config.port}`);
    console.log('----------------------------------------------------');
    if (netInfo.all && netInfo.all.length > 0) {
      console.log('📱 Scan this URL on your Phone (must be on same Wi-Fi):');
      netInfo.all.forEach(a => {
        const marker = a.address === netInfo.primary.address ? ' ◄ USE THIS' : '';
        console.log(`   [${a.type.toUpperCase().padEnd(8)}] ${a.url}${marker}`);
      });
    } else {
      console.log('⚠️  No network interface found. Connect to Wi-Fi first!');
      console.log(`   Fallback: http://localhost:${config.port}`);
    }
    console.log('----------------------------------------------------');
    console.log(`📂 Downloads Dir: ${config.downloadsDir}`);
    console.log('====================================================\n');

    if (netInfo.primary.type === 'localhost') {
      console.log('⚠️  WARNING: Server bound only to localhost — phone cannot connect!');
      console.log('   Connect your PC to Wi-Fi or enable Mobile Hotspot, then restart.\n');
    }

    // Start UDP discovery
    discovery.start();
  });

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${config.port} is in use, trying ${config.port + 1}...`);
      config.port++;
      server.listen(config.port, '0.0.0.0');
    } else {
      console.error('Server error:', err);
    }
  });
}

// Graceful exit
process.on('SIGINT', () => {
  console.log('\nShutting down OmniDrop...');
  discovery.stop();
  server.close(() => {
    process.exit(0);
  });
});

if (require.main === module) {
  startServer();
}

module.exports = { server, startServer };
