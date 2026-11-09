// public/js/app.js - OmniDrop Main Frontend Application Controller
(function () {
  'use strict';

  function getOrCreateClientId() {
    let id = localStorage.getItem('omnidrop_clientId');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
      localStorage.setItem('omnidrop_clientId', id);
    }
    return id;
  }

  // State
  const state = {
    info: null,
    clientId: getOrCreateClientId(),
    deviceName: localStorage.getItem('omnidrop_deviceName') || '',
    deviceType: /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? 'android' : 'windows',
    selectedFiles: [],
    currentTransfer: null,
    stagedFiles: [],
    history: [],
    peers: [],
    discoveredPeers: [],
    pwaInstallPrompt: null,
    sentTransferIds: new Set(),
    isCurrentlySending: false,
    activeTransferId: null,
  };

  // Helper formatting
  const formatBytes = window.StreamSender.formatBytes;
  const formatDuration = window.StreamSender.formatDuration;

  // Instances
  const sender = new window.StreamSender();
  const receiver = new window.StreamReceiver();
  const bluetooth = new window.BluetoothManager();
  let qrScanner = null;

  // DOM Elements
  const el = {
    tabs: document.querySelectorAll('.nav-tab'),
    tabContents: document.querySelectorAll('.tab-content'),
    deviceNameInput: document.getElementById('deviceNameInput'),
    connectionPill: document.getElementById('connectionPill'),
    primaryIpBadge: document.getElementById('primaryIpBadge'),
    qrContainer: document.getElementById('qrContainer'),
    qrCodeImg: document.getElementById('qrCodeImg'),
    qrUrlText: document.getElementById('qrUrlText'),
    networkSelect: document.getElementById('networkSelect'),
    cameraModal: document.getElementById('cameraModal'),
    scannerVideo: document.getElementById('scannerVideo'),
    btnScanQR: document.getElementById('btnScanQR'),
    btnCloseCamera: document.getElementById('btnCloseCamera'),
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    fileQueueList: document.getElementById('fileQueueList'),
    queueCard: document.getElementById('queueCard'),
    queueTotalSize: document.getElementById('queueTotalSize'),
    queueCount: document.getElementById('queueCount'),
    btnClearQueue: document.getElementById('btnClearQueue'),
    btnSendFiles: document.getElementById('btnSendFiles'),
    peersRadar: document.getElementById('peersRadar'),
    noPeersPrompt: document.getElementById('noPeersPrompt'),
    transferModal: document.getElementById('transferModal'),
    transferDirectionBadge: document.getElementById('transferDirectionBadge'),
    transferPercentBadge: document.getElementById('transferPercentBadge'),
    transferTitle: document.getElementById('transferTitle'),
    transferFileName: document.getElementById('transferFileName'),
    transferProgressBar: document.getElementById('transferProgressBar'),
    transferPercent: document.getElementById('transferPercent'),
    transferBytesText: document.getElementById('transferBytesText'),
    transferRemainingText: document.getElementById('transferRemainingText'),
    transferSpeedText: document.getElementById('transferSpeedText'),
    transferEtaText: document.getElementById('transferEtaText'),
    btnPauseTransfer: document.getElementById('btnPauseTransfer'),
    btnCancelTransfer: document.getElementById('btnCancelTransfer'),
    requestModal: document.getElementById('requestModal'),
    requestSenderName: document.getElementById('requestSenderName'),
    requestFilesList: document.getElementById('requestFilesList'),
    requestTotalSize: document.getElementById('requestTotalSize'),
    btnAcceptRequest: document.getElementById('btnAcceptRequest'),
    btnRejectRequest: document.getElementById('btnRejectRequest'),
    cancelledModal: document.getElementById('cancelledModal'),
    cancelledTitle: document.getElementById('cancelledTitle'),
    cancelledMessage: document.getElementById('cancelledMessage'),
    btnCloseCancelledModal: document.getElementById('btnCloseCancelledModal'),
    offeredCard: document.getElementById('offeredCard'),
    offeredList: document.getElementById('offeredList'),
    clipboardInput: document.getElementById('clipboardInput'),
    btnSendClipboard: document.getElementById('btnSendClipboard'),
    clipboardHistory: document.getElementById('clipboardHistory'),
    historyList: document.getElementById('historyList'),
    btnClearHistory: document.getElementById('btnClearHistory'),
    btnOpenDownloadsFolder: document.getElementById('btnOpenDownloadsFolder'),
    mobileSavePathBadge: document.getElementById('mobileSavePathBadge'),
    pcDownloadsGroup: document.getElementById('pcDownloadsGroup'),
    mobileDownloadsGroup: document.getElementById('mobileDownloadsGroup'),
    btnLaunchBluetooth: document.getElementById('btnLaunchBluetooth'),
    btnOpenHotspot: document.getElementById('btnOpenHotspot'),
    btnOpenBtSettings: document.getElementById('btnOpenBtSettings'),
    btnWebBluetoothScan: document.getElementById('btnWebBluetoothScan'),
    bluetoothStatus: document.getElementById('bluetoothStatus'),
    autoAcceptToggle: document.getElementById('autoAcceptToggle'),
    downloadsDirInput: document.getElementById('downloadsDirInput'),
    btnSaveSettings: document.getElementById('btnSaveSettings'),
    btnInstallPwa: document.getElementById('btnInstallPwa'),
    themeToggle: document.getElementById('themeToggle'),
  };

  // Generate or restore friendly device name
  function initDeviceName() {
    if (!state.deviceName) {
      if (state.deviceType === 'android') {
        const brands = ['Galaxy S24', 'Pixel 9', 'OnePlus 12', 'Xiaomi 14', 'Android Phone'];
        state.deviceName = brands[Math.floor(Math.random() * brands.length)];
      } else {
        state.deviceName = 'Windows PC';
      }
      localStorage.setItem('omnidrop_deviceName', state.deviceName);
    }
    if (el.deviceNameInput) el.deviceNameInput.value = state.deviceName;
  }

  // Tab switching
  function initTabs() {
    el.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        el.tabs.forEach(t => t.classList.remove('active'));
        el.tabContents.forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const activeContent = document.getElementById(`tab-${target}`);
        if (activeContent) activeContent.classList.add('active');
        if (target === 'history') {
          loadHistory();
        }
      });
    });
  }

  // Load system info from server
  async function loadSystemInfo() {
    try {
      const res = await fetch('/api/info');
      if (!res.ok) throw new Error('Info request failed');
      const data = await res.json();
      state.info = data;

      if (el.primaryIpBadge) {
        el.primaryIpBadge.textContent = data.network.primary.address;
      }

      if (el.qrUrlText) {
        el.qrUrlText.textContent = data.network.primary.url;
      }

      // Populate network interface selector
      if (el.networkSelect) {
        el.networkSelect.innerHTML = '';
        data.network.all.forEach(net => {
          const opt = document.createElement('option');
          opt.value = net.url;
          opt.textContent = `${net.name} (${net.address}) - ${net.type.toUpperCase()}`;
          if (net.address === data.network.primary.address) opt.selected = true;
          el.networkSelect.appendChild(opt);
        });

        el.networkSelect.addEventListener('change', () => {
          updateQR(el.networkSelect.value);
        });
      }

      updateQR(data.network.primary.url);

      const isDesktop = state.deviceType === 'windows';
      if (el.pcDownloadsGroup) el.pcDownloadsGroup.style.display = isDesktop ? 'block' : 'none';
      if (el.mobileDownloadsGroup) el.mobileDownloadsGroup.style.display = isDesktop ? 'none' : 'block';
      if (el.mobileSavePathBadge) el.mobileSavePathBadge.style.display = isDesktop ? 'none' : 'block';

      // Only display the PC downloads path if this is a desktop client
      if (isDesktop && el.downloadsDirInput && data.config.downloadsDir) {
        el.downloadsDirInput.value = data.config.downloadsDir;
      }
      if (el.autoAcceptToggle) {
        el.autoAcceptToggle.checked = !!data.config.autoAccept;
      }

      updateDiscoveredPeers(data.discoveredPeers || []);
    } catch (err) {
      console.warn('System info load error:', err);
    }
  }

  // Update QR Code display
  function updateQR(targetUrl) {
    if (el.qrCodeImg) {
      el.qrCodeImg.src = `/api/qr?url=${encodeURIComponent(targetUrl)}`;
    }
    if (el.qrUrlText) {
      el.qrUrlText.textContent = targetUrl;
    }
  }

  // Update peers radar display
  function renderPeers() {
    if (!el.peersRadar) return;
    el.peersRadar.innerHTML = '';

    const allPeers = [...state.peers];
    // Filter out self
    const visiblePeers = allPeers.filter(p => p.id !== state.clientId);

    if (visiblePeers.length === 0) {
      if (el.noPeersPrompt) el.noPeersPrompt.style.display = 'block';
      return;
    }

    if (el.noPeersPrompt) el.noPeersPrompt.style.display = 'none';

    visiblePeers.forEach(peer => {
      const card = document.createElement('div');
      card.className = 'peer-card animate-fade';
      const icon = peer.type === 'android' ? '📱' : peer.type === 'windows' ? '💻' : '🌐';

      card.innerHTML = `
        <div class="peer-avatar">${icon}</div>
        <div class="peer-details">
          <div class="peer-name">${escapeHtml(peer.name)}</div>
          <div class="peer-meta">${escapeHtml(peer.type.toUpperCase())} &bull; ${peer.ip || 'Connected'}</div>
        </div>
        <button class="btn btn-sm btn-outline send-to-peer-btn" data-peer-id="${peer.id}">Send Files</button>
      `;

      card.querySelector('.send-to-peer-btn').addEventListener('click', () => {
        if (state.selectedFiles.length === 0) {
          el.fileInput.click();
        } else {
          startUpload(peer.id);
        }
      });

      el.peersRadar.appendChild(card);
    });
  }

  function updateDiscoveredPeers(devices) {
    state.discoveredPeers = devices;
  }

  // File selection & Drag-and-drop
  function initFileHandling() {
    if (!el.dropZone || !el.fileInput) return;

    ['dragenter', 'dragover'].forEach(eventName => {
      window.addEventListener(eventName, e => {
        e.preventDefault();
        el.dropZone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      window.addEventListener(eventName, e => {
        e.preventDefault();
        el.dropZone.classList.remove('drag-active');
      });
    });

    window.addEventListener('drop', e => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        addFilesToQueue(Array.from(e.dataTransfer.files));
      }
    });

    el.dropZone.addEventListener('click', () => {
      el.fileInput.click();
    });

    el.fileInput.addEventListener('change', () => {
      if (el.fileInput.files && el.fileInput.files.length > 0) {
        addFilesToQueue(Array.from(el.fileInput.files));
        el.fileInput.value = ''; // Reset so same file can be selected again
      }
    });

    if (el.btnClearQueue) {
      el.btnClearQueue.addEventListener('click', () => {
        state.selectedFiles = [];
        renderQueue();
      });
    }

    if (el.btnSendFiles) {
      el.btnSendFiles.addEventListener('click', () => {
        startUpload();
      });
    }
  }

  function addFilesToQueue(files) {
    state.selectedFiles.push(...files);
    renderQueue();
  }

  function renderQueue() {
    if (!el.fileQueueList || !el.queueCard) return;

    if (state.selectedFiles.length === 0) {
      el.queueCard.style.display = 'none';
      return;
    }

    el.queueCard.style.display = 'block';
    el.fileQueueList.innerHTML = '';

    const totalBytes = state.selectedFiles.reduce((acc, f) => acc + f.size, 0);
    if (el.queueTotalSize) el.queueTotalSize.textContent = formatBytes(totalBytes);
    if (el.queueCount) el.queueCount.textContent = `${state.selectedFiles.length} file${state.selectedFiles.length > 1 ? 's' : ''}`;

    state.selectedFiles.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'queue-item';
      item.innerHTML = `
        <div class="queue-item-icon">📄</div>
        <div class="queue-item-info">
          <div class="queue-item-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
          <div class="queue-item-size">${formatBytes(file.size)}</div>
        </div>
        <button class="btn-icon remove-file-btn" data-index="${index}" title="Remove file">&times;</button>
      `;

      item.querySelector('.remove-file-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        state.selectedFiles.splice(index, 1);
        renderQueue();
      });

      el.fileQueueList.appendChild(item);
    });
  }

  // Upload Process (Streaming chunks for files of ANY size)
  async function startUpload(targetPeerId = null) {
    if (state.selectedFiles.length === 0) return;

    // If target not explicitly set, auto-target the remote connected peer (e.g. phone)
    if (!targetPeerId && state.peers && state.peers.length > 0) {
      const remotePeer = state.peers.find(p => p.id !== state.clientId);
      if (remotePeer) targetPeerId = remotePeer.id;
    }

    const isDesktop = state.deviceType === 'windows';
    const isStaged = isDesktop; // When PC sends to phone, stage file so phone downloads it directly!

    try {
      state.isCurrentlySending = true;
      state.activeTransferId = null;

      // Keep snapshot of files being uploaded
      const filesToUpload = [...state.selectedFiles];

      // Step 1: Initiate transfer metadata handshake session
      const session = await sender.initiateTransfer(
        state.deviceName,
        filesToUpload,
        targetPeerId,
        state.clientId,
        isStaged,
        state.deviceType
      );
      const transferId = session.transferId;
      state.sentTransferIds.add(transferId);
      state.activeTransferId = transferId;

      receiver.acquireWakeLock(); // Prevent sleep during transfer

      // Wire cancel button directly to active transfer
      if (el.btnCancelTransfer) {
        el.btnCancelTransfer.onclick = cancelActiveTransfer;
      }

      // Step 2: WAIT FOR RECIPIENT TO ACCEPT OR DECLINE (Before any file chunks are transmitted)
      if (!session.autoAccepted) {
        showTransferModal(
          'Waiting for Recipient...',
          `Waiting for ${targetPeerId ? 'recipient' : 'peer device'} to accept ${filesToUpload.length} file(s)...`,
          '⏳ Waiting'
        );
        updateTransferModalStatus(
          '⏳ Waiting',
          'Waiting for approval...',
          filesToUpload[0]?.name || 'file',
          0,
          0,
          filesToUpload.reduce((a, b) => a + (b.size || 0), 0),
          'Awaiting response...',
          '--:--'
        );

        await new Promise((resolve, reject) => {
          let timer;
          const onAccepted = (data) => {
            if (data.transferId === transferId) {
              cleanup();
              resolve(data);
            }
          };
          const onRejected = (data) => {
            if (data.transferId === transferId) {
              cleanup();
              reject(new Error(data.declinedByName ? `Transfer was declined by ${data.declinedByName}` : 'Transfer declined by recipient'));
            }
          };
          const onCancelled = (data) => {
            if (data.transferId === transferId) {
              cleanup();
              reject(new Error('Transfer cancelled.'));
            }
          };
          const cleanup = () => {
            clearTimeout(timer);
            receiver.off('TRANSFER_ACCEPTED', onAccepted);
            receiver.off('TRANSFER_REJECTED', onRejected);
            receiver.off('TRANSFER_CANCELLED', onCancelled);
          };

          timer = setTimeout(() => {
            cleanup();
            reject(new Error('Transfer request timed out waiting for approval'));
          }, 180000); // 3 minutes timeout

          receiver.on('TRANSFER_ACCEPTED', onAccepted);
          receiver.on('TRANSFER_REJECTED', onRejected);
          receiver.on('TRANSFER_CANCELLED', onCancelled);
        });
      }

      // Step 3: Recipient accepted! Now start uploading/staging file chunks
      showTransferModal('Sending Files...', 'Starting transfer...', '📤 Sending');

      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        const meta = session.files[i];

        updateTransferModalStatus(
          '📤 Sending',
          isStaged ? `Preparing ${file.name} (${i + 1}/${filesToUpload.length})...` : `Sending File ${i + 1} of ${filesToUpload.length}`,
          file.name,
          0,
          0,
          file.size,
          'Preparing...',
          '--:--'
        );

        // Upload chunk stream
        // For Phone -> PC (!isStaged): update progress directly from chunk upload.
        // For PC -> Phone (isStaged): local staging runs silently at SSD speed without UI flashing;
        // the single unified 0-100% progress bar is driven exclusively by the real Wi-Fi transfer.
        await sender.uploadFile(transferId, file, meta, isStaged ? () => {} : (progress) => {
          updateTransferModalStatus(
            '📤 Sending',
            `Sending File ${i + 1} of ${filesToUpload.length}`,
            progress.fileName,
            progress.percent,
            progress.bytesReceived,
            progress.totalBytes,
            progress.speedStr,
            progress.etaStr
          );
        }, isStaged);

        // If staged on PC for Mobile Phone download, wait for phone to finish downloading this file before staging next!
        if (isStaged) {
          updateTransferModalStatus(
            '📤 Sending',
            `Sending ${file.name} (${i + 1}/${filesToUpload.length})...`,
            file.name,
            0,
            0,
            file.size,
            'Connecting to mobile phone...',
            '--:--'
          );

          await new Promise((resolve, reject) => {
            let timeoutId;
            const onFileComplete = (data) => {
              if (data.transferId === transferId && (data.fileId === meta.id || data.fileName === file.name)) {
                cleanup();
                resolve();
              }
            };
            const onCancelled = (data) => {
              if (data.transferId === transferId) {
                cleanup();
                reject(new Error('Transfer cancelled.'));
              }
            };
            const onRejected = (data) => {
              if (data.transferId === transferId) {
                cleanup();
                reject(new Error('Transfer declined.'));
              }
            };
            const cleanup = () => {
              clearTimeout(timeoutId);
              receiver.off('TRANSFER_COMPLETE', onFileComplete);
              receiver.off('TRANSFER_CANCELLED', onCancelled);
              receiver.off('TRANSFER_REJECTED', onRejected);
            };

            timeoutId = setTimeout(() => {
              cleanup();
              resolve();
            }, 600000); // 10 min timeout per file

            receiver.on('TRANSFER_COMPLETE', onFileComplete);
            receiver.on('TRANSFER_CANCELLED', onCancelled);
            receiver.on('TRANSFER_REJECTED', onRejected);
          });
        }

        // Remove delivered file from send queue dynamically
        const qIdx = state.selectedFiles.indexOf(file);
        if (qIdx !== -1) {
          state.selectedFiles.splice(qIdx, 1);
          renderQueue();
        }
      }

      receiver.playSound('success');
      hideTransferModal();
      receiver.releaseWakeLock();

      state.selectedFiles = [];
      state.activeTransferId = null;
      renderQueue();
      loadHistory();
      showToast(isStaged ? 'Files sent successfully to mobile phone!' : 'Files sent successfully to PC!', 'success');
    } catch (err) {
      console.error('Upload error:', err);
      receiver.releaseWakeLock();
      hideTransferModal();
      state.activeTransferId = null;
      state.selectedFiles = [];
      renderQueue();
      if (!err.message.includes('cancelled') && !err.message.includes('declined') && !err.message.includes('Declined')) {
        showToast('Upload error: ' + err.message, 'error');
      }
    } finally {
      state.isCurrentlySending = false;
    }
  }

  // Cancel Active Transfer
  async function cancelActiveTransfer() {
    const tId = state.activeTransferId;
    activeDownloadQueue = null;
    hideTransferModal();
    receiver.releaseWakeLock();
    state.selectedFiles = [];
    renderQueue();

    if (tId) {
      try {
        await fetch('/api/transfer/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transferId: tId,
            cancelledByName: state.deviceName,
          }),
        });
      } catch (e) {}

      sender.cancel(tId);
      state.activeTransferId = null;
    }

    showToast('You cancelled the transfer.', 'warning');
  }

  // Show prominent cancellation / declination modal to inform user
  function showCancelledAlertModal(canceller, fileInfo = '', type = 'cancelled') {
    if (!el.cancelledModal) return;
    if (type === 'declined') {
      if (el.cancelledTitle) el.cancelledTitle.textContent = 'Transfer Declined';
      if (el.cancelledMessage) {
        el.cancelledMessage.textContent = `${canceller} declined the transfer request${fileInfo}.`;
      }
    } else {
      if (el.cancelledTitle) el.cancelledTitle.textContent = 'Transfer Cancelled';
      if (el.cancelledMessage) {
        el.cancelledMessage.textContent = `The transfer was cancelled by ${canceller}${fileInfo}.`;
      }
    }
    el.cancelledModal.classList.add('active');
  }

  // Transfer Modal UI Controls
  function showTransferModal(title, fileName, direction = '📤 Uploading') {
    if (!el.transferModal) return;
    if (el.transferDirectionBadge) el.transferDirectionBadge.textContent = direction;
    el.transferTitle.textContent = title;
    el.transferFileName.textContent = fileName;
    el.transferProgressBar.style.width = '0%';
    if (el.transferPercentBadge) el.transferPercentBadge.textContent = '0%';
    el.transferBytesText.textContent = '0 B';
    if (el.transferRemainingText) el.transferRemainingText.textContent = '--';
    el.transferSpeedText.textContent = 'Calculating...';
    el.transferEtaText.textContent = '--:--';
    el.transferModal.classList.add('active');
  }

  function updateTransferModalStatus(direction, title, fileName, percent, bytesTransferred, totalBytes, speedStr, etaStr) {
    if (!el.transferModal) return;
    if (el.transferDirectionBadge) el.transferDirectionBadge.textContent = direction || '📤 Uploading';
    el.transferTitle.textContent = title;
    el.transferFileName.textContent = fileName;
    el.transferProgressBar.style.width = `${percent}%`;
    if (el.transferPercentBadge) el.transferPercentBadge.textContent = `${percent}%`;

    // Transferred text
    el.transferBytesText.textContent = `${formatBytes(bytesTransferred)} of ${formatBytes(totalBytes)}`;

    // Remaining Left text!
    const remainingBytes = Math.max(0, totalBytes - bytesTransferred);
    if (el.transferRemainingText) {
      el.transferRemainingText.textContent = `${formatBytes(remainingBytes)} left`;
    }

    el.transferSpeedText.textContent = speedStr || '0 MB/s';
    el.transferEtaText.textContent = etaStr || '--:--';
  }

  function hideTransferModal() {
    if (el.transferModal) el.transferModal.classList.remove('active');
  }

  // Incoming Transfer Request Approval Modal
  let pendingTransferId = null;
  let pendingTransferData = null;
  const handledTransferIds = new Set(); // Prevent duplicate popups from SSE reconnects

  function handleIncomingRequest(data) {
    // Multi-layer shield: Never show incoming prompt to sender or inappropriate device type
    if (state.sentTransferIds.has(data.transferId)) return;
    if (data.senderId && data.senderId === state.clientId) return;
    if (state.isCurrentlySending) return;
    if (data.senderName && state.deviceName && data.senderName.trim().toLowerCase() === state.deviceName.trim().toLowerCase()) return;
    if (data.direction === 'pc_to_phone' && state.deviceType === 'windows') return;
    if (data.direction === 'phone_to_pc' && state.deviceType === 'android') return;
    if (state.deviceType === 'windows' && (!data.direction || data.direction === 'pc_to_phone')) return;
    // Deduplication: ignore if we've already shown a popup for this exact transferId
    if (handledTransferIds.has(data.transferId)) return;
    handledTransferIds.add(data.transferId);

    pendingTransferData = data;
    pendingTransferId = data.transferId;
    receiver.playSound('alert');

    if (el.requestSenderName) el.requestSenderName.textContent = data.senderName;
    if (el.requestTotalSize) el.requestTotalSize.textContent = formatBytes(data.totalBytes);

    if (el.requestFilesList) {
      el.requestFilesList.innerHTML = '';
      data.files.forEach(f => {
        const row = document.createElement('div');
        row.className = 'request-file-item';
        row.innerHTML = `<span>${escapeHtml(f.name)}</span> <strong>${formatBytes(f.size)}</strong>`;
        el.requestFilesList.appendChild(row);
      });
    }

    if (el.requestModal) el.requestModal.classList.add('active');
  }

  let activeDownloadQueue = null;

  function startSequentialDownload(transferId, files) {
    activeDownloadQueue = {
      transferId,
      files: [...files],
      currentIndex: 0,
    };
    triggerNextSequentialDownload();
  }

  function triggerNextSequentialDownload() {
    if (!activeDownloadQueue) return;
    if (activeDownloadQueue.currentIndex >= activeDownloadQueue.files.length) {
      activeDownloadQueue = null;
      hideTransferModal();
      state.activeTransferId = null;
      loadHistory();
      return;
    }

    const currentFile = activeDownloadQueue.files[activeDownloadQueue.currentIndex];
    const tId = activeDownloadQueue.transferId;
    const fileNum = activeDownloadQueue.currentIndex + 1;
    const totalCount = activeDownloadQueue.files.length;

    showTransferModal(
      `Downloading File (${fileNum}/${totalCount})...`,
      currentFile.name,
      '📥 Downloading'
    );

    const downloadUrl = currentFile.downloadUrl || `/api/transfer/download/${tId}/${currentFile.id}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = currentFile.name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 2500);
  }

  async function approvePendingRequest(accepted) {
    if (!pendingTransferData) return;
    const currentTransfer = pendingTransferData;
    const tId = currentTransfer.transferId;
    pendingTransferData = null;
    pendingTransferId = null;

    if (el.requestModal) el.requestModal.classList.remove('active');

    if (!accepted) {
      try {
        await fetch('/api/transfer/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transferId: tId,
            accepted: false,
            peerName: state.deviceName,
          }),
        });
      } catch (e) {}
      showToast('You declined the incoming transfer.', 'info');
      return;
    }

    state.activeTransferId = tId;

    try {
      await fetch('/api/transfer/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transferId: tId,
          accepted: true,
          peerName: state.deviceName,
        }),
      });
    } catch (e) {}

    // Show receiving modal at 0%
    showTransferModal(
      'Receiving Files...',
      currentTransfer.files[0]?.name || 'Incoming file',
      '📥 Receiving'
    );
    updateTransferModalStatus(
      '📥 Receiving',
      'Waiting for sender to start upload...',
      currentTransfer.files[0]?.name || 'file',
      0,
      0,
      currentTransfer.totalBytes || 0,
      'Connecting...',
      '--:--'
    );
  }

  // Real-time SSE Listeners
  function initSSE() {
    receiver.connect(state.deviceName, state.deviceType, state.clientId);

    receiver.on('CONNECTED', data => {
      if (data.clientId) {
        state.clientId = data.clientId;
        localStorage.setItem('omnidrop_clientId', data.clientId);
      }
      if (el.connectionPill) {
        el.connectionPill.textContent = 'Online';
        el.connectionPill.className = 'badge badge-success';
      }
    });

    receiver.on('DISCONNECTED', () => {
      if (el.connectionPill) {
        el.connectionPill.textContent = 'Reconnecting...';
        el.connectionPill.className = 'badge badge-warning';
      }
    });

    receiver.on('PEERS_UPDATE', data => {
      state.peers = data.peers || [];
      renderPeers();
    });

    receiver.on('DISCOVERED_PEER', data => {
      // Beacon from nearby device
    });

    receiver.on('TRANSFER_REQUEST', data => {
      // Multi-layer shield: Never show incoming prompt to sender or inappropriate device type
      if (state.sentTransferIds.has(data.transferId)) return;
      if (data.senderId && data.senderId === state.clientId) return;
      if (state.isCurrentlySending) return;
      if (data.senderName && state.deviceName && data.senderName.trim().toLowerCase() === state.deviceName.trim().toLowerCase()) return;
      if (data.direction === 'pc_to_phone' && state.deviceType === 'windows') return;
      if (data.direction === 'phone_to_pc' && state.deviceType === 'android') return;
      if (state.deviceType === 'windows' && (!data.direction || data.direction === 'pc_to_phone')) return;

      handleIncomingRequest(data);
    });

    receiver.on('FILE_READY_FOR_DOWNLOAD', data => {
      // Receiver downloads this staged file from the PC
      if (state.sentTransferIds.has(data.transferId)) return;
      if (state.isCurrentlySending) return;
      if (state.deviceType === 'windows') return;

      state.activeTransferId = data.transferId;
      showTransferModal(
        'Downloading File...',
        data.fileName,
        '📥 Downloading'
      );

      // Trigger automatic browser download
      const a = document.createElement('a');
      a.href = data.downloadUrl;
      a.download = data.fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 2500);
    });

    // Monotonic progress tracker: bytesReceived must only ever increase per transfer
    const progressHighWater = new Map(); // transferId -> max bytesReceived seen

    receiver.on('TRANSFER_PROGRESS', data => {
      // Per-file monotonic clamp so progress never regresses or conflicts between batch files
      const progressKey = `${data.transferId}_${data.fileId || data.fileName}`;
      const prevHigh = progressHighWater.get(progressKey) || 0;
      const currentBytes = data.bytesReceived || 0;
      if (currentBytes < prevHigh) return;
      progressHighWater.set(progressKey, currentBytes);

      const percent = Math.min(100, ((currentBytes || 0) / (data.fileSize || 1)) * 100).toFixed(1);

      // If PC sender is sending to phone, show live Wi-Fi transmission progress
      if (state.isCurrentlySending && data.transferId === state.activeTransferId) {
        updateTransferModalStatus(
          '📤 Sending',
          'Sending to mobile phone...',
          data.fileName,
          percent,
          currentBytes,
          data.fileSize,
          `${formatBytes(data.speed)}/s`,
          formatDuration(data.eta)
        );
        return;
      }

      if (!el.transferModal.classList.contains('active')) {
        showTransferModal('Receiving File...', data.fileName, '📥 Downloading');
      }
      state.activeTransferId = data.transferId;
      updateTransferModalStatus(
        '📥 Downloading',
        'Receiving File...',
        data.fileName,
        percent,
        currentBytes,
        data.fileSize,
        `${formatBytes(data.speed)}/s`,
        formatDuration(data.eta)
      );
    });

    receiver.on('TRANSFER_CANCELLED', data => {
      // Both ends see a prominent alert when anyone cancels
      activeDownloadQueue = null;
      sender.cancel(data.transferId);
      hideTransferModal();
      if (el.requestModal) el.requestModal.classList.remove('active');
      receiver.releaseWakeLock();
      receiver.playSound('alert');

      state.selectedFiles = [];
      renderQueue();

      const fileInfo = data.files && data.files.length > 0 ? ` ("${data.files[0]}")` : '';
      const canceller = data.cancelledByName || 'Peer Device';

      showToast(`⚠️ Transfer was cancelled by ${canceller}!`, 'error');
      showCancelledAlertModal(canceller, fileInfo, 'cancelled');
      state.activeTransferId = null;
    });

    receiver.on('TRANSFER_REJECTED', data => {
      // Notified when receiver declines the transfer request
      activeDownloadQueue = null;
      sender.cancel(data.transferId);
      hideTransferModal();
      receiver.releaseWakeLock();
      receiver.playSound('alert');

      state.selectedFiles = [];
      renderQueue();

      const decliner = data.declinedByName || 'Peer Device';
      showToast(`❌ Transfer request was declined by ${decliner}!`, 'error');
      showCancelledAlertModal(decliner, '', 'declined');
      state.activeTransferId = null;
    });

    receiver.on('TRANSFER_COMPLETE', data => {
      receiver.playSound('success');
      loadHistory();

      const isDesktop = state.deviceType === 'windows';
      if (state.isCurrentlySending || state.sentTransferIds.has(data.transferId)) {
        showToast(`Sent ${data.fileName} successfully!`, 'success');
      } else {
        const destHint = isDesktop ? '' : ' (saved to Downloads folder)';
        showToast(`Received: ${data.fileName} (${formatBytes(data.size || data.fileSize)})${destHint}!`, 'success');
        hideTransferModal();
        state.activeTransferId = null;
      }
    });

    receiver.on('ALL_TRANSFERS_COMPLETE', data => {
      hideTransferModal();
      state.activeTransferId = null;
      loadHistory();
      if (!state.isCurrentlySending && !state.sentTransferIds.has(data.transferId)) {
        showToast('All files received successfully!', 'success');
      }
    });

    receiver.on('FILES_OFFERED', data => {
      // Windows PC staged files for phone to download
      receiver.playSound('alert');
      renderOfferedFiles(data.files || []);
    });

    receiver.on('CLIPBOARD_RECEIVED', data => {
      receiver.playSound('alert');
      addClipboardItem(data.text, data.senderName, data.timestamp);
      showToast(`Clipboard text received from ${data.senderName}`);
    });
  }

  // Offered Files (PC to Phone)
  function renderOfferedFiles(files) {
    if (!el.offeredCard || !el.offeredList) return;
    if (files.length === 0) {
      el.offeredCard.style.display = 'none';
      return;
    }

    el.offeredCard.style.display = 'block';
    el.offeredList.innerHTML = '';

    files.forEach(file => {
      const item = document.createElement('div');
      item.className = 'offered-file-item';
      item.innerHTML = `
        <div class="offered-info">
          <div class="offered-name">${escapeHtml(file.name)}</div>
          <div class="offered-size">${formatBytes(file.size)}</div>
        </div>
        <a href="${file.url}" download="${escapeHtml(file.name)}" class="btn btn-sm btn-primary">Download</a>
      `;
      el.offeredList.appendChild(item);
    });
  }

  // Clipboard Sharing
  function initClipboard() {
    if (el.btnSendClipboard && el.clipboardInput) {
      el.btnSendClipboard.addEventListener('click', async () => {
        const text = el.clipboardInput.value.trim();
        if (!text) return;

        try {
          await fetch('/api/clipboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, senderName: state.deviceName }),
          });
          el.clipboardInput.value = '';
          addClipboardItem(text, 'You', Date.now());
          showToast('Text shared with all devices!');
        } catch (e) {
          showToast('Failed to share text', 'error');
        }
      });
    }
  }

  function addClipboardItem(text, sender, timestamp) {
    if (!el.clipboardHistory) return;
    const item = document.createElement('div');
    item.className = 'clipboard-item animate-fade';
    item.innerHTML = `
      <div class="clipboard-meta">
        <strong>${escapeHtml(sender)}</strong> &bull; ${new Date(timestamp).toLocaleTimeString()}
      </div>
      <div class="clipboard-content">${escapeHtml(text)}</div>
      <button class="btn btn-sm btn-outline copy-text-btn">Copy</button>
    `;

    item.querySelector('.copy-text-btn').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!');
      } catch (e) {
        showToast('Could not copy', 'error');
      }
    });

    el.clipboardHistory.prepend(item);
  }

  // History
  async function loadHistory() {
    try {
      const res = await fetch('/api/transfer/history');
      if (!res.ok) return;
      const history = await res.json();
      state.history = history;
      renderHistory();
    } catch (e) {}
  }

  function renderHistory() {
    if (!el.historyList) return;
    el.historyList.innerHTML = '';

    const isDesktop = state.deviceType === 'windows';

    // On mobile, hide the "Open Downloads Folder" button that controls Windows File Explorer
    if (el.btnOpenDownloadsFolder) {
      el.btnOpenDownloadsFolder.style.display = isDesktop ? 'inline-flex' : 'none';
    }
    if (el.mobileSavePathBadge) {
      el.mobileSavePathBadge.style.display = isDesktop ? 'none' : 'block';
    }

    if (state.history.length === 0) {
      el.historyList.innerHTML = '<div class="empty-state">No transfer history yet.</div>';
      return;
    }

    state.history.forEach(item => {
      const row = document.createElement('div');
      row.className = 'history-item';
      const isReceived = item.type === 'received';
      const icon = isReceived ? '📥' : '📤';

      let actionBtnHtml = '';
      if (isDesktop && item.savedPath) {
        // Desktop user can highlight the file in Windows File Explorer
        actionBtnHtml = `<button class="btn btn-sm btn-outline open-file-btn" data-path="${escapeHtml(item.savedPath)}">📂 Show in Folder</button>`;
      } else if (!isDesktop && item.savedPath) {
        // Mobile user gets a direct download/save button for their phone!
        const downloadUrl = `/api/transfer/file/${encodeURIComponent(item.name)}`;
        actionBtnHtml = `<a href="${downloadUrl}" download="${escapeHtml(item.name)}" class="btn btn-sm btn-primary">⬇️ Save to Phone</a>`;
      }

      const directionLabel = isReceived
        ? `Received from ${escapeHtml(item.sender || 'Peer Device')}`
        : `Sent to ${escapeHtml(item.recipient || 'Mobile Phone')}`;

      row.innerHTML = `
        <div class="history-icon">${icon}</div>
        <div class="history-details">
          <div class="history-name">${escapeHtml(item.name)}</div>
          <div class="history-meta">
            ${directionLabel} &bull; ${formatBytes(item.size)} &bull; ${item.avgSpeed ? formatBytes(item.avgSpeed) + '/s &bull; ' : ''}${new Date(item.timestamp).toLocaleTimeString()}
          </div>
        </div>
        <div class="history-actions" style="display: flex; gap: 8px; align-items: center;">
          ${actionBtnHtml}
          <button class="btn btn-sm btn-outline delete-history-item-btn" data-id="${item.id}" title="Delete from history" style="color: var(--danger, #ef4444); border-color: rgba(239, 68, 68, 0.3); padding: 4px 8px;">
            🗑️
          </button>
        </div>
      `;

      // Only desktop attaches the local Explorer launcher
      if (isDesktop) {
        const openBtn = row.querySelector('.open-file-btn');
        if (openBtn) {
          openBtn.addEventListener('click', () => {
            fetch('/api/system/open-folder', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: item.savedPath }),
            });
          });
        }
      }

      // Single item deletion
      const delBtn = row.querySelector('.delete-history-item-btn');
      if (delBtn) {
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = delBtn.dataset.id;
          try {
            await fetch(`/api/transfer/history/${id}`, { method: 'DELETE' });
            state.history = state.history.filter(h => h.id !== id);
            renderHistory();
            showToast('Item removed from history', 'info');
          } catch (err) {
            showToast('Failed to delete history item', 'error');
          }
        });
      }

      el.historyList.appendChild(row);
    });
  }

  function initHistory() {
    if (el.btnClearHistory) {
      el.btnClearHistory.addEventListener('click', async () => {
        if (!state.history || state.history.length === 0) {
          showToast('History is already empty', 'info');
          return;
        }
        if (!confirm('Are you sure you want to clear all transfer history?')) return;
        try {
          const res = await fetch('/api/transfer/history', { method: 'DELETE' });
          if (res.ok) {
            state.history = [];
            renderHistory();
            showToast('Transfer history cleared', 'success');
          } else {
            showToast('Failed to clear history', 'error');
          }
        } catch (err) {
          showToast('Failed to clear history', 'error');
        }
      });
    }
  }

  // Bluetooth & Hotspot integrations
  function initBluetoothAndHotspot() {
    const isDesktop = state.deviceType === 'windows';

    if (el.btnLaunchBluetooth) {
      el.btnLaunchBluetooth.addEventListener('click', async () => {
        if (!isDesktop) {
          showToast('On Android, open your phone Settings > Bluetooth to pair.', 'info');
          return;
        }
        try {
          const res = await bluetooth.launchWindowsBluetoothTransfer();
          showToast(res.message || 'Bluetooth transfer launched!');
        } catch (e) {
          showToast('Failed to launch Bluetooth: ' + e.message, 'error');
        }
      });
    }

    if (el.btnOpenHotspot) {
      el.btnOpenHotspot.addEventListener('click', async () => {
        if (!isDesktop) {
          showToast('On Android, open Settings > Hotspot to turn on Wi-Fi hotspot.', 'info');
          return;
        }
        try {
          await bluetooth.openHotspotSettings();
        } catch (e) {}
      });
    }

    if (el.btnOpenBtSettings) {
      el.btnOpenBtSettings.addEventListener('click', async () => {
        if (!isDesktop) {
          showToast('On Android, open Settings > Bluetooth.', 'info');
          return;
        }
        try {
          await bluetooth.openBluetoothSettings();
        } catch (e) {}
      });
    }

    if (el.btnWebBluetoothScan) {
      el.btnWebBluetoothScan.addEventListener('click', async () => {
        try {
          el.bluetoothStatus.textContent = 'Scanning for Bluetooth devices...';
          const dev = await bluetooth.requestDevice();
          if (dev) {
            el.bluetoothStatus.innerHTML = `<span class="badge badge-success">Paired: ${escapeHtml(dev.name)}</span>`;
          } else {
            el.bluetoothStatus.textContent = 'Scan cancelled.';
          }
        } catch (err) {
          el.bluetoothStatus.textContent = 'Bluetooth error: ' + err.message;
        }
      });
    }

    if (el.btnOpenDownloadsFolder) {
      el.btnOpenDownloadsFolder.addEventListener('click', () => {
        fetch('/api/system/open-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      });
    }
  }

  // Camera QR Scanner (Mobile)
  function initQRScanner() {
    if (!el.btnScanQR || !el.scannerVideo || !el.cameraModal) return;

    qrScanner = new window.QRScanner(el.scannerVideo, scannedUrl => {
      if (el.cameraModal) el.cameraModal.classList.remove('active');
      showToast('Scanned PC QR Code! Connecting...');
      if (scannedUrl.startsWith('http')) {
        window.location.href = scannedUrl;
      }
    });

    el.btnScanQR.addEventListener('click', async () => {
      try {
        el.cameraModal.classList.add('active');
        await qrScanner.start();
      } catch (err) {
        el.cameraModal.classList.remove('active');
        showToast('Camera permission denied or camera not found', 'error');
      }
    });

    if (el.btnCloseCamera) {
      el.btnCloseCamera.addEventListener('click', () => {
        if (qrScanner) qrScanner.stop();
        el.cameraModal.classList.remove('active');
      });
    }
  }

  // Settings
  function initSettings() {
    if (el.deviceNameInput) {
      el.deviceNameInput.addEventListener('change', () => {
        state.deviceName = el.deviceNameInput.value.trim() || 'Device';
        localStorage.setItem('omnidrop_deviceName', state.deviceName);
        if (state.clientId) {
          fetch('/api/peers/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: state.clientId, name: state.deviceName }),
          });
        }
        showToast('Device name updated');
      });
    }

    if (el.btnSaveSettings) {
      el.btnSaveSettings.addEventListener('click', async () => {
        const isDesktop = state.deviceType === 'windows';
        try {
          const payload = {
            autoAccept: el.autoAcceptToggle ? el.autoAcceptToggle.checked : false,
          };
          // Only desktop PC sets the server downloads directory
          if (isDesktop && el.downloadsDirInput) {
            payload.downloadsDir = el.downloadsDirInput.value.trim();
          }

          const res = await fetch('/api/system/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (res.ok) showToast('Settings saved successfully!');
        } catch (e) {
          showToast('Failed to save settings', 'error');
        }
      });
    }

    if (el.btnAcceptRequest) {
      el.btnAcceptRequest.addEventListener('click', () => approvePendingRequest(true));
    }
    if (el.btnRejectRequest) {
      el.btnRejectRequest.addEventListener('click', () => approvePendingRequest(false));
    }
    if (el.btnCloseCancelledModal && el.cancelledModal) {
      el.btnCloseCancelledModal.addEventListener('click', () => {
        el.cancelledModal.classList.remove('active');
      });
    }
    if (el.btnCancelTransfer) {
      el.btnCancelTransfer.addEventListener('click', cancelActiveTransfer);
    }
  }

  // PWA Install prompt
  function initPWA() {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      state.pwaInstallPrompt = e;
      if (el.btnInstallPwa) el.btnInstallPwa.style.display = 'inline-flex';
    });

    if (el.btnInstallPwa) {
      el.btnInstallPwa.addEventListener('click', async () => {
        if (state.pwaInstallPrompt) {
          state.pwaInstallPrompt.prompt();
          const choice = await state.pwaInstallPrompt.userChoice;
          if (choice.outcome === 'accepted') {
            el.btnInstallPwa.style.display = 'none';
          }
          state.pwaInstallPrompt = null;
        }
      });
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }

  // Toast Notification
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type} animate-slide-up`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast-hide');
      setTimeout(() => toast.remove(), 400);
    }, 3200);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Boot
  document.addEventListener('DOMContentLoaded', () => {
    initDeviceName();
    initTabs();
    initFileHandling();
    initSSE();
    initClipboard();
    initBluetoothAndHotspot();
    initQRScanner();
    initSettings();
    initPWA();
    initHistory();
    loadSystemInfo();
    loadHistory();
  });
})();
