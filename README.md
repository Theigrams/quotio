# Quotio

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="screenshots/menu_bar_dark.png" />
    <source media="(prefers-color-scheme: light)" srcset="screenshots/menu_bar.png" />
    <img alt="Quotio Banner" src="screenshots/menu_bar.png" height="600" />
  </picture>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS-lightgrey.svg?style=flat" alt="Platform macOS" />
  <img src="https://img.shields.io/badge/Swift-6.0-orange.svg?style=flat" alt="Swift 6" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-blue.svg?style=flat" alt="TypeScript" />
  <img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat" alt="License MIT" />
  <a href="https://discord.gg/dFzeZ7qS"><img src="https://img.shields.io/badge/Discord-Join%20us-5865F2.svg?style=flat&logo=discord&logoColor=white" alt="Discord" /></a>
</p>

<p align="center">
  <a href="README.vi.md"><img src="https://img.shields.io/badge/lang-Tiếng%20Việt-red.svg?style=flat" alt="Vietnamese" /></a>
  <a href="README.zh.md"><img src="https://img.shields.io/badge/lang-zh--CN-green.svg?style=flat" alt="Chinese" /></a>
  <a href="README.fr.md"><img src="https://img.shields.io/badge/lang-Français-blue.svg?style=flat" alt="French" /></a>
</p>

<p align="center">
  <strong>The ultimate command center for your AI coding assistants on macOS.</strong>
</p>

Quotio is a **hybrid Swift + TypeScript application** for managing AI coding agents. The native macOS menu bar app communicates with a TypeScript backend via IPC, providing multi-provider OAuth, quota tracking, and CLI tool configuration.

## ✨ Features

- **🔌 12+ AI Providers**: Gemini, Claude, OpenAI Codex, Qwen, Vertex AI, iFlow, Antigravity, Kiro, GitHub Copilot, GLM, and IDE quota tracking for Cursor/Trae.
- **📊 Standalone Quota Mode**: View quotas without running the proxy - perfect for quick checks.
- **🚀 One-Click Agent Setup**: Auto-detect and configure Claude Code, OpenCode, Gemini CLI, Codex CLI, Amp CLI, and Factory Droid.
- **🔀 Smart Fallback**: Automatic provider failover on 429/5xx errors with configurable fallback chains.
- **📈 Real-time Dashboard**: Monitor request traffic, token usage, and success rates.
- **🔑 API Key Management**: Generate and manage API keys for your local proxy.
- **🖥️ Menu Bar Integration**: Quick access to status, quotas, and provider icons.
- **🔄 Auto-Update**: Built-in Sparkle updater for seamless updates.
- **🌍 Multilingual**: English, Vietnamese, and Simplified Chinese.

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│     Swift macOS App (SwiftUI)       │
│  Menu bar, UI, @Observable state    │
└──────────────┬──────────────────────┘
               │ Unix Socket IPC (JSON-RPC 2.0)
               ▼
┌─────────────────────────────────────┐
│    quotio-cli Daemon (Bun + TS)     │
│  IPC handlers, process management   │
└──────────────┬──────────────────────┘
               │ HTTP / Subprocess
               ▼
┌─────────────────────────────────────┐
│   @quotio/server (Hono + TS)        │
│  OpenAI-compatible API, providers   │
└─────────────────────────────────────┘
```

## 🤖 Supported Ecosystem

### AI Providers

| Provider | Auth Method | Quota Tracking |
|----------|-------------|----------------|
| Google Gemini | OAuth | ✅ |
| Anthropic Claude | OAuth | ✅ |
| OpenAI Codex | OAuth | ✅ |
| Qwen Code | OAuth | ❌ |
| Vertex AI | Service Account | ❌ |
| iFlow | OAuth | ❌ |
| Antigravity | OAuth | ✅ |
| Kiro | CLI Auth | ❌ |
| GitHub Copilot | Device Code | ✅ |
| GLM | API Key | ❌ |

### IDE Quota Monitoring

| IDE | Description |
|-----|-------------|
| Cursor | Auto-detected quota usage |
| Trae | Auto-detected quota usage |

> **Note**: IDE tracking is monitor-only - they cannot be used as proxy providers.

### Compatible CLI Agents

| Agent | Config Format |
|-------|---------------|
| Claude Code | JSON + Environment |
| Codex CLI | TOML + JSON |
| Gemini CLI | Environment |
| Amp CLI | JSON + Environment |
| OpenCode | JSON |
| Factory Droid | JSON |

## 🚀 Installation

### Requirements

- macOS 15.0 (Sequoia) or later
- Internet connection for OAuth

### Homebrew (Recommended)

```bash
brew tap nguyenphutrong/tap
brew install --cask quotio
```

### Download

Download the latest `.dmg` from [Releases](https://github.com/nguyenphutrong/quotio/releases).

> ⚠️ **Note**: If macOS blocks the app, run:
> ```bash
> xattr -cr /Applications/Quotio.app
> ```

### Building from Source

```bash
# Clone repository
git clone https://github.com/nguyenphutrong/quotio.git
cd quotio

