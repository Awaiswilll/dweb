# Windows Testing Instructions

## Prerequisites
- Windows 10 (build 19041+) or Windows 11
- WSL 2 enabled (run `wsl --set-default-version 2` in PowerShell as Admin)
- Node.js 18+ (for portable distribution)
- WebView2 runtime (included in Windows 11, available for Windows 10)

---

## 1. WSL Distro Test

### Import the distro
```powershell
# Download from GitHub Release
wsl --import dweb C:\dweb-wsl .\dweb-wsl-rootfs.tar.gz --version 2
```

### Launch and verify
```powershell
# Start the distro
wsl -d dweb

# You should see:
#   dweb-server starting on http://localhost:49737
#   (logs: tail -f /var/log/dweb.log)

# Verify the server is running
curl http://localhost:49737/ping
# Expected: {"status":"ok"}

# Check that Node.js is musl-linked
readelf -l /usr/bin/node | grep interpreter
# Expected: /lib/ld-musl-x86_64.so.1
```

### If something fails
- Run `cat /var/log/dweb.log` for server logs
- Run `sudo rc-service dweb status` for service status
- Run `ps aux | grep node` to verify the process is running

### Clean up
```powershell
wsl --unregister dweb
rm C:\dweb-wsl -Recurse
```

---

## 2. Windows Portable Test

### Extract and run
```powershell
tar -xzf dweb-windows-portable.tar.gz -C C:\dweb-portable
cd C:\dweb-portable
.\start-dweb.bat
```

### Verify
```powershell
curl http://localhost:49737/ping
```

### Clean up
```powershell
rm C:\dweb-portable -Recurse
```

---

## 3. Windows Desktop App (Tauri)

### Build from source
```powershell
# Requires: Rust toolchain, MinGW, WebView2
cd dweb-os
.\packaging\win32\build-all.ps1
```

### Test
```powershell
# Run the app
.\src-tauri\target\release\dweb.exe
```

---

## Test Checklist

- [ ] WSL distro imports without error
- [ ] `wsl -d dweb` starts and shows auto-start message
- [ ] `curl http://localhost:49737/ping` returns `{"status":"ok"}`
- [ ] Dashboard loads in browser at http://localhost:49737
- [ ] AI Agent works with at least one provider
- [ ] File Browser works (upload, create, delete)
- [ ] Windows portable extracts and runs
- [ ] WSL unregister works cleanly

## Reporting Issues

Open an issue at https://github.com/Awaiswilll/dweb/issues with:
- Windows version (winver.exe)
- WSL version (`wsl --version`)
- Steps to reproduce
- Screenshots if applicable
- Output from `cat /var/log/dweb.log` if server fails
