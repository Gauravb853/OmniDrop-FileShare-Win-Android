// scripts/package-release.js - Packages clean release zip without git, tests, or temp files
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const zipName = 'OmniDrop-v1.0.0-windows.zip';
const zipPath = path.join(distDir, zipName);

console.log('📦 Packaging OmniDrop v1.0.0 release archive...');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

// Files & directories to include in release
const includeList = [
  'public',
  'server',
  'start-windows.bat',
  'start-windows.ps1',
  'setup-firewall.bat',
  'setup-firewall.ps1',
  'fix-stuck-keys.bat',
  'fix-stuck-keys.ps1',
  'package.json',
  'README.md',
  'LICENSE',
];

const tempReleaseDir = path.join(distDir, 'OmniDrop');
if (fs.existsSync(tempReleaseDir)) {
  fs.rmSync(tempReleaseDir, { recursive: true, force: true });
}
fs.mkdirSync(tempReleaseDir, { recursive: true });

for (const item of includeList) {
  const src = path.join(rootDir, item);
  const dest = path.join(tempReleaseDir, item);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true });
  }
}

// Use native PowerShell Compress-Archive to create zip
const psCmd = `Compress-Archive -Path "${tempReleaseDir}" -DestinationPath "${zipPath}" -Force`;
execSync(`powershell -NoProfile -Command "${psCmd}"`, { stdio: 'inherit' });

// Cleanup temp folder
fs.rmSync(tempReleaseDir, { recursive: true, force: true });

const stats = fs.statSync(zipPath);
console.log(`\n🎉 Release archive created successfully!`);
console.log(`📍 Output: ${zipPath}`);
console.log(`📏 Size:   ${(stats.size / 1024).toFixed(1)} KB\n`);
