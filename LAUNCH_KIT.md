# 🚀 OmniDrop Launch & Marketing Kit

This guide contains ready-to-use, formatted posts and submission materials to promote **OmniDrop** across developer communities, social media, and open-source directories.

---

## 📌 Quick Summary of OmniDrop USPs
- **Problem**: Sending files between Windows and Android usually requires installing bloated apps, logging into cloud services (Google Drive/OneDrive), or suffering from WebRTC disconnects on large files.
- **Solution**: High-speed, local-only transfer with **0 third-party dependencies** (pure Node.js standard library).
- **Key Features**:
  - Constant ~40 MB RAM usage even on 50+ GB files (chunked stream with backpressure).
  - Resumable transfers with byte-offset tracking.
  - Receiver Accept/Cancel consent modal.
  - Dynamic vector QR code (scan & connect in 1s).
  - Native PWA for Android with Screen Wake Lock.
  - Direct Mobile Hotspot mode (works router-free in planes/trains).
  - Windows native Bluetooth transfer (`fsquirt.exe`) fallback.

---

## 1. 🌐 Hacker News ("Show HN")
**Where to post**: [https://news.ycombinator.com/submit](https://news.ycombinator.com/submit)  
**Title**:  
`Show HN: OmniDrop – Zero-dependency local file transfer between Android and Windows`

**Text / First Comment**:
```text
Hi HN!

Like many of you, I have an Android phone and a Windows PC. Moving files between them has always felt unnecessarily clunky:
- Cloud drives (Google Drive/Dropbox) upload to the internet and download back down, wasting bandwidth and time for local transfers.
- WebRTC browser tools (Snapdrop/PairDrop) are great for small files, but often stall on multi-gigabyte files due to browser memory leaks or STUN/TURN blocks.
- Nearby Share / Quick Share on Windows requires background services, Bluetooth handshakes that fail, or Google logins.

I built OmniDrop to solve this with a Unix philosophy:
1. Pure Node.js Standard Library: Zero npm runtime dependencies. No bloated node_modules, fully auditable.
2. Constant Memory (~40 MB): Uses chunked streaming with backpressure control. It handles 50MB photos or 50GB 4K videos without RAM spikes.
3. Resumable Transfers: If Wi-Fi blips, it resumes from the last acknowledged byte offset.
4. Peer Consent: Receivers get an Accept/Cancel prompt with file metadata before any bytes leave the sender.
5. Works Completely Offline: Includes a 1-click launcher for Windows Mobile Hotspot for direct 100+ MB/s Wi-Fi transfers when traveling with no router available.

GitHub Repo: https://github.com/Gauravb853/OmniDrop-FileShare-Win-Android

Would love your thoughts, feedback, and questions!
```

---

## 2. 📱 Reddit Campaigns

### Post 1: r/selfhosted
**Where**: [https://reddit.com/r/selfhosted](https://reddit.com/r/selfhosted)  
**Flair to Select**: `Look what I made` *(or `Software`)*  
**Title**:  
`I built a zero-dependency, local-first AirDrop alternative for Android ⇋ Windows`

**Body**:
```markdown
Hey r/selfhosted!

I got tired of cloud syncs and bloated proprietary apps just to transfer photos and videos between my Android phone and Windows desktop. 

So I built **OmniDrop** — a fast, private, bi-directional file transfer suite that runs entirely on your local network.

### Why it's different:
- **Zero npm dependencies**: Uses only native Node.js (`node:http`, `node:fs`, `node:crypto`). No supply-chain risk or dependency bloat.
- **No file size limit**: Streams chunked files with backpressure. Memory stays at ~40 MB whether transferring 10 MB or 75 GB.
- **Resumable**: Automatically resumes interrupted transfers right from the last chunk.
- **Security / Consent Modal**: Receiver must click "Accept" before any file begins uploading.
- **Dynamic QR Pairing**: Vector QR code displays in terminal & browser; scan with your phone camera to pair in 1 second.
- **PWA with Screen Wake Lock**: Installable to Android home screen; keeps phone screen awake during long multi-gigabyte transfers.
- **Works Without a Router**: Built-in 1-click toggle for Windows Mobile Hotspot for direct 100+ MB/s Wi-Fi links while traveling.

Repo: https://github.com/Gauravb853/OmniDrop-FileShare-Win-Android
License: MIT

Feedback and PRs are very welcome!
```

---

### Post 2: r/Android
**Where**: [https://reddit.com/r/Android](https://reddit.com/r/Android)  
**Flair to Select**: `Dev` *(or `Discussion`)*  
**Title**:  
`OmniDrop: A fast, zero-install way to transfer large files between Android and Windows PC over Wi-Fi`

**Body**:
```markdown
If you use Android with a Windows PC, transferring large files (like 4K video footage or APKs) without cables is usually frustrating.

I open-sourced **OmniDrop**, a lightweight tool to stream files at full Wi-Fi speed (80-120 MB/s):

- **No app download needed on Android**: Just open the web browser or scan the QR code from your PC screen. You can tap "Install App" to add it as a PWA on your home screen.
- **Accept/Reject confirmation**: You get an alert with file name and size before receiving anything.
- **Screen Wake Lock**: Prevents your phone from sleeping and dropping the connection mid-transfer.
- **Shared Clipboard**: Instantly share text snippets, links, and OTPs between PC and phone.

Code is completely free, open-source (MIT), and has zero third-party dependencies:
https://github.com/Gauravb853/OmniDrop-FileShare-Win-Android
```

---

### Post 3: r/windows
**Where**: [https://reddit.com/r/windows](https://reddit.com/r/windows)  
**Flair to Select**: `App / Software` *(or `Discussion`)*  
**Title**:  
`Built an open-source, local-first file transfer tool for Windows & Android with zero bloat`

---

## 3. 🎯 AlternativeTo Submission
**Where**: [https://alternativeto.net/software/new/](https://alternativeto.net/software/new/)  
- **Name**: OmniDrop
- **Website / URL**: `https://github.com/Gauravb853/OmniDrop-FileShare-Win-Android`
- **License**: Open Source (MIT)
- **Platforms**: Windows, Android, Web
- **Short Description**: High-speed, zero-dependency, local file transfer suite between Android and Windows with resumable streaming and peer consent.
- **Tags**: `file-transfer`, `airdrop-alternative`, `local-share`, `pwa`, `windows`, `android`, `open-source`
- **Alternatives to**: Quick Share, Apple AirDrop, Snapdrop, PairDrop, LocalSend, WeTransfer.

---

## 4. 🚀 Product Hunt Launch
**Where**: [https://www.producthunt.com/posts/new](https://www.producthunt.com/posts/new)  
- **Tagline**: AirDrop for Android & Windows, zero cloud required
- **Description**: OmniDrop enables bi-directional, high-speed file transfer between Android and Windows over local Wi-Fi, direct mobile hotspot, or Bluetooth. Built with zero dependencies, infinite file streaming, and automatic PWA installation.
- **Pricing**: 100% Free & Open Source (MIT).

---

## 5. 🐦 Twitter / X & LinkedIn Post Template
```text
Tired of cloud uploads and bloated apps just to send files between your Android phone and Windows PC?

I open-sourced OmniDrop ⚡
- 0 npm dependencies (pure Node.js)
- Unlimited file size (~40 MB RAM streaming)
- 100+ MB/s direct Wi-Fi transfers
- Resumable uploads & Accept/Cancel modals
- Installable Android PWA with Screen Wake Lock

Check it out on GitHub:
https://github.com/Gauravb853/OmniDrop-FileShare-Win-Android

#opensource #android #windows #webdev #nodejs #pwa
```
