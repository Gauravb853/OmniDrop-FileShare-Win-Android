# ⚡ OmniDrop

> **High-speed, bi-directional, zero-friction file transfer suite between Android and Windows.**  
> Transfer **any file size** (photos, 4K videos, APKs, 100+ GB disk images) over **Local Wi-Fi**, **Direct Mobile Hotspot**, or **Bluetooth** — with **zero third-party dependencies**.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Dependencies: Zero](https://img.shields.io/badge/Dependencies-Zero%20(Pure%20Node.js)-success.svg)](package.json)
[![Platform: Windows & Android](https://img.shields.io/badge/Platform-Windows%20%7C%20Android-informational.svg)]()
[![PWA Ready](https://img.shields.io/badge/PWA-Installable%20on%20Android-blueviolet.svg)]()
[![Tests: Passing](https://img.shields.io/badge/Tests-12%20Passed%20%2F%200%20Failed-success.svg)]()

---

## 📖 Table of Contents
- [Why OmniDrop?](#-why-omnidrop)
- [Key Features](#-key-features)
- [Project Structure](#-project-structure)
- [Quick Start](#-quick-start)
  - [1. Launch on Windows](#1-launch-on-windows)
  - [2. Connect from Android](#2-connect-from-android)
- [How to Transfer](#-how-to-transfer)
  - [Sending from Android ➔ Windows](#sending-from-android--windows)
  - [Sending from Windows ➔ Android](#sending-from-windows--android)
  - [Direct Hotspot Mode (No Internet / Traveling)](#direct-hotspot-mode-no-internet--traveling)
  - [Bluetooth Transfer](#bluetooth-transfer)
- [Security & Acceptance Flow](#-security--acceptance-flow)
- [Clipboard Sharing](#-clipboard-sharing)
- [Firewall Configuration](#-firewall-configuration)
- [Automated Testing](#-automated-testing)
- [License](#-license)

---

## 💡 Why OmniDrop?

Most file transfer apps either require cloud accounts, bombard you with ads, compress your photos/videos, or fail on multi-gigabyte files. 

**OmniDrop** is designed with Unix philosophy:
1. **Zero External Dependencies**: Built entirely with pure Node.js standard libraries (`node:http`, `node:fs`, `node:crypto`, `node:dgram`, `node:child_process`). No bloated `node_modules` vulnerabilities, zero tracking, auditable security.
2. **Infinite File Size**: Slices files into buffered streams with backpressure control. Memory usage remains constant (~40 MB) whether you transfer a 5 MB image or a 75 GB archive.
3. **Resumable Transfers**: Automatic byte-offset tracking resumes interrupted uploads right where they left off if Wi-Fi fluctuates.
4. **Peer Confirmation Flow**: Receivers get an explicit accept/cancel modal with file details before a single byte leaves the sender's device.
5. **No Cloud, No Internet Required**: Operates strictly within your local network or via a direct mobile hotspot link at theoretical maximum Wi-Fi bandwidth (50–100+ MB/s).

---

## ✨ Key Features

- **🚀 Bi-Directional High-Speed Streaming**:
  - Direct local transfer without cloud servers or third-party relays.
  - HTTP 206 Partial Content range requests for high-performance mobile downloads.
- **📷 Instant QR Code Pairing**:
  - Displays a vector SVG QR Code on Windows. Scan with any Android camera to connect in under 1 second.
- **🛡️ Receiver Consent Dialog**:
  - Displays a modal popup showing sender name, file name, and file size.
  - Transfers only start after the receiver clicks **"Accept"**.
- **📱 Android Progressive Web App (PWA)**:
  - Add to Home Screen via standalone PWA manifest and service worker.
  - Native Screen Wake Lock keeps your phone screen active during long transfers to prevent Wi-Fi sleep throttling.
- **🗑️ Transfer History Management**:
  - Real-time logging of sent and received items with 1-click **"Clear History"** support.
  - Dynamic platform path indicators (shows Windows Downloads folder on PC, mobile storage info on phone).
- **📋 Real-Time Shared Clipboard**:
  - Instantly share text snippets, links, OTPs, or notes between PC and phone.
- **📶 Direct Hotspot & Bluetooth Integration**:
  - Built-in shortcuts to toggle Windows Mobile Hotspot for router-free direct transfers.
  - 1-click launcher for Windows native Bluetooth file transfer wizard (`fsquirt.exe`).

---

## 📂 Project Structure

```text
OmniDrop/
├── start-windows.bat          # 1-Click desktop batch launcher
├── start-windows.ps1          # PowerShell launcher with port & firewall checks
├── setup-firewall.bat         # 1-Click admin firewall rule installer
├── setup-firewall.ps1         # PowerShell firewall automation
├── fix-stuck-keys.bat         # Utility to reset any stuck modifier keys
├── package.json               # Pure Node.js configuration (0 dependencies)
├── README.md                  # Comprehensive documentation
├── LICENSE                    # MIT License
├── server/
│   ├── index.js               # HTTP server & REST API router
│   ├── config.js              # Port config, paths, and transfer settings
│   ├── network.js             # Local network & Wi-Fi adapter IP detection
│   ├── discovery.js           # UDP Multicast / Broadcast auto-discovery
│   ├── sse.js                 # Server-Sent Events real-time event broker
│   ├── transfer.js            # Streaming chunk processor & resumable writer
│   ├── qr.js                  # Pure JS vector SVG QR generator
│   └── system.js              # Native Windows Explorer & fsquirt launcher
├── public/
│   ├── index.html             # Responsive desktop & mobile glassmorphism UI
│   ├── manifest.json          # Android PWA web manifest
│   ├── sw.js                  # Offline service worker cache (v3.9)
│   ├── css/
│   │   └── style.css          # Fluent & Material dark hybrid design
│   ├── js/
│   │   ├── app.js             # Frontend state & modal coordinator
│   │   ├── stream-sender.js   # Chunk slicing uploader with backpressure
│   │   ├── stream-receiver.js # Progress tracking, speed calculation & audio
│   │   ├── qr-scanner.js      # Mobile camera QR scanner
│   │   └── bluetooth.js       # Web Bluetooth & fsquirt integration
│   └── icons/
│       ├── icon-192.svg       # Vector PWA icon (small)
│       └── icon-512.svg       # Vector PWA icon (large)
└── test/
    └── transfer.test.js       # 12-test automated integration verification suite
```

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18.0.0 or higher installed on your Windows PC.
- Android phone with Google Chrome or modern web browser.

### 1. Launch on Windows
Double-click `start-windows.bat` or run in terminal:
```powershell
.\start-windows.bat
```
The server will start on port `5050` and automatically launch your browser at `http://localhost:5050`.

> **Note**: On first run, Windows Firewall may ask to allow Node.js on Private networks. Click **"Allow Access"**. You can also right-click `setup-firewall.bat` and select **"Run as Administrator"** for automatic configuration.

### 2. Connect from Android
1. Open your Android Camera or QR Scanner.
2. Scan the **QR Code** on your PC screen.
3. Tap the link to open OmniDrop in your mobile browser.
4. *(Recommended)* Tap the **"Install App"** button at the top banner to install OmniDrop as a standalone app on your home screen.

---

## 🔄 How to Transfer

### Sending from Android ➔ Windows:
1. On your phone, tap **"Drop files here or click to browse"** in the **Send Files** tab.
2. Select files (videos, photos, documents, APKs, etc.).
3. Tap **"Send Files"**.
4. On Windows, an **Accept / Cancel** dialog appears with the file name and size. Click **Accept**.
5. The file streams directly into your Windows **Downloads** folder (`%USERPROFILE%\Downloads`).
6. Click **"Show"** or **"Open Downloads Folder"** on PC to locate the file in Windows File Explorer.

### Sending from Windows ➔ Android:
1. On PC, drag and drop files into OmniDrop or click to browse.
2. Click **"Send Files"**.
3. On your phone, an **Accept Transfer** popup appears. Tap **Accept**.
4. The download streams directly into your phone's default download directory.

### Direct Hotspot Mode (No Internet / Traveling):
When you are traveling or on a Wi-Fi network with client isolation (hotels, colleges, offices):
1. In OmniDrop on PC, click the **"Bluetooth & Hotspot"** tab.
2. Click **"Open Windows Hotspot Settings"** and toggle Mobile Hotspot **ON**.
3. Connect your Android phone's Wi-Fi to your PC's hotspot network.
4. Scan the QR code or navigate to `http://192.168.137.1:5050` for direct 100+ MB/s Wi-Fi transfer without using any cellular data.

### Bluetooth Transfer:
For small files when Wi-Fi is unavailable:
1. Open the **"Bluetooth & Hotspot"** tab.
2. Click **"Launch Windows Bluetooth Transfer"**.
3. Windows native Bluetooth File Transfer wizard (`fsquirt.exe`) will open automatically to send or receive files.

---

## 🛡️ Security & Acceptance Flow

- **Zero Cloud Exposure**: All transfers remain strictly on the local area network (LAN) or direct peer connection.
- **Explicit Receiver Consent**: No incoming file is written to disk until the user manually confirms the transfer request.
- **Path Traversal Protection**: All incoming filenames are rigorously sanitized against directory traversal attacks (`../`, `..\`) and illegal Windows path characters (`: * ? " < > |`).
- **Resumable Integrity**: Chunks are buffered and sequenced to ensure complete file integrity.

---

## 📋 Clipboard Sharing

Need to copy an OTP, URL, or long text from PC to phone or vice-versa?
1. Switch to the **"Clipboard"** tab.
2. Type or paste your text.
3. Click **"Send to Peer"**.
4. The connected device receives an immediate notification and can copy the text with a single tap.

---

## 🔧 Firewall Configuration

If your phone cannot reach your PC's IP address:
1. Right-click [`setup-firewall.bat`](file:///setup-firewall.bat) and choose **"Run as Administrator"**.
2. This runs a single Windows `netsh advfirewall` command to allow inbound TCP/UDP on port `5050` for Private networks.

---

## 🧪 Automated Testing

OmniDrop includes a comprehensive automated test suite verifying all critical network and file streaming paths:
```powershell
node test/transfer.test.js
```

### What is tested:
- ✅ Server startup and static asset routing
- ✅ Pure JS vector QR code generation
- ✅ Multi-megabyte binary streaming with SHA-256 byte-for-byte checksum verification
- ✅ Interrupted transfer resumption from byte offset
- ✅ Path traversal and illegal filename sanitization
- ✅ HTTP 206 Partial Content range streaming
- ✅ Server-Sent Events (SSE) connection & broadcast
- ✅ History recording and retrieval
- ✅ Real-time clipboard sharing

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details. Free for personal and commercial use.
