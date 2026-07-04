/* ─── Core Data Models ─────────────────────────────────────── */

export interface Service {
  name: string;
  type: string;
  running: boolean;
  port: number;
  cpu: number;
  memory: number;
  url?: string;
  dir?: string;
}

export type DomainTier = "free" | "premium" | "business";

export interface TierInfo {
  label: string;
  price: number;
  ttlDays: number;
  permanent: boolean;
  customDomain: boolean;
  ssl: boolean;
  description: string;
}

export interface DomainRecord {
  name: string;
  owner_key: string;
  address: string | null;
  tier: DomainTier;
  tierInfo: TierInfo;
  service_name: string | null;
  port: number | null;
  custom_domain: string | null;
  registered_at: string;
  expires_at: string | null;
  auto_renew: boolean;
  active: boolean;
  paid_until: string | null;
}

export interface ServiceBinding {
  name: string;
  port: number;
  type: string;
}

export interface PeerInfo {
  id: string;
  publicKey: string;
  address: string;
  latency: number;
  connected: boolean;
  protocol: 'ipv4' | 'ipv6' | 'relay';
}

export interface DHTStats {
  connectedPeers: number;
  routingTableSize: number;
  domainsResolved: number;
  uptime: number;
  bandwidthUp: number;
  bandwidthDown: number;
}

export interface ActivityEvent {
  id: string;
  type: 'service' | 'domain' | 'peer' | 'ai' | 'cloud';
  message: string;
  timestamp: string;
  status: 'success' | 'info' | 'warning' | 'error';
}

export interface AIBuildResult {
  project_path: string;
  stack: string;
  port: number;
  dweb_url: string | null;
  files_created: string[];
}

export interface Template {
  id: string;
  name: string;
  description: string;
  stack: string;
  icon: string;
  color: string;
}

/* ─── AI Provider Types ────────────────────────────────────── */

export interface AIProviderConfig {
  provider_type: string;    // "ollama" | "openai" | "anthropic" | "google" | "together" | "groq" | "openrouter"
  enabled: boolean;
  label: string;
  api_key: string | null;
  base_url: string | null;
  default_model: string | null;
  temperature: number | null;
  max_tokens: number | null;
}

export interface AIModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
}

export interface StreamToken {
  token: string;
  done: boolean;
}

export interface SandboxStatus {
  data_dir: string;
  instance_port: number;
  instance_label: string;
  public_key: string;
  service_container_active: boolean;
  process_count: number;
  platform: string;
}

export interface GenerationResult {
  content: string;
  model: string;
  provider: string;
  tokens_in: number | null;
  tokens_out: number | null;
}

/* ─── Provider Defaults ────────────────────────────────────── */

export const AI_PROVIDER_LABELS: Record<string, string> = {
  ollama: 'Ollama (Local)',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
  google: 'Google Gemini',
  together: 'Together AI',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  huggingface: 'Hugging Face',
  mistral: 'Mistral AI',
  deepseek: 'DeepSeek',
  fireworks: 'Fireworks AI',
  cohere: 'Cohere',
  nvidia: 'NVIDIA NIM',
  cerebras: 'Cerebras',
  xai: 'xAI Grok',
  hyperbolic: 'Hyperbolic',
};

export const AI_PROVIDER_COLORS: Record<string, string> = {
  ollama: '#7C3AED',
  openai: '#10A37F',
  anthropic: '#D4A574',
  google: '#4285F4',
  together: '#4A90D9',
  groq: '#F97316',
  openrouter: '#8B5CF6',
  huggingface: '#FFD21E',
  mistral: '#FF6633',
  deepseek: '#4D6BFE',
  fireworks: '#FF4444',
  cohere: '#395999',
  nvidia: '#76B900',
  cerebras: '#2D9CDB',
  xai: '#1DA1F2',
  hyperbolic: '#A855F7',
};

export const AI_PROVIDER_ICONS: Record<string, string> = {
  ollama: '🦙',
  openai: '🤖',
  anthropic: '🌿',
  google: '🔮',
  together: '🤝',
  groq: '⚡',
  openrouter: '🔀',
  huggingface: '🤗',
  mistral: '🌬️',
  deepseek: '🔍',
  fireworks: '🎆',
  cohere: '🧠',
  nvidia: '💚',
  cerebras: '🧬',
  xai: '✖️',
  hyperbolic: '🌀',
};

