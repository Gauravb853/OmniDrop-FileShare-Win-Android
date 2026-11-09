// test/transfer.test.js - Automated Verification Suite for OmniDrop
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert');

const TEST_PORT = 5055;
process.env.PORT = TEST_PORT.toString();

const { server } = require('../server/index.js');
const config = require('../server/config.js');

// Override download and temp dir for testing
const testOutputDir = path.join(os.tmpdir(), 'omnidrop-test-downloads');
const testTempDir = path.join(os.tmpdir(), 'omnidrop-test-temp');
fs.mkdirSync(testOutputDir, { recursive: true });
fs.mkdirSync(testTempDir, { recursive: true });

config.downloadsDir = testOutputDir;
config.tempDir = testTempDir;
config.autoAccept = true;

// Helper: HTTP request wrapper
function makeRequest(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `http://127.0.0.1:${TEST_PORT}${urlPath}`,
      { method, headers },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          let json = null;
          try {
            json = JSON.parse(raw.toString('utf8'));
          } catch (e) {}
          resolve({ status: res.statusCode, headers: res.headers, raw, json });
        });
      }
    );
    req.on('error', reject);
    if (body) {
      if (Buffer.isBuffer(body) || typeof body === 'string') {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting OmniDrop Senior Test Suite ---\n');

  // Start Server
  await new Promise(resolve => server.listen(TEST_PORT, '127.0.0.1', resolve));
  console.log(`[PASS] Server started cleanly on port ${TEST_PORT}`);

  try {
    // Test 1: Static file serving & SPA fallback
    const indexRes = await makeRequest('GET', '/');
    assert.strictEqual(indexRes.status, 200);
    assert.ok(indexRes.raw.toString('utf8').includes('OmniDrop'));
    console.log('[PASS] Test 1: Static Index & HTML serving OK');

    // Test 2: System info endpoint
    const infoRes = await makeRequest('GET', '/api/info');
    assert.strictEqual(infoRes.status, 200);
    assert.ok(infoRes.json.network.primary.address);
    assert.strictEqual(infoRes.json.port, TEST_PORT);
    console.log('[PASS] Test 2: System info & network adapters detection OK');

    // Test 3: QR Code generation
    const qrRes = await makeRequest('GET', '/api/qr?url=http://192.168.1.8:5050');
    assert.strictEqual(qrRes.status, 200);
    assert.ok(qrRes.raw.toString('utf8').includes('<svg'));
    console.log('[PASS] Test 3: Self-contained Vector QR Code generation OK');

    // Test 4: Chunked Streaming Upload with SHA-256 Integrity Verification
    console.log('[INFO] Generating 8 MB pseudo-random binary payload for streaming test...');
    const originalBuffer = crypto.randomBytes(8 * 1024 * 1024);
    const originalSha256 = crypto.createHash('sha256').update(originalBuffer).digest('hex');

    const testFileName = 'test_sample_4k_movie.bin';
    const initRes = await makeRequest('POST', '/api/transfer/request', { 'Content-Type': 'application/json' }, {
      senderName: 'Test Mobile Device',
      files: [{ id: 'file_001', name: testFileName, size: originalBuffer.length }],
    });
    assert.strictEqual(initRes.status, 200);
    const transferId = initRes.json.transferId;
    assert.ok(transferId);

    // Upload in two 4MB chunks
    const chunkSize = 4 * 1024 * 1024;
    const chunk1 = originalBuffer.subarray(0, chunkSize);
    const chunk2 = originalBuffer.subarray(chunkSize);

    // Chunk 1
    const chunk1Res = await makeRequest('POST', '/api/transfer/chunk', {
      'x-transfer-id': transferId,
      'x-file-id': 'file_001',
      'x-file-name': encodeURIComponent(testFileName),
      'x-file-size': originalBuffer.length.toString(),
      'x-chunk-index': '0',
      'x-total-chunks': '2',
      'x-chunk-offset': '0',
      'x-is-last': 'false',
      'Content-Type': 'application/octet-stream',
    }, chunk1);
    assert.strictEqual(chunk1Res.status, 200);
    assert.strictEqual(chunk1Res.json.bytesReceived, chunkSize);

    // Resumable status verification after Chunk 1
    const statusRes = await makeRequest('GET', `/api/transfer/status/${transferId}/file_001`);
    assert.strictEqual(statusRes.status, 200);
    assert.strictEqual(statusRes.json.bytesReceived, chunkSize);
    console.log('[PASS] Test 4a: Chunk 1 uploaded & intermediate resume status confirmed');

    // Chunk 2 (Final)
    const chunk2Res = await makeRequest('POST', '/api/transfer/chunk', {
      'x-transfer-id': transferId,
      'x-file-id': 'file_001',
      'x-file-name': encodeURIComponent(testFileName),
      'x-file-size': originalBuffer.length.toString(),
      'x-chunk-index': '1',
      'x-total-chunks': '2',
      'x-chunk-offset': chunkSize.toString(),
      'x-is-last': 'true',
      'Content-Type': 'application/octet-stream',
    }, chunk2);
    assert.strictEqual(chunk2Res.status, 200);
    assert.strictEqual(chunk2Res.json.isComplete, true);

    // Verify written file matches SHA-256 exactly
    const savedFilePath = path.join(testOutputDir, testFileName);
    assert.ok(fs.existsSync(savedFilePath), `File not found at ${savedFilePath}`);
    const receivedBuffer = fs.readFileSync(savedFilePath);
    const receivedSha256 = crypto.createHash('sha256').update(receivedBuffer).digest('hex');
    assert.strictEqual(receivedSha256, originalSha256, 'SHA-256 checksum mismatch!');
    console.log('[PASS] Test 4b: Chunk 2 uploaded & SHA-256 byte-for-byte checksum verified identical!');

    // Test 5: Filename Sanitization & Path Traversal Prevention
    const traversalFileName = '../../../../sensitive_doc.txt';
    const badInit = await makeRequest('POST', '/api/transfer/request', { 'Content-Type': 'application/json' }, {
      senderName: 'Attacker Test',
      files: [{ id: 'bad_001', name: traversalFileName, size: 100 }],
    });
    assert.strictEqual(badInit.status, 200);

    const badChunk = await makeRequest('POST', '/api/transfer/chunk', {
      'x-transfer-id': badInit.json.transferId,
      'x-file-id': 'bad_001',
      'x-file-name': encodeURIComponent(traversalFileName),
      'x-file-size': '12',
      'x-chunk-index': '0',
      'x-total-chunks': '1',
      'x-chunk-offset': '0',
      'x-is-last': 'true',
      'Content-Type': 'application/octet-stream',
    }, Buffer.from('hello world\n'));
    assert.strictEqual(badChunk.status, 200);

    // Ensure it saved cleanly inside testOutputDir and NOT in parent dirs
    assert.ok(fs.existsSync(path.join(testOutputDir, 'sensitive_doc.txt')));
    assert.ok(!fs.existsSync(path.join(testOutputDir, '..', 'sensitive_doc.txt')));
    console.log('[PASS] Test 5: Filename path traversal prevention OK');

    // Test 6: Reverse Transfer & HTTP Range partial content streaming (PC to Phone)
    const stageFilePath = path.join(testOutputDir, 'sample_for_phone.txt');
    fs.writeFileSync(stageFilePath, '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    const stageRes = await makeRequest('POST', '/api/files/stage', { 'Content-Type': 'application/json' }, {
      paths: [stageFilePath],
    });
    assert.strictEqual(stageRes.status, 200);
    const stagedId = stageRes.json.staged[0].id;

    // Request byte range 0-9
    const rangeRes = await makeRequest('GET', `/api/files/download/${stagedId}`, {
      'Range': 'bytes=0-9',
    });
    assert.strictEqual(rangeRes.status, 206);
    assert.strictEqual(rangeRes.raw.toString('utf8'), '0123456789');
    console.log('[PASS] Test 6: HTTP 206 Range download streaming OK');

    // Test 7: Clipboard Sync
    const clipRes = await makeRequest('POST', '/api/clipboard', { 'Content-Type': 'application/json' }, {
      text: 'Senior Developer Test Note',
      senderName: 'Android 14',
    });
    assert.strictEqual(clipRes.status, 200);
    console.log('[PASS] Test 7: Real-time clipboard sharing OK');

    // Test 8: Transfer History
    const historyRes = await makeRequest('GET', '/api/transfer/history');
    assert.strictEqual(historyRes.status, 200);
    assert.ok(Array.isArray(historyRes.json));
    assert.ok(historyRes.json.length >= 1);
    console.log(`[PASS] Test 8: Transfer history recorded ${historyRes.json.length} entries`);

    // Test 9: Transfer Cancellation & Resource Cleanup
    const cancelInit = await makeRequest('POST', '/api/transfer/request', { 'Content-Type': 'application/json' }, {
      senderName: 'Cancellation Tester',
      files: [{ id: 'cancel_001', name: 'cancel_me.mp4', size: 1024 * 1024 }],
    });
    assert.strictEqual(cancelInit.status, 200);
    const cancelTransferId = cancelInit.json.transferId;

    // Send partial chunk
    await makeRequest('POST', '/api/transfer/chunk', {
      'x-transfer-id': cancelTransferId,
      'x-file-id': 'cancel_001',
      'x-file-name': 'cancel_me.mp4',
      'x-file-size': (1024 * 1024).toString(),
      'x-chunk-index': '0',
      'x-total-chunks': '2',
      'x-chunk-offset': '0',
      'x-is-last': 'false',
      'Content-Type': 'application/octet-stream',
    }, Buffer.alloc(1024));

    // Cancel transfer
    const cancelRes = await makeRequest('POST', '/api/transfer/cancel', { 'Content-Type': 'application/json' }, {
      transferId: cancelTransferId,
      cancelledByName: 'Phone User',
    });
    assert.strictEqual(cancelRes.status, 200);
    assert.strictEqual(cancelRes.json.status, 'cancelled');

    // Confirm temp .part file was cleaned up
    const partPath = path.join(testTempDir, `${cancelTransferId}_cancel_001.part`);
    assert.ok(!fs.existsSync(partPath), 'Part file was not cleaned up on cancellation!');
    console.log('[PASS] Test 9: Mid-transfer cancellation & temp file cleanup OK');

    // Test 10: PC-to-Phone Staged Transfer (Must NOT duplicate into PC Downloads!)
    const stagedTestName = 'pc_to_phone_sample.bin';
    const stagedBuffer = crypto.randomBytes(1024 * 512); // 512 KB
    const stagedInit = await makeRequest('POST', '/api/transfer/request', { 'Content-Type': 'application/json' }, {
      senderId: 'pc_test_client',
      senderName: 'Windows PC',
      senderType: 'windows',
      direction: 'pc_to_phone',
      isStaged: true,
      files: [{ id: 'staged_f1', name: stagedTestName, size: stagedBuffer.length }],
    });
    assert.strictEqual(stagedInit.status, 200);
    const stagedTransferId = stagedInit.json.transferId;

    // Upload chunk with x-is-staged: true
    const stagedChunkRes = await makeRequest('POST', '/api/transfer/chunk', {
      'x-transfer-id': stagedTransferId,
      'x-file-id': 'staged_f1',
      'x-file-name': encodeURIComponent(stagedTestName),
      'x-file-size': stagedBuffer.length.toString(),
      'x-chunk-index': '0',
      'x-total-chunks': '1',
      'x-chunk-offset': '0',
      'x-is-last': 'true',
      'x-is-staged': 'true',
      'Content-Type': 'application/octet-stream',
    }, stagedBuffer);
    assert.strictEqual(stagedChunkRes.status, 200);

    // CRITICAL ASSERTION: File MUST NOT exist in PC downloadsDir!
    const accidentalInDownloads = path.join(testOutputDir, stagedTestName);
    assert.ok(!fs.existsSync(accidentalInDownloads), 'Bug! Staged PC-to-Phone file was accidentally placed in PC Downloads directory!');

    // Phone downloads the file
    const phoneDownloadRes = await makeRequest('GET', `/api/transfer/download/${stagedTransferId}/staged_f1`);
    assert.strictEqual(phoneDownloadRes.status, 200);
    assert.strictEqual(phoneDownloadRes.raw.length, stagedBuffer.length);
    assert.strictEqual(phoneDownloadRes.raw.toString('hex'), stagedBuffer.toString('hex'));
    console.log('[PASS] Test 10: PC-to-Phone staged transfer verified (0% self-duplication, Phone downloads directly)');

    // Test 11: Multi-File Staged Transfer and History Recording
    const multiBuf1 = crypto.randomBytes(128 * 1024);
    const multiBuf2 = crypto.randomBytes(256 * 1024);
    const multiInit = await makeRequest('POST', '/api/transfer/request', { 'Content-Type': 'application/json' }, {
      senderId: 'pc_multi_client',
      senderName: 'Windows PC',
      senderType: 'windows',
      direction: 'pc_to_phone',
      isStaged: true,
      files: [
        { id: 'm_file_1', name: 'batch_file_1.bin', size: multiBuf1.length },
        { id: 'm_file_2', name: 'batch_file_2.bin', size: multiBuf2.length },
      ],
    });
    assert.strictEqual(multiInit.status, 200);
    const multiTId = multiInit.json.transferId;

    // Stage File 1
    await makeRequest('POST', '/api/transfer/chunk', {
      'x-transfer-id': multiTId,
      'x-file-id': 'm_file_1',
      'x-file-name': 'batch_file_1.bin',
      'x-file-size': multiBuf1.length.toString(),
      'x-chunk-index': '0',
      'x-total-chunks': '1',
      'x-chunk-offset': '0',
      'x-is-last': 'true',
      'x-is-staged': 'true',
      'Content-Type': 'application/octet-stream',
    }, multiBuf1);

    // Stage File 2
    await makeRequest('POST', '/api/transfer/chunk', {
      'x-transfer-id': multiTId,
      'x-file-id': 'm_file_2',
      'x-file-name': 'batch_file_2.bin',
      'x-file-size': multiBuf2.length.toString(),
      'x-chunk-index': '0',
      'x-total-chunks': '1',
      'x-chunk-offset': '0',
      'x-is-last': 'true',
      'x-is-staged': 'true',
      'Content-Type': 'application/octet-stream',
    }, multiBuf2);

    // Sequential Download: File 1
    const dl1 = await makeRequest('GET', `/api/transfer/download/${multiTId}/m_file_1`);
    assert.strictEqual(dl1.status, 200);
    assert.strictEqual(dl1.raw.length, multiBuf1.length);

    // Sequential Download: File 2 (Ensures no stalls / calculating size bug!)
    const dl2 = await makeRequest('GET', `/api/transfer/download/${multiTId}/m_file_2`);
    assert.strictEqual(dl2.status, 200);
    assert.strictEqual(dl2.raw.length, multiBuf2.length);

    // Check history contains sent records
    const histCheck = await makeRequest('GET', '/api/transfer/history');
    assert.strictEqual(histCheck.status, 200);
    const namesInHistory = histCheck.json.map(h => h.name);
    assert.ok(namesInHistory.includes('batch_file_1.bin'), 'batch_file_1.bin missing from history');
    assert.ok(namesInHistory.includes('batch_file_2.bin'), 'batch_file_2.bin missing from history');
    console.log('[PASS] Test 11: Multi-file staged transfer & history recording verified');

    // Test 12: Delete single history item & clear history API
    const itemToDelete = histCheck.json[0];
    assert.ok(itemToDelete && itemToDelete.id, 'Expected history item to delete');
    const delItemRes = await makeRequest('DELETE', `/api/transfer/history/${itemToDelete.id}`);
    assert.strictEqual(delItemRes.status, 200);
    assert.strictEqual(delItemRes.json.success, true);

    const postDelHist = await makeRequest('GET', '/api/transfer/history');
    assert.strictEqual(postDelHist.status, 200);
    assert.strictEqual(postDelHist.json.some(h => h.id === itemToDelete.id), false, 'Deleted item still exists in history');

    // Clear all history
    const clearHistRes = await makeRequest('DELETE', '/api/transfer/history');
    assert.strictEqual(clearHistRes.status, 200);
    assert.strictEqual(clearHistRes.json.success, true);

    const emptyHist = await makeRequest('GET', '/api/transfer/history');
    assert.strictEqual(emptyHist.status, 200);
    assert.strictEqual(emptyHist.json.length, 0, 'History should be empty after clear');
    console.log('[PASS] Test 12: Delete single history item & clear history API verified');

    console.log('\n=================================================');
    console.log('🎉 ALL 12 TESTS PASSED WITH ZERO ERRORS!');
    console.log('=================================================');
  } finally {
    // Cleanup test artifacts
    server.close();
    try {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
      fs.rmSync(testTempDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

runTests().catch(err => {
  console.error('\n[FATAL] Test failed:', err);
  process.exit(1);
});
