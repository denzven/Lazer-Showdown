import fs from 'fs';
import path from 'path';

const releaseDir = path.join(process.cwd(), 'release');
if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir);
}

const exePath = path.join(process.cwd(), 'src-tauri', 'target', 'release', 'bundle', 'nsis', 'lazer-showdown-webrtc_0.1.0_x64-setup.exe');
let apkPath = path.join(process.cwd(), 'src-tauri', 'gen', 'android', 'app', 'build', 'outputs', 'apk', 'universal', 'release', 'app-universal-release-unsigned.apk');

if (!fs.existsSync(apkPath)) {
  apkPath = path.join(process.cwd(), 'src-tauri', 'gen', 'android', 'app', 'build', 'outputs', 'apk', 'universal', 'release', 'app-universal-release.apk');
}

if (fs.existsSync(exePath)) {
  fs.copyFileSync(exePath, path.join(releaseDir, 'LazerShowdown-Windows.exe'));
  console.log('✅ Copied Windows .exe to /release');
} else {
  console.log('⚠️ Could not find Windows .exe. Run `npm run tauri:build:desktop` first.');
}

if (fs.existsSync(apkPath)) {
  fs.copyFileSync(apkPath, path.join(releaseDir, 'LazerShowdown-Android.apk'));
  console.log('✅ Copied Android .apk to /release');
} else {
  console.log('⚠️ Could not find Android .apk. Run `npm run tauri:build:android` first.');
}

console.log('\n--- CROSS-PLATFORM NOTE ---');
console.log('You are running on Windows, so only .exe and .apk can be compiled locally.');
console.log('To get the macOS (.dmg) and Linux (.AppImage) builds, simply push your code to GitHub and create a "Tag" (e.g., v1.0.0).');
console.log('The GitHub Action we set up (.github/workflows/release.yml) will automatically build and publish them for you!');