/* ─── Version Control / Repo Types ─────────────────────────── */

export interface RepoInfo {
  path: string;
  name: string;
  current_branch: string;
  is_clean: boolean;
  modified_files: string[];
  staged_files: string[];
  untracked_files: string[];
  ahead: number;
  behind: number;
  last_commit: CommitInfo | null;
  remotes: RemoteInfo[];
  branches: BranchInfo[];
}

export interface CommitInfo {
  hash: string;
  short_hash: string;
  author: string;
  email: string;
  message: string;
  timestamp: string;
}

export interface BranchInfo {
  name: string;
  is_current: boolean;
  is_remote: boolean;
}

export interface RemoteInfo {
  name: string;
  url: string;
}

export interface GitLogEntry {
  hash: string;
  short_hash: string;
  author: string;
  email: string;
  message: string;
  timestamp: string;
}

export interface GitOperationResult {
  success: boolean;
  message: string;
  details: string | null;
}

export type GitProvider = "local" | "github" | "gitlab" | "bitbucket" | { other: string };

/* ─── GitHub Types ─────────────────────────────────────────── */

export interface GitHubAuthState {
  is_authenticated: boolean;
  username: string | null;
  token_preview: string | null;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval: number;
  expires_in: number;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  language: string | null;
  stars: number;
  forks: number;
  is_private: boolean;
  is_fork: boolean;
  default_branch: string;
  updated_at: string;
  owner: string;
  owner_avatar: string | null;
}

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string | null;
  public_repos: number;
}

export interface GitLabAuthState {
  is_authenticated: boolean;
  instance_url: string;
  username?: string;
}

export interface BitbucketAuthState {
  is_authenticated: boolean;
  workspace?: string;
  username?: string;
}

/* ─── Safe Invoke Wrappers for Git/GitHub ──────────────────── */

import { safeInvoke } from "./safe-invoke";

export const gitApi = {
  initRepo: (path: string) => safeInvoke<RepoInfo>("git_init_repo", { path }),
  cloneRepo: (url: string, path: string) => safeInvoke<RepoInfo>("git_clone_repo", { url, path }),
  repoStatus: (path: string) => safeInvoke<RepoInfo>("git_repo_status", { path }),
  stageAll: (path: string) => safeInvoke<GitOperationResult>("git_stage_all", { path }),
  stageFiles: (path: string, files: string[]) => safeInvoke<GitOperationResult>("git_stage_files", { path, files }),
  unstageAll: (path: string) => safeInvoke<GitOperationResult>("git_unstage_all", { path }),
  commit: (path: string, message: string) => safeInvoke<CommitInfo>("git_commit", { path, message }),
  push: (path: string, remote?: string, branch?: string) =>
    safeInvoke<GitOperationResult>("git_push", { path, remote, branch }),
  pull: (path: string, remote?: string, branch?: string) =>
    safeInvoke<GitOperationResult>("git_pull", { path, remote, branch }),
  branches: (path: string) => safeInvoke<BranchInfo[]>("git_branches", { path }),
  switchBranch: (path: string, name: string) => safeInvoke<GitOperationResult>("git_switch_branch", { path, name }),
  deleteBranch: (path: string, name: string) => safeInvoke<GitOperationResult>("git_delete_branch", { path, name }),
  remotes: (path: string) => safeInvoke<RemoteInfo[]>("git_remotes", { path }),
  addRemote: (path: string, name: string, url: string) =>
    safeInvoke<GitOperationResult>("git_add_remote", { path, name, url }),
  removeRemote: (path: string, name: string) =>
    safeInvoke<GitOperationResult>("git_remove_remote", { path, name }),
  log: (path: string, maxCount?: number) => safeInvoke<GitLogEntry[]>("git_log", { path, max_count: maxCount }),
  findRepos: (root: string) => safeInvoke<RepoInfo[]>("git_find_repos", { root }),
  detectProvider: (url: string) => safeInvoke<GitProvider>("git_detect_provider", { url }),
};

