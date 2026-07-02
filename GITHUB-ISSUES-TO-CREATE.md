# GitHub Issues — Create These Manually

The GitHub API isn't authenticated in this environment. Create these issues manually
at: https://github.com/Awaiswilll/dweb/issues/new

---

## Issue 1: Add dark/light theme toggle to Settings

**Labels:** `good-first-issue`, `enhancement`, `frontend`

**Title:** Add dark/light theme toggle to Settings

**Body:**
```
## Description

Add a theme toggle in the Settings → General tab that allows users to switch between
dark mode, light mode, and system theme.

## What Needs to Be Done

- [ ] Add theme state management (dark/light/system)
- [ ] Create theme toggle UI component in Settings General tab
- [ ] Add CSS variables for light theme
- [ ] Persist theme preference in localStorage
- [ ] Apply theme on page load

## Acceptance Criteria

- [ ] Theme toggle works in Settings → General
- [ ] Theme persists across page reloads
- [ ] System theme detection works
- [ ] All components look good in both themes

## Relevant Files

- `src/views/Settings.tsx` — GeneralTab component
- `src/styles/global.css` — CSS variables
- `src/App.tsx` — Theme provider wrapper

## Resources

- [Contributing Guide](https://github.com/Awaiswilll/dweb/blob/main/CONTRIBUTING.md)
- [Code Style Guide](https://github.com/Awaiswilll/dweb/blob/main/CLAUDE.md)
```

---

## Issue 2: Add responsive design for mobile browsers

**Labels:** `good-first-issue`, `enhancement`, `frontend`

**Title:** Add responsive design for mobile browsers

**Body:**
```
## Description

The dweb OS dashboard is currently optimized for desktop browsers. Add responsive
design so it works well on tablets and mobile phones.

## What Needs to Be Done

- [ ] Make sidebar collapsible on small screens
- [ ] Optimize dashboard grid for mobile (1 column on phones, 2 on tablets)
- [ ] Make AI chat input work well on mobile keyboards
- [ ] Test on iOS Safari, Android Chrome, and Firefox Mobile

## Acceptance Criteria

- [ ] All views are usable on screens ≥320px wide
- [ ] No horizontal scrolling on any screen size
- [ ] Touch targets are ≥44px on mobile
- [ ] Text is readable without zooming

## Relevant Files

- `src/styles/global.css` — Media queries
- `src/components/Sidebar.tsx` — Sidebar responsiveness
- `src/views/Dashboard.tsx` — Dashboard grid layout
```

---

## Issue 3: Add service health monitoring indicators

**Labels:** `good-first-issue`, `enhancement`, `backend`

**Title:** Add service health monitoring indicators

**Body:**
```
## Description

Add health check indicators to the Dashboard that show whether each service is
responding correctly, not just whether it's running.

## What Needs to Be Done

- [ ] Add health check endpoint to services
- [ ] Display health status (healthy/degraded/unhealthy) on Dashboard
- [ ] Add color-coded indicators (green/yellow/red)
- [ ] Show last health check timestamp

## Acceptance Criteria

- [ ] Each service shows health status on Dashboard
- [ ] Health checks run every 30 seconds
- [ ] Status updates in real-time without page refresh
- [ ] Degraded services show warning icon

## Relevant Files

- `src/views/Dashboard.tsx` — Service cards
- `tools/dweb-server.cjs` — Health check endpoint
- `src/types.ts` — Service type definition
```

---

## Issue 4: Add P2P connection status indicator to navbar

**Labels:** `good-first-issue`, `enhancement`, `frontend`, `P2P`

**Title:** Add P2P connection status indicator to navbar

**Body:**
```
## Description

Add a P2P connection status indicator to the top navbar that shows:
- Number of connected peers
- Connection quality (excellent/good/poor)
- Whether relay is active

## What Needs to Be Done

- [ ] Create P2P status component
- [ ] Connect to relay status API endpoint
- [ ] Add peer count display
- [ ] Add connection quality indicator
- [ ] Make it clickable to show peer details

## Acceptance Criteria

- [ ] Status indicator visible in navbar at all times
- [ ] Updates in real-time when peers connect/disconnect
- [ ] Shows peer count and connection quality
- [ ] Clicking opens peer details modal

## Relevant Files

- `src/components/Sidebar.tsx` — Add to navbar area
- `src/relay-client.ts` — P2P connection status
- `src/types.ts` — PeerInfo type
```

---

## Issue 5: Add keyboard shortcuts for common actions

**Labels:** `good-first-issue`, `enhancement`, `frontend`

**Title:** Add keyboard shortcuts for common actions

