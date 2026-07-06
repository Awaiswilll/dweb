# Changelog

## [0.2.0] — 2026-07-06

### Added
- First WSL distro release: Alpine 3.20 rootfs with full dweb stack
- Pre-built frontend (React + Vite, 38MB compressed rootfs)
- WSL auto-start via OpenRC service + .bashrc fallback
- Tarball verification step in build script (11 critical files checked)
- pm2 process manager (pre-installed globally)
- RELEASE notes for GitHub Releases

### Fixed
- Dockerfile: `npm ci` now installs devDependencies so `tsc && vite build` succeeds
- Dockerfile: musl-linkage check uses `ldd` instead of `readelf`
- Dockerfile: removed broken `@opencode/cli` install (package does not exist)
- build-wsl-distro.sh: ensured `/etc/init.d/` directory exists before writing service script
- build-wsl-distro.sh: replaced opencode install with pm2
- build-wsl-distro.sh: improved Ollama install messaging
- All packaging files: updated GitHub URLs from `dweb/dweb` to `Awaiswilll/dweb`

## [0.1.0] — 2026-07-03

### Added
- Initial release (WSL distro alpha, paper draft, business plan)
