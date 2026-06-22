# Build Guide

## Prerequisites

### Rust

Install the Rust toolchain via [rustup](https://rustup.rs):

```bash
rustup install stable
rustup default stable
```

### Node.js

Install [Node.js](https://nodejs.org) v22+ (npm is included).

### Platform-specific dependencies

#### Windows (GNU toolchain)

```bash
# Install LLVM MinGW (provides clang + mingw-w64 + lld)
winget install MartinStorsjo.LLVM-MinGW.UCRT

# Configure Rust to use the GNU target
rustup target add x86_64-pc-windows-gnu

# Configure cargo to use clang as the linker
# (already in .cargo/config.toml in this project)
```

#### macOS

```bash
# Xcode Command Line Tools are sufficient
xcode-select --install
```

#### Linux (Ubuntu / Debian)

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev \
  librsvg2-dev patchelf libssl-dev
```

---

## Build Steps

```bash
# 1. Clone the repository
git clone https://github.com/your-org/dweb.git
cd dweb

# 2. Install frontend dependencies
npm install

# 3. Build the Rust backend (debug)
cd src-tauri
cargo build

# 4. Or build release (optimised, smaller binary)
cargo build --release
```

The compiled binary will be at:

| Platform | Path |
|---------|------|
| Windows | `src-tauri/target/x86_64-pc-windows-gnu/debug/dweb.exe` |
| Windows (release) | `src-tauri/target/x86_64-pc-windows-gnu/release/dweb.exe` |
| macOS   | `src-tauri/target/debug/dweb` |
| Linux   | `src-tauri/target/debug/dweb` |

---

## CI/CD

The GitHub Actions workflow in `.github/workflows/build.yml` automatically builds
for Windows, macOS, and Linux on every push to `main` and on pull requests.

Artifacts are uploaded as build artifacts and can be downloaded from the
Actions tab in GitHub.

---

## Troubleshooting

### `too many exported symbols` (Windows GNU)

If you see `ld.lld: error: too many exported symbols (got N, max 65535)`,
ensure the `[lib]` section in `Cargo.toml` has `crate-type = ["lib"]` only
(not `cdylib` or `staticlib`).

### `link.exe` not found (Windows MSVC)

If you use the MSVC target, install Visual Studio Build Tools with the
"Desktop development with C++" workload. Alternatively, switch to the GNU
target as described above.

### `ring` build failures

The `ring` crate requires a C compiler. On Windows GNU, LLVM MinGW provides
`clang`. On Linux, install `gcc` or `clang`. On macOS, Xcode CLT provides
everything.
