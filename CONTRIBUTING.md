# Contributing to OmniDrop

Thank you for your interest in contributing to **OmniDrop**! We welcome community contributions, bug reports, and feature requests.

---

## 🏛️ Guiding Philosophy

Before submitting code, please keep in mind OmniDrop's core architectural tenets:

1. **Zero External Runtime Dependencies**:  
   OmniDrop intentionally avoids third-party npm runtime dependencies. We strictly rely on the Node.js standard library (`node:http`, `node:fs`, `node:crypto`, `node:dgram`, `node:child_process`, `node:os`, `node:path`). Please do not introduce heavy framework dependencies.

2. **Infinite File Size & Constant Memory**:  
   All file operations must use streams with backpressure control. Sockets and disk writers should never buffer full files into RAM.

3. **Privacy & Security First**:  
   All transfers remain strictly local (LAN / Hotspot / Bluetooth). No telemetry, no external tracking, no cloud relay dependencies.

---

## 🛠️ Local Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Gauravb853/OmniDrop-FileShare-Win-Android.git
   cd OmniDrop-FileShare-Win-Android
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   # or
   node --watch server/index.js
   ```

3. **Run the integration test suite**:
   ```bash
   npm test
   ```

---

## 🧪 Testing Checklist

Before opening a pull request, ensure:
- All 12 integration tests pass: `npm test`
- Code is cleanly formatted
- No sensitive or hardcoded local paths are present

Thank you for making local, private file sharing better for everyone!
