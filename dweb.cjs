#!/usr/bin/env node

// ═══════════════════════════════════════════════════════════════════════════════
//  dweb v0.1.0 — Entry Point
//
//  This is a thin entry point that delegates to server/index.cjs.
//  Run:   node dweb.cjs
//  Env:   PORT=49737, RELAY_PORT=49736, MODE=auto, NAME=my-dweb
// ═══════════════════════════════════════════════════════════════════════════════

require("./server/index.cjs");
