import { useEffect, useCallback, useState } from "react";
import type { View } from "../types";

interface ShortcutDef {
  key: string;          // e.g. "1", "k", "/"
  ctrl?: boolean;       // require Ctrl (Cmd on Mac)
  shift?: boolean;      // require Shift
  description: string;
  action: () => void;
}

interface UseKeyboardShortcutsOptions {
  onNavigate: (view: View) => void;
  onRefresh?: () => void;
  onShowHelp?: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  onNavigate,
  onRefresh,
  onShowHelp,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  const [helpVisible, setHelpVisible] = useState(false);

  const openHelp = useCallback(() => {
    setHelpVisible(true);
    onShowHelp?.();
  }, [onShowHelp]);

  const closeHelp = useCallback(() => {
    setHelpVisible(false);
  }, []);

  const shortcuts: ShortcutDef[] = [
    {
      key: "k",
      ctrl: true,
      description: "Open command palette / quick search",
      action: () => openHelp(),
    },
    {
      key: "1",
      ctrl: true,
      description: "Go to Dashboard",
      action: () => onNavigate("dashboard"),
    },
    {
      key: "2",
      ctrl: true,
      description: "Go to Browser",
      action: () => onNavigate("browser"),
    },
    {
      key: "3",
      ctrl: true,
      description: "Go to AI Agent",
      action: () => onNavigate("ai-agent"),
    },
    {
      key: "4",
      ctrl: true,
      description: "Go to Domains",
      action: () => onNavigate("domains"),
    },
    {
      key: "5",
      ctrl: true,
      description: "Go to Repositories",
      action: () => onNavigate("repositories"),
    },
    {
      key: "6",
      ctrl: true,
      description: "Go to Settings",
      action: () => onNavigate("settings"),
    },
    {
      key: "r",
      ctrl: true,
      shift: true,
      description: "Refresh services",
      action: () => onRefresh?.(),
    },
    {
      key: "/",
      ctrl: true,
      description: "Show keyboard shortcuts help",
      action: () => openHelp(),
    },
    {
      key: "Escape",
      description: "Close help dialog",
      action: () => closeHelp(),
    },
  ];

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture shortcuts when typing in input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        // Only handle Escape in input fields
        if (e.key !== "Escape") return;
      }

      const isCtrl = e.ctrlKey || e.metaKey; // metaKey for Mac Cmd
      const isShift = e.shiftKey;

      for (const shortcut of shortcuts) {
        const keyMatch = shortcut.key.toLowerCase() === e.key.toLowerCase();
        const ctrlMatch = shortcut.ctrl ? isCtrl : !isCtrl;
        const shiftMatch = shortcut.shift ? isShift : !isShift;

        if (keyMatch && ctrlMatch && shiftMatch) {
          e.preventDefault();
          shortcut.action();
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, shortcuts]); // eslint-disable-line react-hooks/exhaustive-deps

  return { helpVisible, openHelp, closeHelp, shortcuts };
}

/** Format a shortcut definition for display */
export function formatShortcut(shortcut: ShortcutDef): string {
  const parts: string[] = [];
  const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);

  if (shortcut.ctrl) {
    parts.push(isMac ? "⌘" : "Ctrl");
  }
  if (shortcut.shift) {
    parts.push(isMac ? "⇧" : "Shift");
  }

  // Make key display-friendly
  let keyDisplay = shortcut.key;
  if (shortcut.key === "/") keyDisplay = "/";
  else if (shortcut.key === "Escape") keyDisplay = "Esc";
  else keyDisplay = shortcut.key.toUpperCase();

  parts.push(keyDisplay);
  return parts.join(isMac ? " " : "+");
}
