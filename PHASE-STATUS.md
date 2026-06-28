# dweb OS — Phase Status & Next Actions

**Last Updated:** June 28, 2026
**Branch:** `main` — [github.com/Awaiswilll/dweb](https://github.com/Awaiswilll/dweb)

---

## Phase Completion Summary

| Phase | Status | Details |
|-------|--------|---------|
| **Phase 1: Build Verification** | ✅ COMPLETE | Frontend builds clean, 13 tests passing, Rust code verified |
| **Phase 2: AI Models (Nemotron + Free)** | ✅ COMPLETE | 15+ providers, 100+ free models, README updated |
| **Phase 3: WSL Distro Build** | ⏸️ BLOCKED | Needs Docker Desktop WSL integration on Windows |
| **Phase 4: Windows MSIX Build** | ⏸️ BLOCKED | Needs Windows machine with Rust + Tauri |
| **Phase 5A: MS Developer Enrollment** | ✅ COMPLETE | Individual account enrolled, name "dweb" reserved |
| **Phase 5B: Store Listing** | 📝 DRAFT READY | Full description, metadata, privacy policy draft ready |
| **Phase 5C: Store Submission** | ⏸️ BLOCKED | Needs MSIX package from Phase 4 |
| **Phase 6: Open Source Launch** | ⏸️ PENDING | Issue templates, project board, announcement |

---

## Immediate Actions (On Your Windows Machine)

### Action 1: Enable Docker Desktop WSL Integration

The WSL distro build script requires Docker. Your Windows has Docker Desktop installed but WSL integration is not enabled.

**Steps:**
1. Open **Docker Desktop** on Windows
2. Go to **Settings → Resources → WSL Integration**
3. Toggle **ON** for the WSL distro you're using
4. Click **Apply & restart**

**Verify:**
```bash
# In your WSL terminal
docker --version
docker run --rm hello-world
```

### Action 2: Build the WSL Distro Tarball (Phase 3)

Once Docker is integrated:

```bash
cd /path/to/dweb
npm install
npm run build
bash packaging/wsl/build-wsl-distro.sh
```

**Expected output:** `packaging/wsl/dweb-wsl-rootfs.tar.gz` (~200-400MB)

**Test the distro:**
```powershell
# In PowerShell
wsl --import dweb C:\dweb-wsl C:\path\to\dweb-wsl-rootfs.tar.gz --version 2
wsl -d dweb
# Then open http://localhost:49737 in browser
```

### Action 3: Build the Windows Desktop App (Phase 4)

**Prerequisites on Windows:**
- Rust toolchain: `winget install Rustlang.Rustup`
- Node.js 22+: already installed
- Build tools: Visual Studio Build Tools with "Desktop development with C++"

**Steps:**
```powershell
cd C:\path\to\dweb
npm install
npx tauri build
```

**Output:** `src-tauri\target\release\bundle\nsis\dweb_x64-setup.exe`

### Action 4: Build the MSIX Package (Phase 4)

```powershell
.\packaging\win32\build-msix.ps1
```

**Output:** MSIX package ready for Store submission

### Action 5: Submit to Microsoft Store (Phase 5C)

1. Go to **https://aka.ms/submitwindowsapp**
2. Select your reserved app name **"dweb"**
3. Fill in store listing (use the draft in `MICROSOFT-STORE-PLAN.md`)
4. Upload the MSIX package
5. Submit for certification

**Expected timeline:** 1-3 business days for certification

---

## What's Already Done (No Action Needed)

### Code & Build
- ✅ React frontend (8 views, 2 components) — builds clean
- ✅ Rust/Tauri backend (11 modules) — code verified
- ✅ Node.js server + P2P relay — starts and runs
- ✅ Vitest test framework — 13 tests passing
- ✅ CI/CD workflow — multi-platform build pipeline

### AI Integration
- ✅ 15+ AI providers configured
- ✅ 100+ free models catalogued
- ✅ NVIDIA Nemotron integration ready
- ✅ Fast mode + model speed classification
- ✅ Settings UI for all providers

### Documentation
- ✅ README with full dweb OS story
- ✅ BUILD.md — build instructions
- ✅ BUSINESS-PLAN.md — monetization strategy
- ✅ CHANGELOG.md — version history
- ✅ CONTRIBUTING.md — contributor guidelines
- ✅ CLAUDE.md — agent instructions
- ✅ MICROSOFT-STORE-PLAN.md — Store submission guide

### Microsoft Store
- ✅ Developer account enrolled (Individual)
- ✅ App name "dweb" reserved
- ✅ Store listing draft prepared
- ✅ Screenshots exist in `screenshots/` folder

---

## Open Source Launch Checklist (Phase 6)

Once the Store submission is in progress:

- [ ] Create GitHub issue templates (bug report, feature request)
- [ ] Set up GitHub Project board for roadmap tracking
- [ ] Add `good-first-issue` labels to 3-5 beginner-friendly tasks
- [ ] Create `CODE_OF_CONDUCT.md`
- [ ] Create `SECURITY.md` with vulnerability reporting process
- [ ] Set up GitHub Discussions for community
- [ ] Write announcement post (Hacker News, Reddit r/selfhosted, dev.to)
- [ ] Create first release tag (`v0.1.0`)
- [ ] Add release notes with changelog

---

## Known Issues & Risks

| Issue | Impact | Mitigation |
|-------|--------|------------|
| Docker WSL integration not enabled | Blocks Phase 3 | Enable in Docker Desktop settings |
| Rust build requires Windows toolchain | Blocks Phase 4 | Install VS Build Tools on Windows |
| Tauri Linux deps not installed (this env) | Can't test Linux build here | Build on Ubuntu VM or native Linux |
| No privacy policy URL yet | Blocks Store submission | Create simple GitHub Pages page |
| App icons not generated (50x50, 150x150, 480x480) | Blocks Store submission | Generate from existing screenshots |

---

## Next Steps Priority Order

1. **Enable Docker WSL** → Build WSL distro tarball
2. **Build Tauri desktop app** → Generate NSIS installer
3. **Build MSIX package** → Prepare for Store
4. **Create privacy policy + icons** → Complete Store requirements
5. **Submit to Microsoft Store** → Begin certification
6. **Launch open source** → Announce and onboard contributors

---

## Quick Reference

| Resource | Link |
|----------|------|
| GitHub Repo | https://github.com/Awaiswilll/dweb |
| Partner Center | https://partner.microsoft.com/dashboard |
| App Submission | https://aka.ms/submitwindowsapp |
| Store Developer Portal | https://storedeveloper.microsoft.com |
| NVIDIA NIM (Nemotron) | https://build.nvidia.com |
| Docker Desktop WSL | https://docs.docker.com/go/wsl2/ |
