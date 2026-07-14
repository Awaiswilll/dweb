import { X } from "lucide-react";
import type { ShortcutDef } from "../hooks/useKeyboardShortcuts";
import { formatShortcut } from "../hooks/useKeyboardShortcuts";

interface ShortcutsHelpModalProps {
  shortcuts: ShortcutDef[];
  onClose: () => void;
}

export default function ShortcutsHelpModal({ shortcuts, onClose }: ShortcutsHelpModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 520,
          width: "90%",
          margin: "auto",
          padding: 0,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-color, #333)",
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            ⌨️ Keyboard Shortcuts
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-secondary, #999)",
              padding: 4,
              display: "flex",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Shortcuts list */}
        <div style={{ padding: "12px 20px 20px" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <tbody>
              {shortcuts
                .filter((s) => s.key !== "Escape")
                .map((shortcut, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom:
                        i < shortcuts.length - 2
                          ? "1px solid var(--border-color, #222)"
                          : "none",
                    }}
                  >
                    <td
                      style={{
                        padding: "10px 0",
                        color: "var(--text-secondary, #aaa)",
                      }}
                    >
                      {shortcut.description}
                    </td>
                    <td
                      style={{
                        padding: "10px 0",
                        textAlign: "right",
                      }}
                    >
                      <kbd
                        style={{
                          background: "var(--bg-secondary, #222)",
                          border: "1px solid var(--border-color, #444)",
                          borderRadius: 4,
                          padding: "2px 8px",
                          fontSize: 12,
                          fontFamily: "monospace",
                          color: "var(--text-primary, #eee)",
                        }}
                      >
                        {formatShortcut(shortcut)}
                      </kbd>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p
            style={{
              marginTop: 16,
              fontSize: 11,
              color: "var(--text-muted, #666)",
              textAlign: "center",
            }}
          >
            Press <kbd style={{ background: "var(--bg-secondary, #222)", border: "1px solid var(--border-color, #444)", borderRadius: 4, padding: "1px 6px", fontSize: 11, fontFamily: "monospace" }}>Esc</kbd> to close this dialog
          </p>
        </div>
      </div>
    </div>
  );
}
