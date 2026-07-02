# dweb OS Privacy Policy

**Last Updated:** June 28, 2026

## Overview

dweb OS is a self-hosted, decentralized operating system designed to keep your data
on your own hardware. This privacy policy explains what data is collected, how it is
used, and your rights.

## What We Do NOT Collect

dweb OS runs entirely on your machine. We do **not** collect, store, or transmit:

- Your code or project files
- Your AI conversations or prompts
- Your API keys or credentials
- Your browsing history or file contents
- Your P2P network traffic
- Any telemetry or analytics data

## What Data Is Stored Locally

dweb OS stores the following data on your machine:

| Data Type | Location | Purpose |
|-----------|----------|---------|
| Service configurations | `~/.dweb/services/` | Track managed services |
| Domain records | `~/.dweb/domains/` | Manage .dweb domains |
| AI provider settings | `~/.dweb/ai/` | Store provider configs (API keys in system keychain) |
| P2P peer info | `~/.dweb/p2p/` | Cache peer discovery data |
| Chat sessions | Browser localStorage | AI agent conversation history |
| Theme preference | Browser localStorage | UI theme setting |

## API Keys and Credentials

- AI provider API keys are stored in your **system keychain** (not in plaintext config files)
- API keys are **never sent to our servers** (we have no servers)
- API keys are only used to make requests to the respective AI provider's API
- API keys are **never logged** or included in error messages

## P2P Network Data

When you connect to the dweb P2P network:

- Your **peer ID** (public key) is shared with other peers for discovery
- Your **IP address** is visible to peers you connect to directly (this is inherent to P2P)
- All P2P connections are **encrypted** (WebRTC uses DTLS + SRTP)
- Relay nodes **cannot read or modify** your relayed traffic
- You can disable P2P networking entirely in Settings

## AI Provider Data

When you use cloud AI providers (OpenAI, Anthropic, Google, etc.):

- Your prompts and code are sent to the **respective provider's API**
- Each provider has its own privacy policy (see below)
- You can use **Ollama (local)** to keep all AI processing on your machine
- We recommend reviewing each provider's privacy policy before use

### AI Provider Privacy Policies

| Provider | Privacy Policy |
|----------|---------------|
| OpenAI | https://openai.com/privacy |
| Anthropic | https://www.anthropic.com/privacy |
| Google Gemini | https://policies.google.com/privacy |
| NVIDIA NIM | https://www.nvidia.com/en-us/about-nvidia/privacy-policy/ |
| Groq | https://groq.com/privacy-policy/ |
| Mistral AI | https://mistral.ai/privacy |
| DeepSeek | https://www.deepseek.com/privacy |
| Together AI | https://www.together.ai/privacy |
| OpenRouter | https://openrouter.ai/privacy |
| Hugging Face | https://huggingface.co/privacy |
| Fireworks AI | https://fireworks.ai/privacy |
| Cohere | https://cohere.com/privacy |
| xAI | https://x.ai/privacy |
| Cerebras | https://cerebras.ai/privacy |
| Hyperbolic | https://hyperbolic.xyz/privacy |

## Third-Party Services

dweb OS may connect to the following third-party services (only if you configure them):

| Service | Data Shared | Purpose |
|---------|-------------|---------|
| GitHub | OAuth token, repo data | Git integration |
| AWS S3 | Access keys, files | Cloud deployment |
| Netlify | API token, build data | Cloud deployment |
| Vercel | API token, deployment data | Cloud deployment |

You control which services are connected. No data is shared without your explicit configuration.

## Children's Privacy

dweb OS is not directed to children under 13. We do not knowingly collect personal
information from children.

## Your Rights

You have the right to:

- **Access** all data stored by dweb OS on your machine
- **Delete** any data stored by dweb OS
- **Export** your configuration and data
- **Disable** any feature that shares data (P2P, AI providers, cloud deployment)
- **Run entirely offline** with no network connectivity

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be posted in this
document with an updated "Last Updated" date.

## Contact

For privacy questions or concerns, contact:

📧 **awais@dweb.dev**

---

**dweb OS** — One install. Every stack. Your own internet.

Copyright (c) 2026 Dr Awais Javed (Cyberion). MIT License.
