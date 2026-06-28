# Microsoft Developer Program — Enrollment & Store Submission Plan

## Current Status: FREE Registration (2026)

Microsoft has eliminated registration fees for both Individual and Company developer accounts.
You can enroll at **zero cost** via the new flow at https://storedeveloper.microsoft.com

---

## Phase 5A: Developer Account Enrollment

### Decision: Individual vs Company Account

| Criteria | Individual | Company |
|----------|-----------|---------|
| **Cost** | FREE | FREE |
| **Publisher Name** | Your legal name | Business name (e.g., "Cyberion" or "dweb") |
| **Verification** | Government ID + Selfie | DUNS number OR business documents + work email |
| **Processing Time** | Minutes | 2-5 business days (manual review possible) |
| **Best For** | Personal projects, solo dev | Business/commercial products |

**Recommendation:** Since dweb is a commercial product with a business model (domain tiers, premium features), use a **Company account** under "Cyberion" or "dweb Team".

### Step-by-Step Enrollment

#### Option A: Individual Account (Fastest — Minutes)

1. Go to **https://storedeveloper.microsoft.com**
2. Click **"Get started for free"**
3. Select **Individual developer**
4. Sign in with your Microsoft account (the one linked to `Awaiswilll` GitHub)
5. Complete identity verification:
   - Upload government-issued ID (passport, driver's license, or national ID)
   - Take a selfie on mobile
6. Review auto-filled profile details
7. Click **"Go to Partner Center dashboard"**
8. Wait ~5 minutes, then access **Apps & Games** workspace

#### Option B: Company Account (Recommended for Commercial Product)

**Prerequisites:**
- [ ] DUNS number (free at https://developer.dunsregistered.com) OR business registration documents
- [ ] Work email with custom domain (e.g., `awais@dweb.dev` or `awais@cyberion.ai`)
- [ ] Business name: "Cyberion" or "dweb Team"

**Steps:**
1. Go to **https://storedeveloper.microsoft.com**
2. Click **"Get started"**
3. Select **Company account (free)**
4. Sign in with personal MSA or Microsoft Entra ID (work account)
5. Verify business:
   - **Option 1 (Recommended):** Enter 9-digit DUNS number → auto-verification
   - **Option 2:** Upload articles of incorporation, business registration, or tax filing
6. Enter contact details (work email must match company domain)
7. Review and accept the agreement
8. Complete verification (may take 2-5 business days for manual review)
9. Click **"Publish to Store"**

---

## Phase 5B: App Name Reservation

Once enrolled, reserve the app name immediately:

1. Go to **https://aka.ms/submitwindowsapp**
2. Click **New product**
3. Click **MSIX or PWA app**
4. Enter app name and check availability

**Recommended names to reserve (in priority order):**
1. `dweb` — Primary name
2. `dweb Dev Portal` — Fallback
3. `dweb Self-Hosted Platform` — Fallback
4. `dweb for WSL` — For WSL-specific listing

> **Note:** Reserved names expire after 3 months if not used. You can reserve multiple names.

---

## Phase 5C: Store Listing Preparation

### Required Assets

| Asset | Specification | Status |
|-------|--------------|--------|
| **App Icon** | 50x50, 44x44, 150x150, 480x480 PNG | ⚠️ Need to create |
| **Screenshots** | 1366x768, 1920x1080, 2560x1440 PNG | ✅ Exist in repo (`screenshots/`) |
| **Small Logo** | 50x50 PNG | ⚠️ Need to create |
| **Large Logo** | 284x284 PNG | ⚠️ Need to create |
| **Wide Logo** | 620x300 PNG | ⚠️ Need to create |
| **Store Icon** | 50x50 PNG | ⚠️ Need to create |
| **Splash Screen** | 620x300 PNG | ⚠️ Need to create |
| **Description** | Short (≤100 chars) + Full (≤10,000 chars) | ✅ Draft below |
| **Privacy Policy URL** | HTTPS URL | ⚠️ Need to create |
| **Support URL** | HTTPS URL | ⚠️ Need to create |
| **Website URL** | HTTPS URL | ⚠️ Need to create |

### Store Listing Draft

**App Name:** dweb — Self-Hosted Dev Portal

**Short Description (≤100 chars):**
Run services, register domains, code with AI — all on your own hardware. P2P-enabled.

**Full Description:**
```
dweb is your personal cloud development platform. Run services, register .dweb domains,
build apps with AI, and connect peer-to-peer — all on your own hardware.

KEY FEATURES:

🖥️ Dev Portal Dashboard
Manage services, runtimes, and deployments from a beautiful browser-based interface.

🤖 AI Build Agent (15+ Providers, 100+ Free Models)
Scaffold full-stack apps from natural language. Supports Ollama (local), NVIDIA Nemotron,
Google Gemini, Groq, DeepSeek, Mistral, and more. No API key needed for free tiers.

🌐 P2P Networking
Connect directly with other dweb users via HyperDHT + WebRTC. Share services and files
without any central server.

🏷️ .dweb Domain Management
Register and manage custom domains with Free, Premium, and Business tiers.

📁 File Browser
Upload, manage, and share files through your browser.

🔀 Git Integration
Clone, manage, and push repositories with GitHub OAuth support.

☁️ Cloud Deployment
One-click deploy to AWS, Netlify, and Vercel.

🐧 WSL Native
Runs inside Windows via WSL2 with an optimized Alpine Linux distribution.

🪟 Windows Desktop App
Native Windows 11 app built with Tauri (Rust + Web). Fast, secure, and lightweight.

PERFECT FOR:
• Developers who want a local Heroku-like experience
• AI-assisted code generation without internet (Ollama)
• P2P file and service sharing
• Self-hosted static sites and portfolios
• Offline-first development workflows

PRIVACY:
dweb runs entirely on your machine. No data is sent to our servers. AI provider API keys
are stored in your system keychain. P2P connections are encrypted end-to-end.

OPEN SOURCE:
Source code available at https://github.com/Awaiswilll/dweb under the MIT License.
Contributions welcome!
```

**Category:** Developer Tools

**Subcategory:** Development Kits & Tools

**Pricing:** Free (with in-app purchases for Premium/Business domain tiers)

**Age Rating:** Everyone

**Copyright:** © 2026 dweb Team

**Trademark:** dweb

**Support Contact:** awais@dweb.dev (or your email)

**Privacy Policy URL:** https://dweb.dev/privacy (or GitHub Pages link)

---

## Phase 5D: MSIX Package Preparation

### Current State
- ✅ `packaging/win32/build-msix.ps1` exists
- ✅ `packaging/win32/dweb-desktop/` directory exists
- ✅ `packaging/win32/dweb-wsl-distro/` directory exists

### Required Actions (On Windows Machine)

1. **Build the Tauri desktop app:**
   ```powershell
   cd dweb
   npm install
   npx tauri build
   ```

2. **Generate MSIX package:**
   ```powershell
   .\packaging\win32\build-msix.ps1
   ```

3. **Validate MSIX:**
   ```powershell
   # Install Windows App Certification Kit
   # Run certification tests on the MSIX
   ```

4. **Upload to Partner Center:**
   - Go to https://aka.ms/submitwindowsapp
   - Select your reserved app name
   - Fill in store listing (use draft above)
   - Upload MSIX package
   - Submit for certification

### Certification Timeline
- **Automated checks:** ~15 minutes
- **Manual review:** 1-3 business days (first submission)
- **Total time to live:** 2-5 business days

---

## Phase 5E: WSL Distro Store Submission

WSL distros are submitted differently than MSIX apps:

1. **Create a WSL distro package:**
   ```bash
   bash packaging/wsl/build-wsl-distro.sh
   # Output: packaging/wsl/dweb-distro.tar.gz
   ```

2. **Submit via Partner Center:**
   - WSL distros use a different submission flow
   - Package as an MSIX with WSL distro launcher
   - Follow [WSL Store Submission Guide](https://learn.microsoft.com/en-us/windows/wsl/publish-to-microsoft-store)

3. **Alternative: Direct WSL Import**
   - Users can import directly: `wsl --import dweb <path> dweb-distro.tar.gz`
   - No Store approval needed for this method

---

## Action Checklist

### Immediate (Today)
- [ ] Decide: Individual or Company account
- [ ] Get DUNS number (if Company) — free at https://developer.dunsregistered.com
- [ ] Go to https://storedeveloper.microsoft.com and start enrollment
- [ ] Complete identity/business verification

### After Enrollment (1-5 days)
- [ ] Reserve app name(s) at https://aka.ms/submitwindowsapp
- [ ] Create app icons (50x50, 150x150, 480x480 PNG)
- [ ] Create privacy policy page (GitHub Pages or simple HTML)
- [ ] Prepare store listing text (draft provided above)

### Package Preparation (On Windows)
- [ ] Build Tauri desktop app (`npx tauri build`)
- [ ] Run MSIX build script (`build-msix.ps1`)
- [ ] Test MSIX sideload locally
- [ ] Build WSL distro tarball (`build-wsl-distro.sh`)

### Submission
- [ ] Upload MSIX to Partner Center
- [ ] Fill in store listing
- [ ] Submit for certification
- [ ] Monitor certification status
- [ ] Address any certification issues
- [ ] Publish to Store

---

## Estimated Timeline

| Step | Duration |
|------|----------|
| Account enrollment | 5 minutes (Individual) / 2-5 days (Company) |
| DUNS number (if needed) | 1-30 days (free, can be expedited) |
| Name reservation | 5 minutes |
| Asset preparation | 1-2 days |
| MSIX build | 30 minutes |
| Certification review | 1-3 business days |
| **Total to Store live** | **3-10 business days** |

---

## Support Resources

- **Partner Center:** https://partner.microsoft.com/dashboard
- **Developer Support:** https://aka.ms/windowsdevelopersupport
- **Store Policies:** https://learn.microsoft.com/en-us/windows/apps/publish/store-policies
- **App Certification:** https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-certification-process
- **FAQ:** https://learn.microsoft.com/en-us/windows/apps/publish/faq/get-started-with-the-microsoft-store