# Install TypeScript dependencies
bun install

# Build TypeScript packages
bun run build

# Open in Xcode
open Quotio.xcodeproj

# Build and run (Cmd + R)
```

## 📖 Usage

### 1. Start the Server

Launch Quotio → Click **Start** on the dashboard.

### 2. Connect Accounts

**Providers** tab → Select provider → Authenticate via OAuth or import credentials.

### 3. Configure Agents

**Agents** tab → Select agent → Click **Configure** → Choose Automatic or Manual mode.

### 4. Monitor Usage

- **Dashboard**: Overall health and traffic
- **Quota**: Per-account usage breakdown
- **Logs**: Request/response logs

## 🔀 Fallback Configuration

Configure automatic failover when providers return 429/5xx errors:

```bash
# List virtual models
quotio fallback list

# Create a fallback chain
quotio fallback add model my-claude-chain
quotio fallback add entry -n my-claude-chain -p claude -m claude-sonnet-4
quotio fallback add entry -n my-claude-chain -p gemini -m gemini-2.0-flash

# Enable/disable
quotio fallback enable
quotio fallback disable

# Export/import config
quotio fallback export > backup.json
quotio fallback import < backup.json
```

Configuration stored at `~/.config/quotio/fallback-config.json`.

## ⚙️ Settings

- **Port**: Proxy listening port (default: 8317)
- **Routing Strategy**: Round Robin or Fill First
- **Auto-start**: Launch proxy on app open
- **Notifications**: Low quota, cooling periods, errors
- **Mode**: Full (with proxy) or Quota-Only

## 📸 Screenshots

<details>
<summary>Click to expand screenshots</summary>

### Dashboard
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="screenshots/dashboard_dark.png" />
  <source media="(prefers-color-scheme: light)" srcset="screenshots/dashboard.png" />
  <img alt="Dashboard" src="screenshots/dashboard.png" />
</picture>

### Providers
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="screenshots/provider_dark.png" />
  <source media="(prefers-color-scheme: light)" srcset="screenshots/provider.png" />
  <img alt="Providers" src="screenshots/provider.png" />
</picture>

### Fallback Configuration
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="screenshots/fallback_dark.png" />
  <source media="(prefers-color-scheme: light)" srcset="screenshots/fallback.png" />
  <img alt="Fallback Configuration" src="screenshots/fallback.png" />
</picture>

### Quota Monitoring
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="screenshots/quota_dark.png" />
  <source media="(prefers-color-scheme: light)" srcset="screenshots/quota.png" />
  <img alt="Quota Monitoring" src="screenshots/quota.png" />
</picture>

</details>

## 🛠️ Development

### Project Structure

```
Quotio/                    # Swift macOS app
├── Models/                # Data types
├── Services/              # Business logic
├── ViewModels/            # @Observable state
└── Views/                 # SwiftUI views

packages/
├── core/                  # Shared TypeScript types
├── cli/                   # CLI daemon (Bun)
└── server/                # Proxy server (Hono)
```

### Build Commands

```bash
# Swift
xcodebuild -scheme Quotio -configuration Debug build

# TypeScript
bun install && bun run build

# Run CLI
./packages/cli/dist/quotio --help
```

See [docs/](docs/) for detailed architecture and code standards.

## 🤝 Contributing

1. Fork the project
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 💬 Community

<a href="https://discord.gg/dFzeZ7qS">
  <img src="https://img.shields.io/badge/Discord-Join%20our%20community-5865F2.svg?style=for-the-badge&logo=discord&logoColor=white" alt="Join Discord" />
</a>

## ⭐ Star History

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=nguyenphutrong/quotio&type=Date&theme=dark" />
  <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=nguyenphutrong/quotio&type=Date" />
  <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=nguyenphutrong/quotio&type=Date" />
</picture>

## 💖 Contributors

<a href="https://github.com/nguyenphutrong/quotio/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nguyenphutrong/quotio" />
</a>

## 📄 License

MIT License. See `LICENSE` for details.
