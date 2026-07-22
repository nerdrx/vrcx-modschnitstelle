#!/bin/bash
set -e

echo "Building for Windows..."
rm -rf build/Electron/dotnet-runtime
mkdir -p build/Electron/dotnet-runtime
wget -q -O dotnet-win.zip "https://builds.dotnet.microsoft.com/dotnet/Runtime/9.0.9/dotnet-runtime-9.0.9-win-x64.zip"
unzip -q dotnet-win.zip -d build/Electron/dotnet-runtime/
rm dotnet-win.zip
npm run prod
npx electron-builder --win zip --x64 --publish never

echo "Uploading Windows zip..."
node manage_release.js build/VRCX-2026.7.18-win.zip

echo "Building for Linux..."
node ./src-electron/download-dotnet-runtime.js --arch=x64 --platform=linux

# Replace pre-compiled Windows SQLite binaries with Linux ones
cp build/Electron/runtimes/linux-x64/native/SQLite.Interop.dll build/Electron/SQLite.Interop.dll
cp build/Electron/runtimes/linux-x64/native/libe_sqlite3.so build/Electron/e_sqlite3.dll

npm run prod-linux
npx electron-builder --linux AppImage --x64 --publish never

# Upload Linux AppImage
echo "Uploading Linux AppImage..."
node manage_release.js build/VRCX-2026.7.18-linux.AppImage


echo "Done!"