**Body:**
```
## Description

Add keyboard shortcuts for common dweb OS actions to improve developer productivity.

## Shortcuts to Add

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Open command palette / quick search |
| `Ctrl+1` | Go to Dashboard |
| `Ctrl+2` | Go to Browser |
| `Ctrl+3` | Go to AI Agent |
| `Ctrl+4` | Go to Domains |
| `Ctrl+5` | Go to Repositories |
| `Ctrl+6` | Go to Settings |
| `Ctrl+Shift+R` | Refresh services |
| `Ctrl+/` | Show keyboard shortcuts help |

## What Needs to Be Done

- [ ] Create keyboard shortcut hook (`useKeyboardShortcuts`)
- [ ] Register shortcuts in App.tsx
- [ ] Add shortcuts help modal (`Ctrl+/`)
- [ ] Document shortcuts in README

## Acceptance Criteria

- [ ] All shortcuts work on Windows, Mac, and Linux
- [ ] Shortcuts don't conflict with browser shortcuts
- [ ] Help modal shows all available shortcuts
- [ ] Shortcuts are documented in README

## Relevant Files

- `src/App.tsx` — Global shortcut registration
- `src/components/Sidebar.tsx` — Navigation shortcuts
```

---

## Issue 6: Add Docker Hub image publishing to CI/CD

**Labels:** `enhancement`, `CI/CD`, `docker`

**Title:** Add Docker Hub image publishing to CI/CD

**Body:**
```
## Description

Add a GitHub Actions workflow that builds and publishes a Docker image to Docker Hub
on every release tag.

## What Needs to Be Done

- [ ] Create `Dockerfile` for production
- [ ] Add GitHub Actions workflow for Docker build/push
- [ ] Configure Docker Hub credentials as GitHub secrets
- [ ] Tag images with version and `latest`
- [ ] Add multi-arch support (linux/amd64, linux/arm64)

## Acceptance Criteria

- [ ] Docker image builds on release tag
- [ ] Image is pushed to Docker Hub
- [ ] Image runs with: `docker run -d -p 49737:49737 dweb/dweb:latest`
- [ ] Multi-arch images are available

## Relevant Files

- `.github/workflows/docker.yml` — New workflow
- `Dockerfile` — New file
- `packaging/wsl/Dockerfile` — Can be adapted
```

---

## Issue 7: Add export/import configuration feature

**Labels:** `enhancement`, `frontend`, `backend`

**Title:** Add export/import configuration feature

**Body:**
```
## Description

Allow users to export their dweb OS configuration (domains, services, AI providers,
P2P settings) as a JSON file, and import it on another machine.

## What Needs to Be Done

- [ ] Create export endpoint that returns all config
- [ ] Create import endpoint that accepts config JSON
- [ ] Add Export button in Settings
- [ ] Add Import button in Settings
- [ ] Validate imported config before applying

## Acceptance Criteria

- [ ] Export creates a valid JSON file
- [ ] Import validates the JSON structure
- [ ] Import shows preview of changes before applying
- [ ] Import doesn't break existing config if it fails

## Relevant Files

- `src/views/Settings.tsx` — Export/Import buttons
- `tools/dweb-server.cjs` — Export/import endpoints
- `src-tauri/src/config.rs` — Config management
```

---

## Issue 8: Improve AI agent prompt templates for code generation

**Labels:** `enhancement`, `AI`

**Title:** Improve AI agent prompt templates for code generation

**Body:**
```
## Description

The AI Build Agent uses prompt templates to generate code. Improve these templates
to produce better, more production-ready code.

## What Needs to Be Improved

- [ ] Add security best practices to generated code (input validation, auth)
- [ ] Add error handling to generated code
- [ ] Add TypeScript strict mode to generated projects
- [ ] Add testing setup to generated projects
- [ ] Add Docker configuration to generated projects
- [ ] Add README and documentation to generated projects

## Acceptance Criteria

- [ ] Generated code includes input validation
- [ ] Generated code includes error handling
- [ ] Generated projects have tests set up
- [ ] Generated projects have Docker support
- [ ] Generated projects have README files

## Relevant Files

- `src/views/AIAgent.tsx` — Prompt generation
- `src-tauri/src/ai.rs` — AI prompt construction
- `src-tauri/src/stack.rs` — Stack scaffolding
```

---

## How to Create These Issues

1. Go to https://github.com/Awaiswilll/dweb/issues/new
2. Copy the Title and Body from each issue above
3. Add the specified labels
4. Click "Submit new issue"

Repeat for all 8 issues.

---

## Labels to Create (if they don't exist)

Go to https://github.com/Awaiswilll/dweb/labels and create these:

| Label | Color | Description |
|-------|-------|-------------|
| `good-first-issue` | `7057ff` | Good for newcomers |
| `help-wanted` | `008672` | Extra attention is needed |
| `enhancement` | `a2eeef` | New feature or request |
| `frontend` | `fbca04` | Frontend (React/TypeScript) |
| `backend` | `0e8a16` | Backend (Node.js) |
| `P2P` | `1d76db` | Peer-to-peer networking |
| `AI` | `7C3AED` | AI build agent and providers |
| `CI/CD` | `c2e0c6` | CI/CD pipeline |
| `docker` | `0db7ed` | Docker-related |
| `triage` | `d4c5f9` | Needs review/assessment |
