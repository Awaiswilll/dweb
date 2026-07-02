import { describe, it, expect, vi, beforeEach } from "vitest";

describe("safe-invoke", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should throw descriptive error when Tauri is not available", async () => {
    // Mock the module to return empty object (no invoke function)
    vi.doMock("@tauri-apps/api/core", () => ({}));

    const { safeInvoke } = await import("./safe-invoke");

    await expect(safeInvoke("test_command", {})).rejects.toThrow(
      "This feature requires the dweb desktop app",
    );
  });

  it("should throw error with command name in message", async () => {
    vi.doMock("@tauri-apps/api/core", () => ({}));

    const { safeInvoke } = await import("./safe-invoke");

    await expect(safeInvoke("get_services", {})).rejects.toThrow(
      "get_services",
    );
  });

  it("should return fallback when Tauri is not available", async () => {
    vi.doMock("@tauri-apps/api/core", () => ({}));

    const { safeInvokeWithFallback } = await import("./safe-invoke");

    const result = await safeInvokeWithFallback(
      "get_services",
      {},
      { services: [] },
    );

    expect(result).toEqual({ services: [] });
  });

  it("should return fallback of correct type", async () => {
    vi.doMock("@tauri-apps/api/core", () => ({}));

    const { safeInvokeWithFallback } = await import("./safe-invoke");

    const stringResult = await safeInvokeWithFallback("cmd", {}, "default");
    expect(stringResult).toBe("default");

    const numberResult = await safeInvokeWithFallback("cmd", {}, 42);
    expect(numberResult).toBe(42);

    const nullResult = await safeInvokeWithFallback("cmd", {}, null);
    expect(nullResult).toBeNull();
  });

  it("should warn to console when Tauri is not available", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.doMock("@tauri-apps/api/core", () => ({}));

    const { safeInvoke } = await import("./safe-invoke");

    await expect(safeInvoke("my_cmd")).rejects.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("my_cmd"),
    );

    warnSpy.mockRestore();
  });
});
