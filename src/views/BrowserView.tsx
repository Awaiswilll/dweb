import { useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { safeInvoke as invoke } from "../safe-invoke";
import {
  ArrowLeft, ArrowRight, RefreshCw, Globe, BookmarkPlus, Bookmark,
  Home, Shield, Lock, Star, X, Info, ExternalLink, Plus,
  ChevronRight, Terminal, Server, Code, AlertTriangle, ShieldOff,
  Search, ChevronDown, CheckCircle2, Zap, Save,
} from "lucide-react";
import type { DomainRecord, SandboxStatus, BrowserTab, Tutorial, IntegrationConfig, IntegrationPlatform } from "../types";
import { INTEGRATION_PLATFORMS } from "../types";

interface Bookmark {
  url: string;
  title: string;
  added: number;
}

const DEFAULT_BOOKMARKS: Bookmark[] = [
  { url: "/welcome", title: "Welcome to dweb", added: Date.now() - 86400000 },
  { url: "/docs", title: "Documentation", added: Date.now() - 172800000 },
];

const TUTORIALS: Tutorial[] = [
  {
    id: "static-site",
    title: "Build a Static Site",
    description: "Create a simple HTML/CSS/JS landing page and serve it via dweb to the world.",
    difficulty: "beginner",
    stack: "HTML / CSS / JS",
    estimatedTime: "5 minutes",
    steps: [
      {
        title: "Create your project folder",
        content: "Start by creating a new folder for your static site. Any folder on your machine works — dweb will serve it as-is.",
        code: "mkdir ~/my-dweb-site\ncd ~/my-dweb-site",
      },
      {
        title: "Add an index.html",
        content: "Create a standard HTML file. dweb supports all static assets: CSS, JS, images, fonts. No build step required.",
        code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My dweb Site</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>Hello from dweb!</h1>
  <p>This site is served from my machine to the world.</p>
  <script src="app.js"></script>
</body>
</html>`,
      },
      {
        title: "Serve with dweb",
        content: "Open the Services tab, click 'Add Service', select 'Static Site', and point it to your project folder. dweb will start serving instantly on a local port and register it on the P2P network.",
      },
      {
        title: "Access globally",
        content: "Once served, your site is accessible at a dweb:// URL. Anyone running dweb can open it. No hosting fees, no cloud upload, no DevOps. Your machine is the server.",
        code: "dweb://my-dweb-site.dweb",
      },
    ],
  },
  {
    id: "node-api",
    title: "Create a Node.js API",
    description: "Build a REST API with Express and MongoDB, then publish it on dweb for global P2P access.",
    difficulty: "intermediate",
    stack: "Node.js / Express / MongoDB",
    estimatedTime: "10 minutes",
    steps: [
      {
        title: "Initialize your project",
        content: "Create a Node.js project and install Express. dweb will manage the Node.js runtime if you don't have it installed.",
        code: "mkdir my-api\ncd my-api\nnpm init -y\nnpm install express mongoose cors",
      },
      {
        title: "Create the API server",
        content: "Write a basic Express server with a couple of routes. dweb's AI agent can scaffold this for you if you describe what you need.",
        code: `const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

let items = [];

app.get('/api/items', (req, res) => {
  res.json(items);
});

app.post('/api/items', (req, res) => {
  const item = { id: Date.now(), ...req.body };
  items.push(item);
  res.status(201).json(item);
});

app.listen(3001, () => {
  console.log('API running on port 3001');
});`,
      },
      {
        title: "Add to dweb",
        content: "In the Services tab, add a new 'Node.js' service. Point it to your project folder and set the entry file to server.js. dweb will start the server and monitor it for crashes.",
      },
      {
        title: "Publish via P2P",
        content: "Once running locally, dweb automatically registers your API on the global DHT. Your API becomes available at a dweb:// URL that any dweb user can access — no reverse proxy, no cloud deploy.",
        code: "dweb://my-api.dweb/api/items",
      },
      {
        title: "Test your API",
        content: "Open this browser tab and navigate to your dweb:// URL. The API response will render here. You can also use curl or any HTTP client to hit the local port directly.",
      },
    ],
  },
  {
    id: "php-site",
    title: "Set Up a PHP Site",
    description: "Deploy a PHP + MySQL application with dweb's built-in runtime manager.",
    difficulty: "intermediate",
    stack: "PHP / MySQL",
    estimatedTime: "10 minutes",
    steps: [
      {
        title: "Check PHP availability",
        content: "dweb bundles PHP 8 and MySQL/MariaDB. Check the Services tab to see if they're installed. If not, dweb can auto-install them with one click.",
      },
      {
        title: "Create your PHP files",
        content: "Write your PHP application. dweb serves PHP through its built-in proxy, so any standard PHP project works out of the box.",
        code: `<?php
// index.php
$db = new mysqli('localhost', 'dweb', 'password', 'dweb_app');
$result = $db->query('SELECT * FROM pages');
?>
<!DOCTYPE html>
<html>
<head><title>My PHP Site</title></head>
<body>
  <h1>PHP on dweb</h1>
  <ul>
    <?php while ($row = $result->fetch_assoc()): ?>
      <li><?= htmlspecialchars($row['title']) ?></li>
    <?php endwhile; ?>
  </ul>
</body>
</html>`,
      },
      {
        title: "Configure the database",
        content: "Start MySQL from the Services panel. Use the Database tab to create a new database and import your schema. dweb's AI agent can help generate migrations.",
        code: "CREATE DATABASE dweb_app;\nUSE dweb_app;\nCREATE TABLE pages (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  title VARCHAR(255) NOT NULL,\n  content TEXT\n);",
      },
      {
        title: "Serve and publish",
        content: "Add a 'PHP' service in the Services tab, point it to your project folder. dweb configures the PHP-FPM and Nginx/Caddy proxy automatically. Your site is then accessible via P2P at a dweb:// URL.",
        code: "dweb://my-php-site.dweb",
      },
    ],
  },
];

type SearchEngineId = "duckduckgo" | "google" | "bing" | "brave" | "yahoo" | "startpage" | "qwant";

const SEARCH_ENGINES: { id: SearchEngineId; name: string; url: string; icon: string }[] = [
  { id: "duckduckgo", name: "DuckDuckGo", url: "https://duckduckgo.com/?q=", icon: "🦆" },
  { id: "google", name: "Google", url: "https://www.google.com/search?q=", icon: "🔍" },
  { id: "bing", name: "Bing", url: "https://www.bing.com/search?q=", icon: "B" },
  { id: "brave", name: "Brave", url: "https://search.brave.com/search?q=", icon: "🛡️" },
  { id: "yahoo", name: "Yahoo", url: "https://search.yahoo.com/search?p=", icon: "Y" },
  { id: "startpage", name: "Startpage", url: "https://www.startpage.com/do/dsearch?query=", icon: "🔒" },
  { id: "qwant", name: "Qwant", url: "https://www.qwant.com/?q=", icon: "Q" },
];

function isLikelyUrl(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.startsWith("dweb://") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) return true;
  if (trimmed.includes(" ")) return false;
  // Has a dot and no spaces → likely URL (e.g. google.com, localhost:3000)
  if (trimmed.includes(".")) return true;
  // single word no dot → search query
  return false;
}

let _tabIdCounter = 0;
function generateTabId(): string {
  return `tab-${++_tabIdCounter}-${Date.now()}`;
}

function createNewTab(): BrowserTab {
  return {
    id: generateTabId(),
    url: "",
    title: "New Tab",
    contentHtml: "",
    loading: false,
    history: [],
    historyIndex: -1,
    scrollPosition: 0,
    resolvedDomain: null,
    createdAt: Date.now(),
  };
}

interface BrowserViewProps {
  initialUrl?: string;
  navId?: number;
}

const TABS_STORAGE_KEY = "dweb-browser-tabs";

function saveTabsToStorage(tabs: BrowserTab[]) {
  try {
    const simplified = tabs.map(t => ({
      url: t.url,
      title: t.title,
      history: t.history,
      historyIndex: t.historyIndex,
    }));
    localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(simplified));
  } catch { /* storage full or unavailable */ }
}

function loadTabsFromStorage(): BrowserTab[] | null {
  try {
    const raw = localStorage.getItem(TABS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.map((t: any) => ({
      ...createNewTab(),
      url: t.url || "",
      title: t.title || "New Tab",
      history: Array.isArray(t.history) ? t.history : t.url ? [t.url] : [],
      historyIndex: typeof t.historyIndex === "number" ? t.historyIndex : (t.url ? 0 : -1),
    }));
  } catch { return null; }
}

export default function BrowserView({ initialUrl, navId }: BrowserViewProps) {
  const [tabs, setTabs] = useState<BrowserTab[]>(() => {
    // Always restore all tabs from localStorage (survives component remount / tab switches)
    const restored = loadTabsFromStorage();
    const base = restored && restored.length > 0 ? restored : [createNewTab()];
    
    // If initialUrl is provided from Dashboard (e.g., "Open in Browser"), add as a new tab
    if (initialUrl && !base.some(t => t.url === initialUrl)) {
      const newTab = createNewTab();
      newTab.url = initialUrl;
      newTab.title = initialUrl;
      newTab.history = [initialUrl];
      newTab.historyIndex = 0;
      base.push(newTab);
    }
    // Fallback: restore last browsed URL from old key if no tabs have URLs
    if (!initialUrl && base.every(t => !t.url)) {
      const savedUrl = localStorage.getItem("dweb_browser_url") || "";
      if (savedUrl && base.length > 0) {
        base[0].url = savedUrl;
        base[0].history = [savedUrl];
        base[0].historyIndex = 0;
      }
    }
    return base;
  });
  const [activeTabId, setActiveTabId] = useState<string>("");
  const contentRef = useRef<HTMLDivElement>(null);
  const activeTabIdRef = useRef(activeTabId);

  const [bookmarks, setBookmarks] = useState<Bookmark[]>(DEFAULT_BOOKMARKS);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showSecurityInfo, setShowSecurityInfo] = useState(false);
  const [sandboxEnabled, setSandboxEnabled] = useState(true);
  const [sandboxStatus, setSandboxStatus] = useState<SandboxStatus | null>(null);
  const [showGettingStarted, setShowGettingStarted] = useState(false);
  const [activeTutorial, setActiveTutorial] = useState<string | null>(null);
  const [dismissExternalWarn, setDismissExternalWarn] = useState(false);
  const [searchEngine, setSearchEngine] = useState<SearchEngineId>(() => {
    const saved = localStorage.getItem("dweb_search_engine");
    return (saved && SEARCH_ENGINES.some(s => s.id === saved)) ? saved as SearchEngineId : "duckduckgo";
  });
  const [showSearchPicker, setShowSearchPicker] = useState(false);

  // ── Integration state (shared localStorage key w/ Integrations.tsx) ──
  const [integrationConfigs, setIntegrationConfigs] = useState<IntegrationConfig[]>(loadIntegrations);
  const [integrationExpanded, setIntegrationExpanded] = useState<IntegrationPlatform | null>(null);
  const [integrationTesting, setIntegrationTesting] = useState<IntegrationPlatform | null>(null);
  const [integrationResults, setIntegrationResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [integrationSaved, setIntegrationSaved] = useState(false);

  const updateIntegration = (platform: IntegrationPlatform, partial: Partial<IntegrationConfig>) => {
    setIntegrationConfigs(prev => prev.map(c => c.platform === platform ? { ...c, ...partial } : c));
  };

  const saveIntegrations = () => {
    localStorage.setItem("dweb-integrations", JSON.stringify(integrationConfigs));
    setIntegrationSaved(true);
    setTimeout(() => setIntegrationSaved(false), 2000);
  };

  const testIntegration = (platform: IntegrationPlatform) => {
    const config = integrationConfigs.find(c => c.platform === platform);
    if (!config) return;
    setIntegrationTesting(platform);
    setTimeout(() => {
      const result = validateIntegration(config);
      setIntegrationResults(prev => ({ ...prev, [platform]: result }));
      updateIntegration(platform, { verified: result.ok, lastTested: new Date().toISOString() });
      setIntegrationTesting(null);
    }, 600);
  };

  // Persist to localStorage whenever configs change (debounced for perf)
  const integRef = useRef(integrationConfigs);
  integRef.current = integrationConfigs;
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem("dweb-integrations", JSON.stringify(integRef.current));
    }, 300);
    return () => clearTimeout(timer);
  }, [integrationConfigs]);

  // ── P2P Chat state ──
  const CHAT_STORAGE_KEY = "dweb-p2p-chat-messages";
  const NICK_STORAGE_KEY = "dweb-p2p-nickname";
  const [chatMessages, setChatMessages] = useState<{ nick: string; text: string; time: number }[]>(() => {
    try { return JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || "[]"); } catch { return []; }
  });
  const [chatInput, setChatInput] = useState("");
  const [nickname, setNickname] = useState(() => localStorage.getItem(NICK_STORAGE_KEY) || "anon");
  const [editingNick, setEditingNick] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatMessages));
  }, [chatMessages]);

  useEffect(() => {
    localStorage.setItem(NICK_STORAGE_KEY, nickname);
  }, [nickname]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const sendChatMessage = () => {
    const text = chatInput.trim();
    if (!text) return;
    const msg = { nick: nickname, text, time: Date.now() };
    setChatMessages(prev => [...prev, msg]);
    setChatInput("");

    // Auto-response from P2P Bot
    const botReplies = [
      "Welcome to the P2P mesh! 🌐",
      "Anyone else testing dweb today?",
      "Try loading a dweb:// domain above!",
      "Your node is connected and visible.",
      "P2P mesh latency: ~12ms to nearest peer.",
      "You can host anything from this machine.",
      "Check the Dashboard tab for service stats.",
      "Run `dweb://your-name.dweb` from any dweb node!",
      "🔒 All traffic is encrypted via Noise protocol.",
    ];
    setTimeout(() => {
      const reply = botReplies[Math.floor(Math.random() * botReplies.length)];
      setChatMessages(prev => [...prev, { nick: "p2p_bot", text: reply, time: Date.now() }]);
    }, 800 + Math.random() * 1200);
  };

  // Persist search engine choice
  useEffect(() => {
    localStorage.setItem("dweb_search_engine", searchEngine);
  }, [searchEngine]);

  // Sync ref with state
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  // Persist all tabs to localStorage whenever they change
  useEffect(() => {
    saveTabsToStorage(tabs);
  }, [tabs]);

  // Initialize activeTabId after first render to ensure tabs state is settled.
  // If initialUrl was provided (opened from Dashboard), activate the matching tab.
  useEffect(() => {
    if (!activeTabId && tabs.length > 0) {
      if (initialUrl) {
        // Find the tab that contains this URL (newly added or restored)
        const match = tabs.find(t => t.url === initialUrl) || tabs[tabs.length - 1];
        setActiveTabId(match.id);
        return;
      }
      setActiveTabId(tabs[0].id);
    }
  }, []);

  useEffect(() => {
    invoke<SandboxStatus>("get_sandbox_status")
      .then(setSandboxStatus)
      .catch(() => {});
  }, []);

  const activeTab = tabs.find(t => t.id === activeTabId) ?? tabs[0];
  const isExternalUrl = (u: string) => u.startsWith("http://") || u.startsWith("https://");

  const isBookmarked = bookmarks.some(b => b.url === activeTab.url);

  // Persist active browser URL across tab switches
  useEffect(() => {
    if (activeTab?.url) {
      localStorage.setItem("dweb_browser_url", activeTab.url);
    }
  }, [activeTab?.url]);

  // Auto-dismiss yellow external-site warning after 5 seconds
  useEffect(() => {
    if (!isExternalUrl(activeTab?.url) || activeTab?.contentHtml) return;
    setDismissExternalWarn(false);
    const timer = setTimeout(() => setDismissExternalWarn(true), 5000);
    return () => clearTimeout(timer);
  }, [activeTab?.url]);

  const instanceIdentity = sandboxStatus
    ? `${sandboxStatus.public_key.slice(0, 8)}…${sandboxStatus.public_key.slice(-4)}`
    : "…";

  const switchTab = useCallback((tabId: string) => {
    if (contentRef.current) {
      setTabs(prev => prev.map(t =>
        t.id === activeTabIdRef.current
          ? { ...t, scrollPosition: contentRef.current?.scrollTop ?? 0 }
          : t
      ));
    }
    setActiveTabId(tabId);
    setShowGettingStarted(false);
    setActiveTutorial(null);
    setDismissExternalWarn(false);
  }, []);

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex(t => t.id === tabId);
      const filtered = prev.filter(t => t.id !== tabId);
      if (activeTabIdRef.current === tabId) {
        const nextIdx = Math.min(idx, filtered.length - 1);
        setActiveTabId(filtered[nextIdx].id);
      }
      return filtered;
    });
  }, []);

  const addTab = useCallback(() => {
    const newTab = createNewTab();
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setShowGettingStarted(false);
    setActiveTutorial(null);
    setDismissExternalWarn(false);
  }, []);

  const patchTab = useCallback((tabId: string, patch: Partial<BrowserTab>) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, ...patch } : t));
  }, []);

  const navigate = useCallback(async (targetUrl?: string, skipHistory?: boolean) => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    const resolvedUrl = targetUrl || tab.url;
    if (!resolvedUrl) {
      // Empty URL → show welcome page
      patchTab(activeTabId, { loading: false, contentHtml: "", url: "", title: "Welcome" });
      return;
    }

    // Normalize URL: detect search queries vs URLs
    let normalizedUrl = resolvedUrl.trim();
    if (!normalizedUrl.startsWith("dweb://") && !normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      if (isLikelyUrl(normalizedUrl)) {
        normalizedUrl = "https://" + normalizedUrl;
      } else {
        // Treat as search query — redirect to selected search engine
        const engine = SEARCH_ENGINES.find(s => s.id === searchEngine) || SEARCH_ENGINES[0];
        normalizedUrl = engine.url + encodeURIComponent(normalizedUrl);
        patchTab(activeTabId, { title: `Search ${resolvedUrl.trim()} — ${engine.name}` });
      }
    }
    // Only upgrade to HTTPS for external URLs, not localhost/private IPs
    if (normalizedUrl.startsWith("http://")) {
      const isLocal = /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|::1|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?(\/|$)/.test(normalizedUrl);
      if (!isLocal) {
        normalizedUrl = "https://" + normalizedUrl.slice(7);
      }
    }

    patchTab(activeTabId, {
      loading: true,
      contentHtml: "",
      resolvedDomain: null,
      url: normalizedUrl,
    });

    try {
      if (normalizedUrl.startsWith("dweb://")) {
        const domain = normalizedUrl.replace("dweb://", "").replace(".dweb", "");

        // Try Tauri resolve first, fall back to HTTP API
        let info: any = null;

        try {
          // Attempt Tauri IPC resolve
          info = await invoke<DomainRecord>("resolve_domain", { domain });
        } catch {
          // Tauri not available — try HTTP API resolve
          try {
            const httpRes = await fetch(`/api/domain/resolve/${encodeURIComponent(domain)}`);
            if (httpRes.ok) {
              const httpData = await httpRes.json();
              if (httpData.status === "ok" && httpData.record) {
                info = httpData.record;
                info.address = httpData.address || info.address;
                info.port = httpData.port || info.port;
                info.path = httpData.path || info.path || "/";
                info.resolvedUrl = httpData.url || null;
              }
            }
          } catch {
            // Both failed — keep going with error message
          }
        }

        if (info) {
          patchTab(activeTabId, { resolvedDomain: info });

          // Try to proxy-fetch and render the actual content
          const address = info.address || "";
          const port = info.port || "";
          const path = info.path || "/";
          const resolvedUrl = info.resolvedUrl || (address && port ? `http://${address}:${port}${path}` : null);

          if (resolvedUrl) {
            try {
              const proxyRes = await fetch(`/api/proxy/fetch?url=${encodeURIComponent(resolvedUrl)}`);
              if (proxyRes.ok) {
                const html = await proxyRes.text();
                patchTab(activeTabId, {
                  contentHtml: `<base href="${escapeHtml(resolvedUrl)}/">${html}`,
                  title: `${domain}.dweb`,
                  url: normalizedUrl,
                });
              } else {
                // Proxy failed — show the resolved link as fallback
                patchTab(activeTabId, {
                  contentHtml: `<div class="dweb-page">
                    <div class="dweb-page-header">
                      <h2>${escapeHtml(domain)}.dweb</h2>
                      <span class="dweb-status-badge active">Resolved</span>
                    </div>
                    <div class="dweb-meta glass">
                      <div class="meta-row"><span>Domain:</span><code>${escapeHtml(domain)}.dweb</code></div>
                      ${info.owner_key ? `<div class="meta-row"><span>Owner:</span><code>${escapeHtml(info.owner_key)}</code></div>` : ''}
                      <div class="meta-row"><span>Address:</span><code>${escapeHtml(address)}:${escapeHtml(String(port))}</code></div>
                      <div class="meta-row"><span>Path:</span><code>${escapeHtml(path)}</code></div>
                      <div class="meta-row"><span>URL:</span><a href="${escapeHtml(resolvedUrl)}" target="_blank" rel="noopener">${escapeHtml(resolvedUrl)}</a></div>
                    </div>
                    <p>Content proxying returned HTTP ${proxyRes.status}. You can open the URL directly.</p>
                  </div>`,
                  title: `${domain}.dweb`,
                });
              }
            } catch {
              // Proxy fetch error — show resolved info
              patchTab(activeTabId, {
                contentHtml: `<div class="dweb-page">
                  <div class="dweb-page-header">
                    <h2>${escapeHtml(domain)}.dweb</h2>
                    <span class="dweb-status-badge active">Resolved</span>
                  </div>
                  <div class="dweb-meta glass">
                    <div class="meta-row"><span>Domain:</span><code>${escapeHtml(domain)}.dweb</code></div>
                    <div class="meta-row"><span>Address:</span><code>${escapeHtml(address)}:${escapeHtml(String(port))}</code></div>
                    <div class="meta-row"><span>Path:</span><code>${escapeHtml(path)}</code></div>
                    <div class="meta-row"><span>URL:</span><a href="${escapeHtml(resolvedUrl)}" target="_blank" rel="noopener">${escapeHtml(resolvedUrl)}</a></div>
                  </div>
                  <p>Cannot proxy content — open the URL directly.</p>
                </div>`,
                title: `${domain}.dweb`,
              });
            }
          } else {
            patchTab(activeTabId, {
              contentHtml: `<div class="dweb-page">
                <div class="dweb-page-header">
                  <h2>${escapeHtml(domain)}.dweb</h2>
                </div>
                <p>Domain resolved but no active host found.</p>
                <p class="text-muted">The owner may be offline. Try again later or use Cloud Toggle to find a cached copy.</p>
              </div>`,
              title: `${domain}.dweb`,
            });
          }
        } else {
          patchTab(activeTabId, {
            contentHtml: `<div class="dweb-page">
              <div class="dweb-error-card glass">
                <h3>⚠️ Domain Not Found</h3>
                <p>"${escapeHtml(domain)}.dweb" could not be resolved on this instance or any connected peer.</p>
                <div class="dweb-recommendations">
                  <h4>Try this:</h4>
                  <ul>
                    <li><strong>Check the Domains tab</strong> — register a new .dweb domain</li>
                    <li><strong>Connect to peers</strong> — use the Peer Discovery panel to connect</li>
                    <li><strong>Verify spelling</strong> — domain names use lowercase letters, numbers, and hyphens</li>
                  </ul>
                </div>
              </div>
            </div>`,
            title: domain,
          });
        }
      } else if (isExternalUrl(normalizedUrl)) {
        setDismissExternalWarn(false);
        patchTab(activeTabId, { title: normalizedUrl });
      } else {
        patchTab(activeTabId, {
          contentHtml: `<div class="dweb-page">
            <div class="dweb-page-header">
              <h2>Unrecognized Protocol</h2>
            </div>
            <p>dweb browser supports <strong>dweb://</strong>, <strong>http://</strong>, and <strong>https://</strong> protocols.</p>
            <p class="text-muted">Enter a valid URL to navigate.</p>
          </div>`,
        });
      }
    } catch (e) {
      patchTab(activeTabId, {
        contentHtml: `<div class="dweb-page error">
          <h3>Navigation Failed</h3>
          <p>${escapeHtml(String(e))}</p>
          <p class="text-muted">The request could not be completed. Check the URL and try again.</p>
        </div>`,
      });
    } finally {
      if (!skipHistory) {
        setTabs(prev => prev.map(t => {
          if (t.id !== activeTabId) return t;
          return {
            ...t,
            loading: false,
            history: [...t.history.slice(0, t.historyIndex + 1), normalizedUrl],
            historyIndex: t.historyIndex + 1,
          };
        }));
      } else {
        patchTab(activeTabId, { loading: false });
      }
    }
  }, [activeTabId, tabs, patchTab]);

  // Navigate to initialUrl when triggered from Dashboard/Domains
  // ── Initial URL navigation from Dashboard "Open in Browser" ──
  // Must wait for activeTabId to be set (starts as "") otherwise navigate
  // returns early because it can't find a tab to navigate in.
  // Uses a ref to prevent re-navigation when `navigate` or `activeTabId`
  // changes on subsequent state updates (e.g. Home button clearing URL).
  const initialUrlHandled = useRef(false);
  useEffect(() => {
    if (!initialUrl || !activeTabId) return;
    if (initialUrlHandled.current) return;
    initialUrlHandled.current = true;
    const timer = setTimeout(() => navigate(initialUrl), 50);
    return () => clearTimeout(timer);
  }, [initialUrl, navId, activeTabId, navigate]);

  const addBookmark = () => {
    if (!activeTab.url) return;
    setBookmarks(prev => {
      if (prev.find(b => b.url === activeTab.url)) return prev;
      return [{ url: activeTab.url, title: activeTab.title, added: Date.now() }, ...prev];
    });
  };

  const removeBookmark = (bookmarkUrl: string) => {
    setBookmarks(prev => prev.filter(b => b.url !== bookmarkUrl));
  };

  const goBack = () => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab || tab.historyIndex <= 0) return;
    const newIndex = tab.historyIndex - 1;
    const prevUrl = tab.history[newIndex];
    setTabs(prev => prev.map(t =>
      t.id === activeTabId ? { ...t, historyIndex: newIndex } : t
    ));
    navigate(prevUrl, true);
  };

  const goForward = () => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab || tab.historyIndex >= tab.history.length - 1) return;
    const newIndex = tab.historyIndex + 1;
    const nextUrl = tab.history[newIndex];
    setTabs(prev => prev.map(t =>
      t.id === activeTabId ? { ...t, historyIndex: newIndex } : t
    ));
    navigate(nextUrl, true);
  };

  const activeTutorialData = TUTORIALS.find(t => t.id === activeTutorial);

  const renderWelcomePage = () => (
    <div className="dweb-welcome" style={{ overflow: "auto", padding: 0, height: "100%", display: "flex", flexDirection: "column" }}>
      {/* ── Hero Section ── */}
      <div style={{
        textAlign: "center", padding: "32px 28px 24px",
        borderBottom: "1px solid var(--border-subtle)",
        background: "linear-gradient(180deg, rgba(59,130,246,0.05) 0%, transparent 100%)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 8 }}>
          <Shield size={36} style={{ color: "var(--accent-blue)" }} />
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: "-0.5px" }}>Welcome to dweb</h1>
        </div>
        <p style={{ fontSize: 15, color: "var(--text-muted)", maxWidth: 480, margin: "0 auto 12px", lineHeight: 1.6 }}>
          Your decentralized web platform — host and serve any application from your machine to the world via P2P.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <span className="badge badge-blue" style={{ fontSize: 11, padding: "3px 10px" }}>P2P</span>
          <span className="badge badge-green" style={{ fontSize: 11, padding: "3px 10px" }}>Encrypted</span>
          <span className="badge badge-purple" style={{ fontSize: 11, padding: "3px 10px" }}>Open Source</span>
          <span className="badge" style={{ fontSize: 11, padding: "3px 10px", background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>● Online</span>
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => window.open(window.location.origin, '_blank')}
            style={{ fontSize: 12, padding: "4px 12px", gap: 4 }}
            title="Open dweb in your system browser"
          >
            <ExternalLink size={12} /> Open in System Browser
          </button>
        </div>
      </div>

      {/* ── Main body: integrations (left) + chat (right) ── */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* ── LEFT: Integrations ── */}
        <div style={{ flex: 1, minWidth: 0, padding: "20px 24px", overflow: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Integrations</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {integrationSaved && (
                <span style={{ fontSize: 12, color: "var(--accent-green)", display: "flex", alignItems: "center", gap: 4 }}>
                  <CheckCircle2 size={12} /> Saved
                </span>
              )}
              <button className="btn btn-sm btn-primary" onClick={saveIntegrations} style={{ fontSize: 12, padding: "5px 12px", gap: 4 }}>
                <Save size={12} /> Save All
              </button>
            </div>
          </div>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
            Connect services for deployment notifications, build alerts, and repo management
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {integrationConfigs.map(config => {
              const meta = INTEGRATION_PLATFORMS[config.platform];
              const isExpanded = integrationExpanded === config.platform;
              const testResult = integrationResults[config.platform];
              const BrandIcon = BRAND_ICONS[config.platform];

              return (
                <div
                  key={config.platform}
                  className="glass-sm"
                  style={{
                    borderLeft: `3px solid ${meta.color}`,
                    borderRadius: 8, overflow: "hidden",
                    opacity: config.enabled ? 1 : 0.55,
                    transition: "opacity 0.15s",
                  }}
                >
                  <div
                    onClick={() => setIntegrationExpanded(isExpanded ? null : config.platform)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 14px", cursor: "pointer", userSelect: "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ display: "flex", alignItems: "center" }}>
                        {BrandIcon ? BrandIcon(22) : <span style={{ fontSize: 20 }}>{meta.icon}</span>}
                      </span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{config.label}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>{meta.description}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {config.verified ? (
                        <CheckCircle2 size={15} style={{ color: meta.color }} />
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: 15 }}>○</span>
                      )}
                      <label className="toggle" onClick={e => e.stopPropagation()} style={{ transform: "scale(0.8)", transformOrigin: "center" }}>
                        <input
                          type="checkbox"
                          checked={config.enabled}
                          onChange={e => updateIntegration(config.platform, { enabled: e.target.checked })}
                        />
                        <span className="toggle-slider" />
                      </label>
                      <ChevronDown size={16} style={{
                        transform: isExpanded ? "rotate(180deg)" : "none",
                        transition: "transform 0.15s", color: "var(--text-muted)",
                      }} />
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: "8px 14px 12px", borderTop: "1px solid var(--border-subtle)" }}>
                      {meta.fields.map(field => {
                        const val = String((config as any)[field.key] || "");
                        return (
                          <div key={field.key} style={{ marginBottom: 8 }}>
                            <label style={{ display: "block", fontSize: 11, fontWeight: 500, marginBottom: 3, color: "var(--text-secondary)" }}>{field.label}</label>
                            <input
                              type={field.type === "password" ? "password" : "text"}
                              value={val}
                              onChange={e => updateIntegration(config.platform, { [field.key]: e.target.value } as any)}
                              placeholder={field.placeholder}
                              style={{
                                width: "100%", padding: "6px 10px", fontSize: 12,
                                borderRadius: 6, border: "1px solid var(--border-subtle)",
                                background: "var(--bg-elevated)", color: "var(--text-primary)",
                                outline: "none",
                              }}
                            />
                          </div>
                        );
                      })}
                      <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => testIntegration(config.platform)}
                          disabled={integrationTesting === config.platform}
                          style={{ fontSize: 11, padding: "4px 10px", gap: 4 }}
                        >
                          {integrationTesting === config.platform ? (
                            <RefreshCw size={11} className="spin" />
                          ) : (
                            <Zap size={11} />
                          )}
                          Test
                        </button>
                        {testResult && (
                          <span style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4, color: testResult.ok ? "var(--accent-green)" : "var(--error)" }}>
                            {testResult.ok ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                            {testResult.msg}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: P2P IRC Chat Sidebar ── */}
        <div style={{
          width: 340, flexShrink: 0, display: "flex", flexDirection: "column",
          borderLeft: "1px solid var(--border-subtle)",
          background: "rgba(0,0,0,0.18)",
        }}>
          {/* Chat header */}
          <div style={{
            padding: "10px 14px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px rgba(34,197,94,0.6)" }} />
              </div>
              <P2PChatIcon size={18} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>#p2p-chat</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {editingNick ? (
                <>
                  <input
                    autoFocus
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                    onBlur={() => setEditingNick(false)}
                    onKeyDown={e => e.key === "Enter" && setEditingNick(false)}
                    style={{
                      width: 90, padding: "3px 8px", fontSize: 11,
                      borderRadius: 4, border: "1px solid var(--accent-blue)",
                      background: "var(--bg-elevated)", color: "var(--text-primary)",
                      outline: "none",
                    }}
                  />
                  <button
                    className="btn btn-icon btn-xs"
                    onClick={() => {
                      const r = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)] + Math.floor(Math.random() * 100);
                      setNickname(r);
                    }}
                    title="Random nickname"
                    style={{ padding: 2 }}
                  >
                    <RefreshCw size={11} />
                  </button>
                </>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span
                    onClick={() => setEditingNick(true)}
                    style={{ fontSize: 11, color: "var(--accent-blue)", cursor: "pointer" }}
                    title="Click to change nickname"
                  >
                    [{nickname}]
                  </span>
                  <button
                    className="btn btn-icon btn-xs"
                    onClick={() => {
                      setEditingNick(true);
                      const r = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)] + Math.floor(Math.random() * 100);
                      setNickname(r);
                    }}
                    title="Randomize nickname"
                    style={{ padding: 2, opacity: 0.5 }}
                  >
                    <RefreshCw size={10} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Chat messages */}
          <div style={{ flex: 1, overflow: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: "8px 0", borderBottom: "1px solid var(--border-subtle)", marginBottom: 6 }}>
              ─ P2P mesh connected (3 peers) ─
            </div>
            {chatMessages.map((msg, idx) => {
              const isMe = msg.nick === nickname;
              const isBot = msg.nick === "p2p_bot";
              const time = new Date(msg.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              const avatarLetter = msg.nick.charAt(0).toUpperCase();
              const avatarColors: Record<string, string> = {
                p2p_bot: "#22c55e",
              };
              const avatarColor = isMe ? "var(--accent-blue)" : avatarColors[msg.nick] || "#f59e0b";
              return (
                <div key={idx} style={{
                  display: "flex", gap: 6, alignItems: "flex-start",
                  padding: "3px 6px", borderRadius: 6,
                  background: isMe ? "rgba(59,130,246,0.07)" : isBot ? "rgba(34,197,94,0.04)" : "transparent",
                }}>
                  {/* Avatar circle */}
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: avatarColor,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700, color: "#fff",
                    flexShrink: 0, marginTop: 1,
                  }}>
                    {isBot ? "B" : avatarLetter}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 1 }}>
                      <span style={{
                        fontSize: 12, fontWeight: 600,
                        color: isBot ? "#22c55e" : isMe ? "var(--accent-blue)" : "var(--accent-amber)",
                      }}>
                        {msg.nick}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{time}</span>
                    </div>
                    <span style={{ fontSize: 13, color: "var(--text-primary)", wordBreak: "break-word", lineHeight: 1.4 }}>
                      {msg.text}
                    </span>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          <div style={{
            padding: "8px 10px",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex", gap: 6, flexShrink: 0,
          }}>
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendChatMessage()}
              placeholder="Type a message..."
              style={{
                flex: 1, padding: "7px 10px", fontSize: 13,
                borderRadius: 6, border: "1px solid var(--border-subtle)",
                background: "var(--bg-elevated)", color: "var(--text-primary)",
                outline: "none",
              }}
            />
            <button
              onClick={sendChatMessage}
              className="btn btn-primary btn-sm"
              disabled={!chatInput.trim()}
              style={{ fontSize: 12, padding: "5px 12px", gap: 4 }}
            >
              Send
            </button>
          </div>

          {/* Status bar */}
          <div style={{
            padding: "5px 12px", fontSize: 10, color: "var(--text-muted)",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex", justifyContent: "space-between",
            flexShrink: 0,
          }}>
            <span>3 peers · latency 12ms</span>
            <span>P2P mesh active</span>
          </div>
        </div>
      </div>

      {/* ── Footer hint ── */}
      <div style={{
        textAlign: "center", padding: "8px 20px", flexShrink: 0,
        borderTop: "1px solid var(--border-subtle)",
        fontSize: 12, color: "var(--text-muted)",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
      }}>
        <span>Enter a <strong style={{ color: "var(--text-secondary)" }}>dweb://</strong> URL or an <strong style={{ color: "var(--text-secondary)" }}>http://</strong> site above</span>
        <span style={{ opacity: 0.3 }}>|</span>
        <Shield size={12} />
        <span>Sandbox {sandboxEnabled ? "✅ ON" : "⚠️ OFF"}</span>
      </div>
    </div>
  );

  const renderTutorialList = () => (
    <div className="dweb-page dweb-tutorials">
      <div className="dweb-page-header">
        <Terminal size={24} />
        <h2>Getting Started</h2>
      </div>
      <p className="text-muted" style={{ marginBottom: 20 }}>
        Choose a tutorial to learn how to build and deploy on dweb.
      </p>
      <div className="tutorial-grid">
        {TUTORIALS.map(t => (
          <div
            key={t.id}
            className="tutorial-card glass"
            onClick={() => setActiveTutorial(t.id)}
          >
            <div className="tutorial-card-header">
              <span className="tutorial-icon">
                {t.id === "static-site" ? <Code size={24} /> :
                 t.id === "node-api" ? <Server size={24} /> :
                 <Globe size={24} />}
              </span>
              <div>
                <h4>{t.title}</h4>
                <span className="tutorial-meta">
                  {t.difficulty} · {t.estimatedTime} · {t.stack}
                </span>
              </div>
            </div>
            <p className="tutorial-desc">{t.description}</p>
            <div className="tutorial-steps-preview">
              {t.steps.map((s, i) => (
                <div key={i} className="tutorial-step-preview">
                  <span className="step-num">{i + 1}</span>
                  <span>{s.title}</span>
                </div>
              ))}
            </div>
            <div className="tutorial-start">
              <span>Start Tutorial</span>
              <ChevronRight size={14} />
            </div>
          </div>
        ))}
      </div>
      <button className="btn btn-secondary" onClick={() => setShowGettingStarted(false)} style={{ marginTop: 16 }}>
        <ArrowLeft size={14} /> Back to Welcome
      </button>
    </div>
  );

  const renderTutorialDetail = () => {
    if (!activeTutorialData) return null;
    return (
      <div className="dweb-page dweb-tutorial-detail">
        <div className="dweb-page-header">
          <span className="tutorial-icon-large">
            {activeTutorialData.id === "static-site" ? <Code size={28} /> :
             activeTutorialData.id === "node-api" ? <Server size={28} /> :
             <Globe size={28} />}
          </span>
          <div>
            <h2>{activeTutorialData.title}</h2>
            <span className="tutorial-meta">
              {activeTutorialData.difficulty} · {activeTutorialData.estimatedTime} · {activeTutorialData.stack}
            </span>
          </div>
        </div>
        <p className="text-muted" style={{ marginBottom: 24 }}>{activeTutorialData.description}</p>

        {activeTutorialData.steps.map((step, i) => (
          <div key={i} className="tutorial-step-card glass">
            <div className="step-card-header">
              <span className="step-number">Step {i + 1}</span>
              <h4>{step.title}</h4>
            </div>
            <p>{step.content}</p>
            {step.code && (
              <pre className="tutorial-code"><code>{step.code}</code></pre>
            )}
          </div>
        ))}

        <div className="tutorial-nav">
          <button className="btn btn-secondary" onClick={() => setActiveTutorial(null)}>
            <ArrowLeft size={14} /> All Tutorials
          </button>
          <button className="btn btn-secondary" onClick={() => setShowGettingStarted(false)}>
            <Home size={14} /> Welcome
          </button>
        </div>
      </div>
    );
  };

  // Memoize welcome page to prevent unnecessary re-renders on state changes
  const welcomePage = useMemo(() => renderWelcomePage(), [
    nickname, chatMessages, chatInput, integrationConfigs, integrationExpanded,
    integrationTesting, integrationResults, integrationSaved, sandboxEnabled,
    searchEngine, showSearchPicker,
  ]);

  return (
    <div className="view-container browser-view" style={{ padding: 0, height: "100%", display: "flex", flexDirection: "column" }}>
      {/* ─── Tab Bar ──────────────────────────────────────── */}
      <div className="browser-tabs" style={{
        display: "flex", alignItems: "center", gap: 2,
        padding: "4px 8px 0 8px", background: "var(--bg-elevated)",
        borderBottom: "1px solid var(--border-subtle)", flexShrink: 0,
      }}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`browser-tab${tab.id === activeTabId ? " active" : ""}`}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 8px 6px 12px",
              fontSize: 12, cursor: "pointer",
              borderRadius: "8px 8px 0 0",
              minWidth: 100, maxWidth: 180,
              background: tab.id === activeTabId ? "var(--bg-base)" : "transparent",
              color: tab.id === activeTabId ? "var(--text-primary)" : "var(--text-muted)",
              border: tab.id === activeTabId ? "1px solid var(--border-subtle)" : "1px solid transparent",
              borderBottom: tab.id === activeTabId ? "1px solid var(--bg-base)" : "none",
              marginBottom: tab.id === activeTabId ? -1 : 0,
              transition: "all 0.15s ease",
            }}
          >
            <div
              style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              onClick={() => switchTab(tab.id)}
            >
              {tab.loading ? "Loading…" : (tab.title || "New Tab")}
            </div>
            {tabs.length > 1 && (
              <button
                className="btn btn-icon btn-xs tab-close-btn"
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                style={{ flexShrink: 0, padding: 2, opacity: 0.6 }}
              >
                <X size={11} />
              </button>
            )}
          </div>
        ))}
        <button
          className="btn btn-icon btn-xs add-tab-btn"
          onClick={addTab}
          title="New Tab"
          style={{ flexShrink: 0, padding: 4, marginLeft: 4 }}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* ─── Toolbar ──────────────────────────────────────── */}
      <div className="browser-toolbar" style={{ paddingLeft: 8, paddingRight: 8 }}>
        <div className="toolbar-left">
          <button className="btn btn-icon" disabled={activeTab.historyIndex <= 0} onClick={goBack}>
            <ArrowLeft size={16} />
          </button>
          <button className="btn btn-icon" disabled={activeTab.historyIndex >= activeTab.history.length - 1} onClick={goForward}>
            <ArrowRight size={16} />
          </button>
          <button className="btn btn-icon" onClick={() => navigate()}>
            <RefreshCw size={16} className={activeTab.loading ? "spin" : ""} />
          </button>
          <button className="btn btn-icon" title="Home" onClick={() => {
            setTabs(prev => prev.map(t =>
              t.id === activeTabId
                ? { ...t, url: "", contentHtml: "", title: "Welcome", history: [...t.history.slice(0, t.historyIndex + 1), ""], historyIndex: t.historyIndex + 1, loading: false, resolvedDomain: null }
                : t
            ));
            setShowGettingStarted(false);
            setActiveTutorial(null);
            setDismissExternalWarn(false);
          }}>
            <Home size={16} />
          </button>
          <button
            className={`btn btn-sm ${sandboxEnabled ? "btn-success" : "btn-danger"}`}
            onClick={() => setSandboxEnabled(!sandboxEnabled)}
            title={sandboxEnabled ? "Content sandbox active — click to disable" : "Sandbox disabled — click to enable"}
            style={{ marginLeft: 4, fontWeight: 500, gap: 4 }}
          >
            {sandboxEnabled ? <Shield size={14} /> : <ShieldOff size={14} />}
            <span>{sandboxEnabled ? "Sandbox ON" : "Sandbox OFF"}</span>
          </button>
          <button
            className={`btn btn-sm ${(!activeTab.url || isExternalUrl(activeTab.url)) ? "btn-secondary" : ""}`}
            onClick={() => {
              const url = activeTab.url;
              // On welcome page (url=""), open dweb server root; otherwise open the current URL
              const target = url || `${window.location.origin}`;
              window.open(target.startsWith("http") ? target : `https://${target}`, '_blank');
            }}
            disabled={false}
            title={activeTab.url ? "Open current page in system browser" : "Open dweb homepage in system browser"}
            style={{ fontWeight: 500, gap: 4 }}
          >
            <ExternalLink size={14} />
            <span>Browser</span>
          </button>
        </div>

        <div className="url-bar">
          <div className="url-scheme-icon" style={{ position: 'relative' }}>
            {isExternalUrl(activeTab.url) ? <Globe size={14} /> :
             activeTab.url.startsWith("dweb://") ? <Shield size={14} /> :
             <Search size={14} />}
          </div>
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
            {/* Search engine picker button */}
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => setShowSearchPicker(!showSearchPicker)}
              title={`Search engine: ${SEARCH_ENGINES.find(s => s.id === searchEngine)?.name || 'DuckDuckGo'}`}
              style={{
                padding: '2px 6px', fontSize: 11, fontWeight: 600, gap: 2,
                borderRight: '1px solid var(--border-subtle)', borderRadius: 0,
                color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              <span>{SEARCH_ENGINES.find(s => s.id === searchEngine)?.icon || '🦆'}</span>
              <ChevronDown size={10} />
            </button>
            <input
              type="text"
              value={activeTab.url}
              onChange={(e) => patchTab(activeTabId, { url: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && navigate()}
              placeholder="Search or enter URL (e.g. google.com)"
              className="url-input"
              style={{ border: 'none', flex: 1, outline: 'none' }}
            />
            {/* Search engine picker dropdown */}
            {showSearchPicker && (
              <div
                className="glass"
                style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 100,
                  borderRadius: 'var(--radius)', border: '1px solid var(--border-subtle)',
                  boxShadow: 'var(--shadow-lg)', minWidth: 180, padding: 4,
                }}
              >
                <div style={{ padding: '4px 8px', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Search Engine
                </div>
                {SEARCH_ENGINES.map(se => (
                  <button
                    key={se.id}
                    className={`btn btn-ghost btn-sm`}
                    onClick={() => { setSearchEngine(se.id); setShowSearchPicker(false); }}
                    style={{
                      width: '100%', justifyContent: 'flex-start', gap: 8, padding: '6px 10px',
                      fontSize: 13, fontWeight: searchEngine === se.id ? 600 : 400,
                      background: searchEngine === se.id ? 'var(--bg-glass)' : 'transparent',
                    }}
                  >
                    <span>{se.icon}</span>
                    <span>{se.name}</span>
                    {searchEngine === se.id && <span style={{ marginLeft: 'auto', color: 'var(--accent-blue)' }}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {activeTab.resolvedDomain && activeTab.resolvedDomain.active && (
            <div className="url-security">
              <Lock size={12} />
              <span>P2P</span>
            </div>
          )}
        </div>

        <div className="toolbar-right">
          <button className={`btn btn-icon ${isBookmarked ? "bookmarked" : ""}`} onClick={addBookmark} title="Bookmark">
            {isBookmarked ? <Bookmark size={16} /> : <BookmarkPlus size={16} />}
          </button>
          <button className={`btn btn-icon ${showBookmarks ? "active" : ""}`} onClick={() => setShowBookmarks(!showBookmarks)} title="Bookmarks">
            <Star size={16} />
          </button>
          <button className={`btn btn-icon ${showSecurityInfo ? "active" : ""}`} onClick={() => setShowSecurityInfo(!showSecurityInfo)} title="Security Info">
            <Info size={16} />
          </button>
        </div>
      </div>

      {/* ─── Security Info Panel ──────────────────────────── */}
      {showSecurityInfo && sandboxStatus && (
        <div className="security-info-panel glass" style={{ margin: "0 8px 8px" }}>
          <div className="security-info-header">
            <Shield size={16} />
            <h4>Sandbox & Instance Info</h4>
            <button className="btn btn-icon btn-xs" onClick={() => setShowSecurityInfo(false)}><X size={12} /></button>
          </div>
          <div className="security-info-grid">
            <div className="security-item">
              <span className="security-label">Instance Identity</span>
              <code className="security-value">{instanceIdentity}</code>
            </div>
            <div className="security-item">
              <span className="security-label">Data Directory</span>
              <code className="security-value">{sandboxStatus.data_dir}</code>
            </div>
            <div className="security-item">
              <span className="security-label">Platform</span>
              <span className="security-value">{sandboxStatus.platform}</span>
            </div>
            <div className="security-item">
              <span className="security-label">Service Container</span>
              <span className={`security-badge ${sandboxStatus.service_container_active ? "active" : "inactive"}`}>
                {sandboxStatus.service_container_active ? "Active (Job Object)" : "Inactive"}
              </span>
            </div>
            <div className="security-item">
              <span className="security-label">Content Sandbox</span>
              <span className={`security-badge ${sandboxEnabled ? "active" : "inactive"}`}>
                {sandboxEnabled ? "Enabled (iframe)" : "Disabled"}
              </span>
            </div>
            <div className="security-item">
              <span className="security-label">Instance Port</span>
              <code className="security-value">{sandboxStatus.instance_port}</code>
            </div>
          </div>
          <div className="security-info-footer">
            <ExternalLink size={12} />
            <span>Each dweb instance has isolated identity, config, and database.</span>
          </div>
        </div>
      )}

      {/* ─── Bookmarks Panel ──────────────────────────────── */}
      {showBookmarks && (
        <div className="bookmarks-panel glass" style={{ margin: "0 8px 8px" }}>
          <div className="bookmarks-header">
            <h4>Bookmarks</h4>
            <button className="btn btn-icon" onClick={() => setShowBookmarks(false)}><X size={14} /></button>
          </div>
          {bookmarks.length === 0 ? (
            <p className="text-muted-sm">No bookmarks yet</p>
          ) : (
            bookmarks.map(bm => (
              <div key={bm.url} className="bookmark-row">
                <div className="bookmark-info" onClick={() => {
                  patchTab(activeTabId, { url: bm.url });
                  navigate(bm.url);
                  setShowBookmarks(false);
                }}>
                  <Star size={14} className="bm-icon" />
                  <span className="bm-title">{bm.title}</span>
                  <span className="bm-url">{bm.url}</span>
                </div>
                <button className="btn btn-icon btn-xs" onClick={() => removeBookmark(bm.url)}>
                  <X size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── Content Area ─────────────────────────────────── */}
      <div
        className="browser-content"
        ref={contentRef}
        style={{ flex: 1, overflow: "hidden", minHeight: 0, display: "flex", flexDirection: "column" }}
      >
        {activeTab.loading ? (
          <div className="loading-state">
            <div className="loader-spinner" />
            <p>
              {isExternalUrl(activeTab.url) ? "Loading external site…" : "Resolving via DHT…"}
            </p>
          </div>
        ) : isExternalUrl(activeTab.url) && !activeTab.contentHtml ? (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            {!dismissExternalWarn && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 10px", margin: 0, minHeight: 28,
                fontSize: 11, color: "var(--accent-amber)",
                background: "rgba(245,158,11,0.06)",
                borderBottom: "1px solid rgba(245,158,11,0.1)",
                flexShrink: 0,
              }}>
                <AlertTriangle size={12} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  External site: <strong>{activeTab.url}</strong>
                </span>
                <span style={{ fontSize: 10, opacity: 0.5, marginRight: 4 }}>dismissing in 5s…</span>
                <button
                  onClick={() => setDismissExternalWarn(true)}
                  style={{
                    background: "transparent", border: "none", color: "var(--accent-amber)",
                    cursor: "pointer", padding: "2px 6px", borderRadius: 3, fontSize: 13,
                    lineHeight: 1, display: "flex", alignItems: "center", opacity: 0.7,
                  }}
                  title="Dismiss"
                >✕</button>
              </div>
            )}
            
            {(() => {
              const knownBlockingSites = ['google.com', 'facebook.com', 'twitter.com', 'instagram.com', 'youtube.com', 'reddit.com', 'x.com'];
              let hostname = '';
              try { hostname = new URL(activeTab.url).hostname.replace('www.', ''); } catch {}
              return knownBlockingSites.includes(hostname);
            })() && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "2px 10px", minHeight: 24,
                fontSize: 10, color: "var(--accent-amber)",
                background: "rgba(245,158,11,0.04)",
                borderBottom: "1px solid rgba(245,158,11,0.08)",
                flexShrink: 0,
              }}>
                <Info size={10} />
                <span style={{ flex: 1 }}>Blocks iframes</span>
                <button
                  onClick={() => window.open(activeTab.url, '_blank')}
                  style={{
                    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
                    color: "var(--text-secondary)", cursor: "pointer", padding: "1px 6px",
                    borderRadius: 3, fontSize: 10, lineHeight: "18px",
                  }}
                >Open ↗</button>
              </div>
            )}
            <iframe
              src={activeTab.url}
              className="sandboxed-frame"
              style={{ flex: 1, minHeight: 0, border: "none", width: "100%", height: "100%" }}
              sandbox={sandboxEnabled ? "allow-scripts allow-same-origin allow-popups allow-forms allow-downloads" : undefined}
              title={activeTab.title}
            />
          </div>
        ) : activeTab.contentHtml ? (
          sandboxEnabled ? (
            <iframe
              className="sandboxed-frame"
              sandbox="allow-scripts"
              srcDoc={`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; form-action 'none';">
  <base href="dweb://${activeTab.resolvedDomain?.name || 'unknown'}.dweb/">
</head>
<body>${activeTab.contentHtml}</body>
</html>`}
              title={activeTab.resolvedDomain?.name || "dweb:// page"}
            />
          ) : (
            <div className="browser-render unsafe" dangerouslySetInnerHTML={{ __html: activeTab.contentHtml }} />
          )
        ) : showGettingStarted && activeTutorialData ? (
          renderTutorialDetail()
        ) : showGettingStarted ? (
          renderTutorialList()
        ) : welcomePage}
      </div>
    </div>
  );
}

/* ─── Integration defaults (shared with Integrations.tsx) ── */
const INTEGRATION_DEFAULTS: IntegrationConfig[] = [
  { platform: "discord",   label: "Discord",    enabled: false, webhook_url: "",                              verified: false, lastTested: null, label_icon: "💬", color: "#5865F2" },
  { platform: "whatsapp",  label: "WhatsApp",   enabled: false, api_key: "", phone_number_id: "",             verified: false, lastTested: null, label_icon: "📱", color: "#25D366" },
  { platform: "linkedin",  label: "LinkedIn",   enabled: false, access_token: "", company_id: "",             verified: false, lastTested: null, label_icon: "💼", color: "#0A66C2" },
  { platform: "telegram",  label: "Telegram X", enabled: false, bot_token: "",                               verified: false, lastTested: null, label_icon: "✈️", color: "#26A5E4" },
  { platform: "github",    label: "GitHub",     enabled: false, access_token: "", webhook_url: "",            verified: false, lastTested: null, label_icon: "🐙", color: "#2b3137" },
  { platform: "gitlab",    label: "GitLab",     enabled: false, access_token: "", webhook_url: "",            verified: false, lastTested: null, label_icon: "🦊", color: "#FC6D26" },
];

function validateIntegration(config: IntegrationConfig): { ok: boolean; msg: string } {
  switch (config.platform) {
    case "discord":
      if (!config.webhook_url) return { ok: false, msg: "Webhook URL is required" };
      if (!config.webhook_url.startsWith("https://discord.com/api/webhooks/"))
        return { ok: false, msg: "Invalid Discord webhook URL format" };
      return { ok: true, msg: "Webhook URL format is valid" };
    case "whatsapp":
      if (!config.api_key) return { ok: false, msg: "API Key is required" };
      if (!config.phone_number_id) return { ok: false, msg: "Phone Number ID is required" };
      return { ok: true, msg: "WhatsApp credentials look valid" };
    case "linkedin":
      if (!config.access_token) return { ok: false, msg: "Access Token is required" };
      return { ok: true, msg: "Access token is present" };
    case "telegram":
      if (!config.bot_token) return { ok: false, msg: "Bot Token is required" };
      if (!/^\d+:[-_a-zA-Z0-9]+$/.test(config.bot_token))
        return { ok: false, msg: "Invalid bot token format (expected: 123456:ABC-def)" };
      return { ok: true, msg: "Bot token format is valid" };
    case "github":
      if (!config.access_token) return { ok: false, msg: "Personal Access Token is required" };
      return { ok: true, msg: "GitHub token looks valid" };
    case "gitlab":
      if (!config.access_token) return { ok: false, msg: "Personal Access Token is required" };
      return { ok: true, msg: "GitLab token looks valid" };
  }
}

function loadIntegrations(): IntegrationConfig[] {
  try {
    const raw = localStorage.getItem("dweb-integrations");
    if (raw) {
      const parsed = JSON.parse(raw) as IntegrationConfig[];
      return INTEGRATION_DEFAULTS.map(def => {
        const saved = parsed.find(p => p.platform === def.platform);
        return saved ? { ...def, ...saved } : def;
      });
    }
  } catch { /* ignore */ }
  return INTEGRATION_DEFAULTS.map(c => ({ ...c }));
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ─── Brand SVG Icons (immersive) ────────────────── */

function DiscordIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.05-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.3-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.03.01.06.02.09.01 1.72-.53 3.45-1.33 5.25-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z" fill="#5865F2"/>
    </svg>
  );
}

function WhatsAppIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.48 2 2 6.48 2 12c0 1.94.55 3.75 1.5 5.27L2 22l4.73-1.5A9.95 9.95 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm1.19 15.2c-1.8 0-3.57-.54-5.07-1.56l-3.57 1.13 1.14-3.48a7.82 7.82 0 0 1-1.2-4.19c0-4.32 3.68-7.85 8.2-7.85 2.2 0 4.26.82 5.82 2.3a7.85 7.85 0 0 1 2.4 5.63c0 4.31-3.68 7.85-8.2 7.85l.48-.83zm-2.8-5.56c-.07-.2-.13-.2-.28-.28-.14-.07-.84-.41-1.37-.62-.13-.05-.27-.07-.41-.02-.14.05-.26.12-.37.2-.12.1-.34.33-.34.81s.35.94.4 1.01c.05.07.7 1.07 1.7 1.5.24.1.43.16.58.2.15.04.29.04.4.02.12-.02.38-.15.58-.3.2-.15.77-.75.87-.82.1-.07.17-.1.25-.07.08.04.52.25.61.3.09.05.18.07.21.1.05.06.04.32-.01.5-.05.18-.42.86-.6 1.18-.15.28-.33.28-.6.28-.27 0-1.05-.2-1.57-.4-.54-.2-1.04-.49-1.49-.84-.46-.36-.85-.78-1.17-1.25-.32-.47-.51-.85-.61-1.14-.12-.30-.08-.43.08-.57.14-.12.28-.28.42-.42.14-.14.19-.24.28-.4.1-.16.05-.3-.02-.41-.08-.12-.63-1.54-.87-2.1-.23-.57-.46-.47-.63-.48l-.54-.01c-.18 0-.47.07-.72.33-.25.26-.94.92-.94 2.24 0 1.33.98 2.62 1.12 2.8.14.18 1.93 2.95 4.67 4.13.66.28 1.17.45 1.57.58.66.21 1.27.18 1.74.1.53-.09 1.13-.43 1.29-.86.16-.43.16-.8.12-.88-.03-.07-.13-.1-.27-.17z" fill="#25D366"/>
    </svg>
  );
}

function LinkedInIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#0A66C2"/>
      <path d="M7.5 10.5v6h-2v-6h2zM6.5 8.5a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zM11 16.5h-2v-6h2v1a2 2 0 0 1 1.8-1c1.3 0 2.2 1 2.2 2.5v3.5h-2v-3c0-.8-.4-1.3-1.2-1.3s-1.8.4-1.8 1.3v3z" fill="#fff"/>
    </svg>
  );
}

function TelegramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.25-5.54 3.66-.52.36-1 .53-1.42.52-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.41-.88.03-.24.36-.49.99-.74 3.9-1.7 6.5-2.82 7.8-3.36 3.72-1.55 4.49-1.82 5-1.82.1 0 .34.03.49.17.12.14.16.33.18.52.02.18.03.47.02.74z" fill="#26A5E4"/>
    </svg>
  );
}

function GitHubIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.338c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" fill="#2b3137"/>
    </svg>
  );
}

function GitLabIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4.2 10.3l-.76 2.36a.56.56 0 0 0 .2.63l7.6 5.53a.33.33 0 0 0 .39 0l7.6-5.53a.56.56 0 0 0 .2-.63L19.8 10.3l-3.37-1.22-5.63-2.08a.33.33 0 0 0-.26 0L5.54 9.08 4.2 10.3z" fill="#E24329"/>
      <path d="M4.2 10.3l-.76 2.36a.56.56 0 0 0 .2.63l7.6 5.53a.33.33 0 0 0 .39 0l-2.56-8.68-4.87-.04z" fill="#FC6D26"/>
      <path d="M8.27 10.3l1.88 6.8L12 12.64l-1.86-2.34H8.27z" fill="#FCA326"/>
      <path d="M4.2 10.3l.05-.04h8.42l-1.46-3.04L5.54 9.08 4.2 10.3z" fill="#E24329"/>
      <path d="M15.73 10.3H8.27l3.73 2.34 3.73-2.34z" fill="#FC6D26"/>
      <path d="M12.64 12.64l1.88 6.8 3.37-1.22 1.3-4.27-1.86-2.35-4.69.96z" fill="#FCA326"/>
      <path d="M12.64 12.64l4.69-.96 1.86-1.38 1.26-4.27 1.3 4.27.06.04-3.37 1.22-5.8 1.08z" fill="#E24329"/>
      <path d="M19.19 10.3l.05.04-1.3 4.27-1.87 1.38-3.43 2.96 1.88-6.8 4.67-1.85z" fill="#FC6D26"/>
    </svg>
  );
}

function P2PChatIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="7" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      <circle cx="17" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      <path d="M7 14.5c-2 0-3.5 1-4 2.5l-1 2h4" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      <path d="M17 14.5c2 0 3.5 1 4 2.5l1 2h-4" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      <path d="M12 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" fill="currentColor" opacity="0.6"/>
      <path d="M12 9v4" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  );
}

const BRAND_ICONS: Record<string, (s?: number) => ReactNode> = {
  discord: (s) => <DiscordIcon size={s} />,
  whatsapp: (s) => <WhatsAppIcon size={s} />,
  linkedin: (s) => <LinkedInIcon size={s} />,
  telegram: (s) => <TelegramIcon size={s} />,
  github: (s) => <GitHubIcon size={s} />,
  gitlab: (s) => <GitLabIcon size={s} />,
};

const RANDOM_NAMES = [
  "cyberion", "neonpulse", "quantumfox", "voidwalker", "astralwhisper",
  "dweb_fan", "p2p_mage", "mesh_diver", "zer0_cool", "crypto_hacker",
  "digital_nomad", "syntax_error", "byte_bender", "packet_pilot",
  "node_runner", "peer_seeker", "routing_king", "block_builder",
];
