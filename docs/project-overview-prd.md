# Quotio - Project Overview and Product Requirements Document (PRD)

> **Last Updated**: January 17, 2026  
> **Version**: 2.0.0  
> **Platform**: macOS 15.0+ (Sequoia)

---

## Table of Contents

1. [Project Purpose](#project-purpose)
2. [Architecture Overview](#architecture-overview)
3. [Target Users](#target-users)
4. [Key Features](#key-features)
5. [Supported AI Providers](#supported-ai-providers)
6. [Compatible CLI Agents](#compatible-cli-agents)
7. [App Modes](#app-modes)
8. [System Requirements](#system-requirements)
9. [Roadmap](#roadmap)

---

## Project Purpose

Quotio is a **hybrid Swift + TypeScript application** that serves as the command center for AI coding assistants on macOS. The system consists of:

1. **Native macOS App** (`Quotio/`): Swift 6 + SwiftUI menu bar application
2. **CLI Daemon** (`packages/cli`): Bun-native daemon managing proxy lifecycle and IPC
3. **Proxy Server** (`packages/server`): Hono-based OpenAI-compatible proxy
4. **Shared Types** (`packages/core`): Cross-language type definitions

### Core Goals

1. **Centralized Account Management**: Manage 12+ AI provider accounts through unified OAuth and credential management.
2. **Quota Tracking**: Real-time monitoring across all connected accounts with visual feedback in menu bar.
3. **CLI Tool Configuration**: Auto-detect and configure 6 AI coding tools with one-click setup.
4. **Intelligent Failover**: Automatic provider switching on 429/5xx errors via fallback chains.
5. **Cross-Platform Backend**: TypeScript monorepo enables future Linux/Windows support.

### Problem Statement

Developers using AI coding assistants need to:
- Manage multiple accounts across different AI providers
- Track quota usage to avoid service interruptions
- Configure multiple CLI tools with consistent settings
- Handle rate limiting gracefully with automatic failover

Quotio solves these challenges with a hybrid architecture combining native macOS UI with cross-platform TypeScript backend.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Swift macOS App (SwiftUI)                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │ DaemonIPCClient  │  │ QuotaViewModel   │  │ StatusBar      │ │
│  │ (Unix Socket)    │  │ (@Observable)    │  │ Manager        │ │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬────────┘ │
│           │                     │                     │          │
│           └─────────────────────┼─────────────────────┘          │
│                                 │                                │
│                    Unix Socket IPC (quotio.sock)                 │
│                    JSON-RPC 2.0 Protocol                         │
└─────────────────────────────────┼────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                  quotio-cli daemon (Bun + TypeScript)            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │ IPC Handlers     │  │ ProxyProcess     │  │ Config Store   │ │
│  │ (50+ methods)    │  │ Manager          │  │ (file-based)   │ │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬────────┘ │
│           │                     │                     │          │
│           └─────────────────────┼─────────────────────┘          │
│                                 │                                │
│                        Subprocess spawn                          │
└─────────────────────────────────┼────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                  @quotio/server (Hono + TypeScript)              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │ OpenAI-compat    │  │ Provider         │  │ Credential     │ │
│  │ API Routes       │  │ Executors        │  │ Pool           │ │
│  └──────────────────┘  └──────────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
              ┌────────────────────────────────────┐
              │         AI Provider APIs           │
              │  (Claude, Gemini, OpenAI, etc.)    │
              └────────────────────────────────────┘
```

### Key Components

| Component | Technology | Role |
|-----------|------------|------|
| macOS App | Swift 6, SwiftUI, macOS 15+ | Native UI, menu bar, system integration |
| CLI Daemon | Bun, TypeScript | IPC server, process management |
| Proxy Server | Hono, Zod | OpenAI-compatible API, provider routing |
| Core Types | TypeScript | Shared models, type safety |

---

## Target Users

### Primary Users

1. **Professional Developers**: Engineers using AI coding assistants daily, managing multiple accounts.
2. **Power Users**: Developers working with multiple AI providers needing centralized monitoring.
3. **Team Leads/DevOps**: Personnel managing AI tool access and monitoring usage across accounts.

### User Personas

| Persona | Use Case | Key Needs |
|---------|----------|-----------|
| Solo Developer | Uses 2-3 AI tools daily | Quota tracking, easy setup |
| Freelancer | Multiple client accounts | Account switching, usage monitoring |
| Team Lead | Manages team quotas | Dashboard overview, notifications |
| DevOps Engineer | Infrastructure management | Proxy configuration, API key management |

---

## Key Features

### Multi-Provider Support

Connect and manage accounts from 12 AI providers:
- **OAuth-based**: Gemini, Claude, Codex, Qwen, iFlow, Antigravity
- **Device Code Flow**: GitHub Copilot
- **CLI Auth**: Kiro (Google OAuth / AWS Builder ID)
- **File Import**: Vertex AI (Service Account JSON)
- **IDE Detection**: Cursor, Trae (auto-detected from local databases)

### Quota Tracking

Visual quota monitoring with intelligent notifications:
- Per-account quota breakdown with progress bars
- Model-level usage tracking
- Automatic low-quota alerts (configurable threshold)
- Menu bar quota display with provider icons

### Fallback System

Automatic provider failover when requests fail:
- Virtual model definitions with priority-ordered fallback chains
- Automatic retry on 429 (rate limit) and 5xx errors
- Shared config at `~/.config/quotio/fallback-config.json`
- CLI and GUI management interfaces

### Agent Configuration

One-click configuration for 6 CLI coding tools:
- Automatic agent detection
- Configuration generation (JSON/TOML/Environment)
- Shell profile integration (zsh/bash/fish)
- Model slot customization (Opus/Sonnet/Haiku)

### Menu Bar Integration

Always-accessible status from the macOS menu bar:
- Proxy status indicator (running/stopped)
- Quota percentage display per provider
- Custom provider icons
- Color-coded status (green/yellow/red)
- Quick access popover

### Auto-Update

Seamless update experience via Sparkle framework:
- Background update checks
- One-click update installation
- Changelog display

### Multilingual Support

Full localization for:
- English (en)
- Vietnamese (vi)
- Simplified Chinese (zh-Hans)

---

## Supported AI Providers

| Provider | Authentication | Quota Tracking | IDE Only |
|----------|---------------|----------------|----------|
| **Google Gemini** | OAuth | Yes | No |
| **Anthropic Claude** | OAuth | Yes (via CLI) | No |
| **OpenAI Codex** | OAuth | Yes | No |
| **Qwen Code** | OAuth | No | No |
| **Vertex AI** | Service Account | No | No |
| **iFlow** | OAuth | No | No |
| **Antigravity** | OAuth | Yes | No |
| **Kiro (CodeWhisperer)** | CLI Auth | No | No |
| **GitHub Copilot** | Device Code | Yes | No |
| **GLM** | API Key | No | No |
| **Cursor** | Auto-detect | Yes | Yes |
| **Trae** | Auto-detect | Yes | Yes |

> **Note**: Cursor and Trae are IDE quota monitoring only - they cannot be used as proxy providers.

---

## Compatible CLI Agents

| Agent | Binary | Config Type | Config Files |
|-------|--------|-------------|--------------|
| **Claude Code** | `claude` | JSON + Environment | `~/.claude/settings.json` |
| **Codex CLI** | `codex` | TOML + JSON | `~/.codex/config.toml` |
| **Gemini CLI** | `gemini` | Environment Only | - |
| **Amp CLI** | `amp` | JSON + Environment | `~/.config/amp/settings.json` |
| **OpenCode** | `opencode`, `oc` | JSON | `~/.config/opencode/opencode.json` |
| **Factory Droid** | `droid`, `fd` | JSON | `~/.factory/config.json` |

---

## App Modes

### Full Mode (Default)

Complete functionality including proxy server management:

**Features:**
- Run local proxy server (@quotio/server)
- Manage multiple AI accounts
- Configure CLI agents
- Track quota in menu bar
- API key management for clients
- Request/response logging
- Fallback chain configuration

**Visible Pages:**
Dashboard, Quota, Providers, Agents, Fallback, API Keys, Logs, Settings, About

### Quota-Only Mode

Lightweight mode for quota monitoring without proxy overhead:

**Features:**
- Track quota in menu bar
- No proxy server required
- Minimal UI and resource usage
- Direct quota fetching via file system
- Similar to CodexBar / ccusage

**Visible Pages:**
Dashboard, Quota, Accounts, Settings, About

---

## System Requirements

### Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **Architecture** | Apple Silicon or Intel x64 | Apple Silicon |
| **Memory** | 4 GB RAM | 8 GB RAM |
| **Storage** | 100 MB available | 200 MB available |

### Software Requirements

| Requirement | Version |
|-------------|---------|
| **macOS** | 15.0 (Sequoia) or later |
| **Xcode** (development) | 16.0+ |
| **Swift** (development) | 6.0+ |
| **Bun** (development) | 1.1.0+ |

### Network Requirements

- Internet connection for OAuth authentication
- Localhost access for proxy server (ports 8317, 18317)
- Access to GitHub API for binary downloads

---

## Roadmap

### Current (v2.0)
- ✅ Hybrid Swift + TypeScript architecture
- ✅ Daemon IPC communication
- ✅ 12 AI provider support
- ✅ Fallback system with virtual models
- ✅ 6 CLI agent configurations

### Planned
1. **Remote Mode**: Connect to remote proxy servers
2. **Cloudflare Tunnel**: Expose proxy over internet securely
3. **Team Features**: Shared account management
4. **Usage Analytics**: Trends and predictions
5. **Linux/Windows CLI**: Cross-platform quota tracking

---

## References

- [Quotio GitHub Repository](https://github.com/nguyenphutrong/quotio)
- [Sparkle Framework Documentation](https://sparkle-project.org/)
- [SwiftUI Documentation](https://developer.apple.com/documentation/swiftui)
- [Hono Documentation](https://hono.dev/)