export const githubApi = {
  requestDeviceCode: () => safeInvoke<DeviceCodeResponse>("github_request_device_code", {}),
  pollForToken: (deviceCode: string, interval: number) =>
    safeInvoke<string>("github_poll_for_token", { device_code: deviceCode, interval }),
  checkAuth: () => safeInvoke<GitHubAuthState>("github_check_auth", {}),
  logout: () => safeInvoke<void>("github_logout", {}),
  getUser: () => safeInvoke<GitHubUser>("github_get_user", {}),
  listRepos: () => safeInvoke<GitHubRepo[]>("github_list_repos", {}),
  createRepo: (name: string, description?: string, private_?: boolean) =>
    safeInvoke<GitHubRepo>("github_create_repo", { name, description, private: private_ }),
  downloadArchive: (owner: string, repo: string, format?: string, branch?: string) =>
    safeInvoke<number[]>("github_download_archive", { owner, repo, archive_format: format, branch }),
  importRepo: (fullName: string, destPath: string) =>
    safeInvoke<RepoInfo>("github_import_repo", { full_name: fullName, dest_path: destPath }),
};

/* ─── App View Type ────────────────────────────────────────── */

export type View = "dashboard" | "browser" | "ai-agent" | "domains" | "repositories" | "settings" | "integrations" | "docs" | "p2p-dashboard" | "p2p-transfer";

/* ─── P2P Network Types ──────────────────────────────────── */

export interface P2PPeer {
  id: string;
  publicKey: string;
  address: string;
  port: number;
  hostname: string;
  platform: string;
  version: string;
  mode: string;
  services: string[];
  relayPort: number;
  age: number;
  connected: boolean;
  latency?: number;
  lastSeen?: number;
}

export interface P2PNetworkStatus {
  peerId: string;
  hostname: string;
  localIPs: string[];
  port: number;
  relayPort: number;
  mode: string;
  uptime: number;
  relayConnected: boolean;
  upstreamRelay: string | null;
  peersOnline: number;
  hostedServices: number;
  sharedSessions: number;
  services: string[];
  relayError: string | null;
}

export interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  timestamp: number;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

/* ─── Browser Tab Types ──────────────────────────────────── */

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  contentHtml: string;
  loading: boolean;
  history: string[];
  historyIndex: number;
  scrollPosition: number;
  resolvedDomain: DomainRecord | null;
  createdAt: number;
}

/* ─── Getting Started Tutorial ───────────────────────────── */

export interface Tutorial {
  id: string;
  title: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  stack: string;
  estimatedTime: string;
  steps: TutorialStep[];
}

export interface TutorialStep {
  title: string;
  content: string;
  code?: string;
}

/* ─── AI Agent Custom Stack ──────────────────────────────── */

export interface CustomStack {
  runtime: string;
  runtimeVersion?: string;
  frontend?: string;
  backend?: string;
  database?: string;
  cssFramework?: string;
  description: string;
}

export const RUNTIME_OPTIONS = [
  { value: "node", label: "Node.js", icon: "🟢" },
  { value: "python", label: "Python", icon: "🐍" },
  { value: "php", label: "PHP", icon: "🐘" },
  { value: "go", label: "Go", icon: "🔵" },
  { value: "ruby", label: "Ruby", icon: "💎" },
  { value: "static", label: "Static (HTML/CSS/JS)", icon: "📄" },
];

export const FRONTEND_OPTIONS = [
  { value: "react", label: "React", icon: "⚛️" },
  { value: "vue", label: "Vue", icon: "💚" },
  { value: "svelte", label: "Svelte", icon: "🧡" },
  { value: "angular", label: "Angular", icon: "🔴" },
  { value: "htmx", label: "HTMX", icon: "🔗" },
  { value: "none", label: "No Frontend (API only)", icon: "⚙️" },
];

export const BACKEND_OPTIONS = [
  { value: "express", label: "Express", icon: "🚂" },
  { value: "fastify", label: "Fastify", icon: "⚡" },
  { value: "fastapi", label: "FastAPI", icon: "🐍" },
  { value: "flask", label: "Flask", icon: "🧪" },
  { value: "django", label: "Django", icon: "🎯" },
  { value: "gin", label: "Gin", icon: "🏏" },
  { value: "rails", label: "Rails", icon: "💎" },
  { value: "laravel", label: "Laravel", icon: "🐘" },
];

export const DATABASE_OPTIONS = [
  { value: "postgresql", label: "PostgreSQL", icon: "🐘" },
  { value: "mysql", label: "MySQL", icon: "🐬" },
  { value: "mongodb", label: "MongoDB", icon: "🍃" },
  { value: "sqlite", label: "SQLite", icon: "📦" },
  { value: "redis", label: "Redis", icon: "🔴" },
  { value: "none", label: "No Database", icon: "🚫" },
];

