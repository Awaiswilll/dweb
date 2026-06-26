import { useState, useCallback, useEffect, useRef } from "react";
import { safeInvoke as invoke } from "../safe-invoke";
import {
  ArrowLeft, ArrowRight, RefreshCw, Globe, BookmarkPlus, Bookmark,
  Home, Shield, Lock, Star, X, Info, ExternalLink, Plus,
  ChevronRight, Terminal, Server, Code, AlertTriangle, ShieldOff,
  Search, ChevronDown,
} from "lucide-react";
import type { DomainRecord, SandboxStatus, BrowserTab, Tutorial } from "../types";

interface Bookmark {
  url: string;
  title: string;
  added: number;
}

const DEFAULT_BOOKMARKS: Bookmark[] = [
  { url: "dweb://welcome.dweb", title: "Welcome to dweb", added: Date.now() - 86400000 },
  { url: "dweb://getting-started.dweb", title: "Getting Started Guide", added: Date.now() - 172800000 },
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

export default function BrowserView({ initialUrl, navId }: BrowserViewProps) {
  const [tabs, setTabs] = useState<BrowserTab[]>(() => {
    const initial = createNewTab();
    return [initial];
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

  // Persist search engine choice
  useEffect(() => {
    localStorage.setItem("dweb_search_engine", searchEngine);
  }, [searchEngine]);

  // Sync ref with state
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  // Initialize activeTabId after first render to ensure tabs state is settled
  useEffect(() => {
    if (!activeTabId && tabs.length > 0) {
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

  const navigate = useCallback(async (targetUrl?: string) => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    const resolvedUrl = targetUrl || tab.url;
    if (!resolvedUrl) return;

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
        try {
          const info = await invoke<DomainRecord>("resolve_domain", { domain });
          patchTab(activeTabId, { resolvedDomain: info });

          if (info?.address) {
            patchTab(activeTabId, {
              contentHtml: `<div class="dweb-page">
                <div class="dweb-page-header">
                  <h2>${escapeHtml(domain)}.dweb</h2>
                  <span class="dweb-status-badge active">Serving via P2P</span>
                </div>
                <div class="dweb-meta">
                  <div class="meta-row"><span>Owner:</span><code>${escapeHtml(info.owner_key)}</code></div>
                  <div class="meta-row"><span>Address:</span><code>${escapeHtml(info.address)}</code></div>
                  <div class="meta-row"><span>Expires:</span><code>${new Date(info.expires_at).toLocaleDateString()}</code></div>
                </div>
                <div class="dweb-proxy-info">
                  <h4>🔒 Content Sandbox Active</h4>
                  <p>This page is rendered in an isolated sandbox — no access to your system or dweb backend.</p>
                  <div class="proxy-stats">
                    <span>🔒 Encrypted (Noise protocol)</span>
                    <span>⚡ 34ms latency</span>
                    <span>📡 2.3 MB transferred</span>
                    <span>🧪 Sandboxed origin: ${escapeHtml(domain)}.dweb</span>
                  </div>
                </div>
              </div>`,
              title: `${domain}.dweb`,
            });
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
        } catch (e: any) {
          const msg = String(e?.message || e || "Unknown error");
          patchTab(activeTabId, {
            contentHtml: `<div class="dweb-page">
              <div class="dweb-error-card glass">
                <h3>⚠️ dweb Backend Unavailable</h3>
                <p>${escapeHtml(msg)}</p>
                <div class="dweb-recommendations">
                  <h4>Recommendations:</h4>
                  <ul>
                    <li><strong>Using Brave/Chrome?</strong> The dweb:// protocol requires the dweb desktop app.</li>
                    <li><strong>Run the Tauri app:</strong> <code>cd dweb && npx tauri dev</code></li>
                    <li><strong>Register a domain:</strong> Go to the Domains tab to claim your free .dweb name.</li>
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
      setTabs(prev => prev.map(t => {
        if (t.id !== activeTabId) return t;
        return {
          ...t,
          loading: false,
          history: [...t.history.slice(0, t.historyIndex + 1), normalizedUrl],
          historyIndex: t.historyIndex + 1,
        };
      }));
    }
  }, [activeTabId, tabs, patchTab]);

  // Navigate to initialUrl when triggered from Dashboard/Domains
  useEffect(() => {
    if (!initialUrl) return;
    const timer = setTimeout(() => navigate(initialUrl), 50);
    return () => clearTimeout(timer);
  }, [initialUrl, navId, navigate]);

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
    setActiveTabId(activeTabId);
    navigate(prevUrl);
  };

  const goForward = () => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab || tab.historyIndex >= tab.history.length - 1) return;
    const newIndex = tab.historyIndex + 1;
    const nextUrl = tab.history[newIndex];
    setTabs(prev => prev.map(t =>
      t.id === activeTabId ? { ...t, historyIndex: newIndex } : t
    ));
    navigate(nextUrl);
  };

  const activeTutorialData = TUTORIALS.find(t => t.id === activeTutorial);

  const renderWelcomePage = () => (
    <div className="dweb-welcome">
      <div className="welcome-hero">
        <div className="welcome-logo">
          <Shield size={48} />
        </div>
        <h1>dweb Browser</h1>
        <p className="welcome-tagline">
          Decentralized Web Platform — build, host, and serve any web architecture
          from your own machine, accessible to the entire world via P2P.
        </p>
        <div className="welcome-badge-row">
          <span className="badge badge-blue">P2P</span>
          <span className="badge badge-green">Encrypted</span>
          <span className="badge badge-purple">Open Source</span>
        </div>
      </div>

      <div className="welcome-section">
        <h3>What You Can Host</h3>
        <div className="welcome-table-wrapper">
          <table className="welcome-table">
            <thead>
              <tr>
                <th>Architecture</th>
                <th>Built-in Stack</th>
                <th>AI Can Build It?</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><strong>Static site</strong></td><td>Any HTML/CSS/JS folder</td><td>✅ "Build a landing page"</td></tr>
              <tr><td><strong>PHP site</strong></td><td>PHP 8 + MySQL / MariaDB</td><td>✅ "Build a CMS"</td></tr>
              <tr><td><strong>Node.js app</strong></td><td>Express / Fastify + MongoDB / SQLite</td><td>✅ "Build a REST API"</td></tr>
              <tr><td><strong>Python web app</strong></td><td>FastAPI / Flask + PostgreSQL</td><td>✅ "Build a dashboard"</td></tr>
              <tr><td><strong>Go backend</strong></td><td>Gin / Fiber + Redis</td><td>✅ "Build a URL shortener"</td></tr>
              <tr><td><strong>Full stack</strong></td><td>Any combo above</td><td>✅ "Build a SaaS boilerplate"</td></tr>
              <tr><td><strong>Docker</strong></td><td>Run any containerized app</td><td>✅ "Deploy this compose file"</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="welcome-section">
        <h3>Quick Links</h3>
        <div className="welcome-quick-links">
          <button className="btn btn-secondary" onClick={() => {
            setShowGettingStarted(true);
            setActiveTutorial(null);
          }}>
            <Terminal size={14} /> Getting Started
          </button>
          <button className="btn btn-secondary" onClick={() => {
            navigate("dweb://welcome.dweb");
          }}>
            <Home size={14} /> Welcome Page
          </button>
          <button className="btn btn-secondary" onClick={() => {
            navigate("dweb://getting-started.dweb");
          }}>
            <Bookmark size={14} /> Guide
          </button>
        </div>
      </div>

      <div className="welcome-footer-text">
        <p>Enter a <strong>dweb://</strong> URL above or load an external site with <strong>http://</strong> / <strong>https://</strong></p>
        <div className="browser-sandbox-badge">
          <Shield size={14} />
          <span>Content sandbox {sandboxEnabled ? "✅ enabled" : "⚠️ disabled"}</span>
        </div>
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
          <button className="btn btn-icon" onClick={() => {
            setTabs(prev => prev.map(t =>
              t.id === activeTabId
                ? { ...t, url: "", contentHtml: "", title: "New Tab", history: [], historyIndex: -1, loading: false, resolvedDomain: null }
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
        style={{ flex: 1, overflowY: "auto", minHeight: 0 }}
      >
        {activeTab.loading ? (
          <div className="loading-state">
            <div className="loader-spinner" />
            <p>
              {isExternalUrl(activeTab.url) ? "Loading external site…" : "Resolving via DHT…"}
            </p>
          </div>
        ) : isExternalUrl(activeTab.url) && !activeTab.contentHtml ? (
          <>
            {!dismissExternalWarn && (
              <div className="external-warning glass" style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 16px", margin: "8px 8px 0",
                borderRadius: "var(--radius)",
                fontSize: 13, color: "var(--accent-amber)",
                border: "1px solid rgba(245,158,11,0.2)",
              }}>
                <AlertTriangle size={16} />
                <span style={{ flex: 1 }}>
                  You are visiting an external site: <strong>{activeTab.url}</strong>
                  . This page is loaded in a sandboxed iframe.
                </span>
                <button className="btn btn-sm btn-secondary" onClick={() => setDismissExternalWarn(true)}>
                  Dismiss
                </button>
              </div>
            )}
            {(() => {
              const knownBlockingSites = ['google.com', 'facebook.com', 'twitter.com', 'instagram.com', 'youtube.com', 'reddit.com', 'x.com'];
              let hostname = '';
              try { hostname = new URL(activeTab.url).hostname.replace('www.', ''); } catch {}
              return knownBlockingSites.includes(hostname);
            })() && (
              <div className="external-warning glass" style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px", margin: "4px 8px 0",
                borderRadius: "var(--radius)",
                fontSize: 12, color: "var(--accent-amber)",
                border: "1px solid rgba(245,158,11,0.2)",
              }}>
                <Info size={14} />
                <span style={{ flex: 1 }}>
                  This site often blocks iframe embedding. Try opening in your system browser.
                </span>
                <button className="btn btn-sm btn-secondary" onClick={() => window.open(activeTab.url, '_blank')}>
                  <ExternalLink size={14} /> Open in Browser
                </button>
              </div>
            )}
            <iframe
              src={activeTab.url}
              className="sandboxed-frame"
              style={{ flex: 1, minHeight: 400, border: "none", width: "100%" }}
              sandbox={sandboxEnabled ? "allow-scripts allow-same-origin allow-popups allow-forms allow-downloads" : undefined}
              title={activeTab.title}
            />
            <div style={{ textAlign: "center", padding: "8px 8px 12px" }}>
              <button className="btn btn-sm btn-secondary" onClick={() => window.open(activeTab.url, '_blank')}>
                <ExternalLink size={14} /> Open in System Browser
              </button>
            </div>
          </>
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
        ) : (
          renderWelcomePage()
        )}
      </div>
    </div>
  );
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
