/**
 * Safe wrapper around @tauri-apps/api/core invoke.
 * Falls back gracefully when running in a regular browser (Brave, Chrome, etc.)
 * where the Tauri IPC bridge is not available.
 */

type InvokeArgs = Record<string, unknown>;

let tauriCore: any = null;
let _isTauriReady: boolean | null = null;

async function ensureTauri(): Promise<boolean> {
  if (_isTauriReady !== null) return _isTauriReady;
  try {
    tauriCore = await import('@tauri-apps/api/core');
    // Verify invoke actually exists (not undefined)
    if (typeof tauriCore.invoke !== 'function') {
      _isTauriReady = false;
      return false;
    }
    _isTauriReady = true;
    return true;
  } catch {
    _isTauriReady = false;
    return false;
  }
}

/** Check if the app is running inside Tauri webview */
export async function isRunningInTauri(): Promise<boolean> {
  return ensureTauri();
}

/** Synchronous check (may return false-negative if module not loaded yet) */
export function isTauriSync(): boolean {
  return _isTauriReady === true;
}

/**
 * Safe invoke — calls the Tauri backend if available, otherwise throws
 * a descriptive error telling the user to use the dweb desktop app.
 */
export async function safeInvoke<T = unknown>(
  cmd: string,
  args?: InvokeArgs,
): Promise<T> {
  const ready = await ensureTauri();
  if (!ready || !tauriCore?.invoke) {
    console.warn(`[dweb] Tauri IPC not available — command '${cmd}' cannot run in browser`);
    throw new Error(
      `⚠️ This feature requires the dweb desktop app.\n\n` +
      `The command "${cmd}" needs the Rust backend which only runs inside the Tauri app.\n\n` +
      `👉 Open the dweb Tauri app window, or run:\n` +
      `   cd dweb && npx tauri dev`,
    );
  }
  return tauriCore.invoke(cmd, args) as Promise<T>;
}

/**
 * Safe invoke with fallback data — returns fallback instead of throwing
 * when Tauri is not available.
 */
export async function safeInvokeWithFallback<T = unknown>(
  cmd: string,
  args: InvokeArgs | undefined,
  fallback: T,
): Promise<T> {
  try {
    return await safeInvoke<T>(cmd, args);
  } catch {
    return fallback;
  }
}