export const CSS_OPTIONS = [
  { value: "tailwind", label: "Tailwind CSS", icon: "🌊" },
  { value: "bootstrap", label: "Bootstrap", icon: "🅱️" },
  { value: "chakra", label: "Chakra UI", icon: "🎨" },
  { value: "shadcn", label: "shadcn/ui", icon: "✨" },
  { value: "none", label: "Plain CSS", icon: "🎨" },
];

/* ─── AI Agent Session Types ─────────────────────────────── */

export interface AISession {
  id: string;
  label: string;
  created: number;
  updated: number;
  provider: string;
  model: string;
  messages: AISessionMessage[];
  summary: string;
}

export interface AISessionMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  step?: string;
}

/* ─── Social / Integration Platform Types ─────────────────── */

export type IntegrationPlatform = "discord" | "whatsapp" | "linkedin" | "telegram" | "github" | "gitlab";

export interface IntegrationConfig {
  platform: IntegrationPlatform;
  label: string;
  enabled: boolean;
  webhook_url?: string;      // Discord
  bot_token?: string;         // Telegram
  api_key?: string;           // WhatsApp / LinkedIn
  phone_number_id?: string;   // WhatsApp
  access_token?: string;      // LinkedIn
  company_id?: string;        // LinkedIn
  verified: boolean;
  lastTested: string | null;
  label_icon: string;
  color: string;
}

export const INTEGRATION_PLATFORMS: Record<IntegrationPlatform, {
  label: string;
  icon: string;
  color: string;
  description: string;
  fields: { key: string; label: string; placeholder: string; type: "text" | "password" | "textarea" }[];
}> = {
  discord: {
    label: "Discord",
    icon: "💬",
    color: "#5865F2",
    description: "Send notifications, build logs, and alerts to a Discord channel via webhook.",
    fields: [
      { key: "webhook_url", label: "Webhook URL", placeholder: "https://discord.com/api/webhooks/...", type: "password" },
    ],
  },
  whatsapp: {
    label: "WhatsApp",
    icon: "📱",
    color: "#25D366",
    description: "Send deployment alerts and build notifications via WhatsApp Business API.",
    fields: [
      { key: "api_key", label: "API Key", placeholder: "Enter your WhatsApp Business API key", type: "password" },
      { key: "phone_number_id", label: "Phone Number ID", placeholder: "Enter your WhatsApp Business phone number ID", type: "text" },
    ],
  },
  linkedin: {
    label: "LinkedIn",
    icon: "💼",
    color: "#0A66C2",
    description: "Share deployment updates and project announcements on LinkedIn.",
    fields: [
      { key: "access_token", label: "Access Token", placeholder: "Enter LinkedIn access token", type: "password" },
      { key: "company_id", label: "Company/Page ID", placeholder: "Optional: LinkedIn company page ID", type: "text" },
    ],
  },
  telegram: {
    label: "Telegram X",
    icon: "✈️",
    color: "#26A5E4",
    description: "Real-time alerts and build status updates via Telegram bot.",
    fields: [
      { key: "bot_token", label: "Bot Token", placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11", type: "password" },
    ],
  },
  github: {
    label: "GitHub",
    icon: "🐙",
    color: "#2b3137",
    description: "Connect repositories, trigger CI/CD, and manage deployments from GitHub.",
    fields: [
      { key: "access_token", label: "Personal Access Token", placeholder: "ghp_xxxxxxxxxxxxxxxxxxxx", type: "password" },
      { key: "webhook_url", label: "Webhook URL (optional)", placeholder: "https://api.github.com/repos/owner/repo/hooks", type: "text" },
    ],
  },
  gitlab: {
    label: "GitLab",
    icon: "🦊",
    color: "#FC6D26",
    description: "Connect GitLab projects, pipelines, and merge requests for automated deployment.",
    fields: [
      { key: "access_token", label: "Personal Access Token", placeholder: "glpat-xxxxxxxxxxxxxxxx", type: "password" },
      { key: "webhook_url", label: "Webhook URL (optional)", placeholder: "https://gitlab.com/api/v4/projects/...", type: "text" },
    ],
  },
};
