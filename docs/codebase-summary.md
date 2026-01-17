# Quotio - Codebase Summary

> **Last Updated**: January 17, 2026  
> **Version**: 2.0.0  
> **Architecture**: Hybrid Swift + TypeScript

---

## Table of Contents

1. [Technology Stack](#technology-stack)
2. [Module Overview](#module-overview)
3. [Entry Points](#entry-points)
4. [Key Files Reference](#key-files-reference)
5. [Data Flow Diagrams](#data-flow-diagrams)
6. [Dependency Graph](#dependency-graph)
7. [Runtime Files](#runtime-files)

---

## Technology Stack

### macOS Application (Swift)

| Category | Technology |
|----------|------------|
| **Platform** | macOS 15.0+ (Sequoia) |
| **Language** | Swift 6 with strict concurrency |
| **UI Framework** | SwiftUI |
| **App Framework** | AppKit (NSStatusBar, NSPasteboard) |
| **Concurrency** | Swift Concurrency (async/await, actors) |
| **State** | @Observable macro pattern |
| **Package Manager** | Swift Package Manager |
| **Auto-Update** | Sparkle Framework |

### TypeScript Monorepo

| Category | Technology |
|----------|------------|
| **Runtime** | Bun 1.1+ |
| **Monorepo** | Turborepo |
| **HTTP Framework** | Hono 4.7+ |
| **Validation** | Zod 3.24+ |
| **Linting** | Biome (replaces ESLint/Prettier) |
| **Language** | TypeScript 5.8+ |

---

## Module Overview

### Swift macOS App (`Quotio/`)

```
Quotio/
├── QuotioApp.swift              # @main entry, AppDelegate, ContentView
├── Models/                      # 16 files - Enums, Codable structs
│   ├── Models.swift             # AIProvider, AuthFile, ProxyStatus
│   ├── AgentModels.swift        # CLIAgent, AgentConfiguration
│   ├── FallbackModels.swift     # VirtualModel, FallbackEntry
│   └── OperatingMode.swift      # Full/QuotaOnly mode management
├── Services/                    # 30+ files - Business logic
│   ├── Daemon/                  # IPC client and daemon services
│   │   ├── DaemonIPCClient.swift    # Unix socket JSON-RPC client
│   │   ├── DaemonManager.swift      # Daemon lifecycle
│   │   ├── DaemonProxyConfigService.swift
│   │   ├── DaemonAuthService.swift
│   │   └── DaemonQuotaService.swift
│   ├── Proxy/                   # Proxy management
│   │   ├── CLIProxyManager.swift    # Binary lifecycle
│   │   ├── ProxyBridge.swift        # TCP connection bridge
│   │   └── FallbackFormatConverter.swift
│   ├── QuotaFetchers/           # Provider-specific fetchers
│   │   └── *QuotaFetcher.swift  # 8 actor-based fetchers
│   └── StatusBarManager.swift   # Menu bar integration
├── ViewModels/                  # 3 files - @Observable state
│   ├── QuotaViewModel.swift     # Central app state
│   ├── AgentSetupViewModel.swift
│   └── LogsViewModel.swift
├── Views/                       # UI components
│   ├── Screens/                 # 8 full-page views
│   ├── Components/              # 20+ reusable components
│   └── Onboarding/              # 5 onboarding steps
└── Assets.xcassets/             # Icons and colors
```

### CLI Package (`packages/cli/`)

```
packages/cli/
├── src/
│   ├── index.ts                 # CLI entry point
│   ├── cli/
│   │   └── commands/            # Command handlers
│   │       ├── proxy.ts         # proxy start/stop/status
│   │       ├── auth.ts          # auth list/delete
│   │       ├── quota.ts         # quota fetch/list
│   │       └── fallback.ts      # fallback management
│   ├── ipc/
│   │   ├── server.ts            # Unix socket server
│   │   └── protocol.ts          # JSON-RPC 2.0 types
│   └── services/
│       ├── daemon/
│       │   └── service.ts       # 50+ IPC method handlers
│       ├── proxy-process/       # Server subprocess management
│       ├── quota-fetchers/      # Provider quota extraction
│       ├── fallback/            # Virtual model routing
│       └── agent-detection/     # CLI agent discovery
└── package.json
```

### Server Package (`packages/server/`)

```
packages/server/
├── src/
│   ├── index.ts                 # Hono app entry
│   ├── api/
│   │   └── routes/
│   │       ├── v1/              # OpenAI-compatible endpoints
│   │       ├── management/      # Admin API
│   │       └── oauth/           # OAuth callbacks
│   ├── executor/                # Provider request handlers
│   │   ├── claude.ts
│   │   ├── gemini.ts
│   │   ├── openai.ts
│   │   ├── copilot.ts
│   │   ├── pool.ts              # Credential pooling
│   │   └── selector.ts          # Round Robin / Fill First
│   ├── translator/              # Request format conversion
│   ├── auth/                    # OAuth implementations
│   │   └── oauth/               # Per-provider handlers
│   └── resilience/              # Circuit breaker, retry
└── package.json
```

### Core Package (`packages/core/`)

```
packages/core/
├── src/
│   ├── index.ts                 # Barrel export
│   ├── models/
│   │   ├── provider.ts          # AIProvider enum
│   │   ├── agent.ts             # CLIAgent enum
│   │   ├── fallback.ts          # VirtualModel, FallbackEntry
│   │   ├── auth.ts              # AuthFile, Credential
│   │   ├── quota.ts             # QuotaResult, UsageStats
│   │   └── config.ts            # AppConfig types
│   └── types/
│       └── index.ts             # Shared utility types
└── package.json
```

---

## Entry Points

| Module | Entry Point | Purpose |
|--------|-------------|---------|
| macOS App | `Quotio/QuotioApp.swift` | SwiftUI @main, AppDelegate, menu bar |
| CLI | `packages/cli/src/index.ts` | Bun CLI with command parser |
| Server | `packages/server/src/index.ts` | Hono HTTP server |
| Core | `packages/core/src/index.ts` | Shared type exports |

---

## Key Files Reference

### Swift - Models

| File | Key Types | Purpose |
|------|-----------|---------|
| `Models.swift` | `AIProvider`, `AuthFile`, `ProxyStatus`, `NavigationPage` | Core domain types |
| `AgentModels.swift` | `CLIAgent`, `AgentConfiguration`, `ModelSlot` | CLI agent definitions |
| `FallbackModels.swift` | `VirtualModel`, `FallbackEntry`, `FallbackConfiguration` | Fallback chain types |
| `OperatingMode.swift` | `OperatingMode`, `OperatingModeManager` | Full/QuotaOnly mode |

### Swift - Services

| File | Pattern | Purpose |
|------|---------|---------|
| `DaemonIPCClient.swift` | Actor | Unix socket JSON-RPC client |
| `DaemonManager.swift` | @MainActor @Observable | Daemon lifecycle management |
| `CLIProxyManager.swift` | @MainActor @Observable | Proxy binary and process control |
| `ProxyBridge.swift` | Class | TCP connection bridging |
| `StatusBarManager.swift` | @MainActor Singleton | Menu bar icon and state |
| `*QuotaFetcher.swift` | Actor | Provider-specific quota extraction |

### Swift - ViewModels

| File | Class | Responsibilities |
|------|-------|------------------|
| `QuotaViewModel.swift` | `QuotaViewModel` | Central state, proxy control, OAuth, quotas |
| `AgentSetupViewModel.swift` | `AgentSetupViewModel` | Agent detection, configuration |
| `LogsViewModel.swift` | `LogsViewModel` | Request log fetching and display |

### TypeScript - CLI

| File | Exports | Purpose |
|------|---------|---------|
| `services/daemon/service.ts` | `createDaemonService` | 50+ IPC method handlers |
| `ipc/protocol.ts` | `IPCMethods`, request/response types | JSON-RPC 2.0 contract |
| `services/proxy-process/manager.ts` | `ProxyProcessManager` | Server subprocess control |
| `services/fallback/settings-service.ts` | `FallbackSettingsService` | Shared config read/write |

### TypeScript - Server

| File | Exports | Purpose |
|------|---------|---------|
| `api/index.ts` | `createApp` | Hono app factory |
| `proxy/dispatcher.ts` | `ProxyDispatcher` | Request routing to providers |
| `executor/pool.ts` | `CredentialPool` | Account rotation with cooldown |
| `translator/*.ts` | Format converters | OpenAI ↔ Provider translation |

---

## Data Flow Diagrams

### Application Startup (Full Mode)

```
1. QuotioApp.init()
   │
   ├─▶ @State viewModel = QuotaViewModel()
   │   ├─▶ DaemonManager.shared → Check daemon status
   │   └─▶ DaemonIPCClient → Establish socket connection
   │
   ├─▶ Check onboarding status
   │   └─▶ Show OnboardingFlow if not completed
   │
   └─▶ initializeApp()
       ├─▶ Apply appearance settings
       ├─▶ Start daemon if not running
       ├─▶ Start proxy if autoStart enabled
       └─▶ Update status bar
```

### IPC Request Flow

```
┌──────────────────┐
│  Swift Method    │
│  (e.g. startProxy)│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐       ┌────────────────────┐
│ DaemonIPCClient  │───────│ Unix Socket        │
│ .call(method,    │       │ quotio.sock        │
│      params)     │       └────────┬───────────┘
└──────────────────┘                │
                                    ▼
                    ┌────────────────────────────┐
                    │ quotio-cli daemon          │
                    │ handleRequest(jsonrpc)     │
                    └────────────┬───────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          ▼                      ▼                      ▼
    ┌──────────┐          ┌──────────┐          ┌──────────┐
    │ proxy.*  │          │ auth.*   │          │ config.* │
    │ handlers │          │ handlers │          │ handlers │
    └────┬─────┘          └──────────┘          └──────────┘
         │
         ▼
    ┌──────────────────┐
    │ ProxyProcess     │
    │ Manager          │
    │ → spawn server   │
    └──────────────────┘
```

### Quota Fetching Flow

```
┌──────────────────────────────────────────────────────┐
│                  QuotaViewModel.refreshAllQuotas()    │
└────────────────────────┬─────────────────────────────┘
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
    ▼                    ▼                    ▼
┌─────────────┐    ┌─────────────┐     ┌─────────────┐
│ Claude      │    │ Copilot     │     │ Cursor      │
│ QuotaFetcher│    │ QuotaFetcher│     │ QuotaFetcher│
│ (actor)     │    │ (actor)     │     │ (actor)     │
└──────┬──────┘    └──────┬──────┘     └──────┬──────┘
       │                  │                   │
       ▼                  ▼                   ▼
┌─────────────────────────────────────────────────────┐
│ providerQuotas: [AIProvider: [String: QuotaData]]   │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│           StatusBarManager.updateStatusBar()         │
└─────────────────────────────────────────────────────┘
```

### Fallback Request Flow

```
┌──────────────────┐
│  CLI Tool        │
│  (Claude Code)   │
└────────┬─────────┘
         │ POST /v1/chat/completions
         │ model: "quotio-opus"
         ▼
┌──────────────────┐
│  ProxyBridge     │
│  (port 8317)     │
├──────────────────┤
│ Check fallback   │
│ config enabled?  │
└────────┬─────────┘
         │ Yes
         ▼
┌──────────────────┐
│ Resolve virtual  │
│ model → entries  │
│ [claude@1,       │
│  gemini@2]       │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐       ┌────────────────┐
│ Try entry #1:    │──429──│ Cooldown,      │
│ claude-opus      │ error │ try entry #2   │
└────────┬─────────┘       └────────────────┘
         │ 200 OK
         ▼
┌──────────────────┐
│ Return response  │
│ to CLI tool      │
└──────────────────┘
```

---

## Dependency Graph

### Package Dependencies

```
┌─────────────────┐
│  @quotio/core   │ ← Shared types (no dependencies)
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌─────────┐  ┌─────────┐
│ @quotio │  │ @quotio │
│ /cli    │  │ /server │
└────┬────┘  └────┬────┘
     │            │
     └──────┬─────┘
            ▼
    ┌─────────────┐
    │ Swift App   │
    │ (via IPC)   │
    └─────────────┘
```

### Swift Service Dependencies

```
QuotaViewModel
├── DaemonManager
│   └── DaemonIPCClient
├── DaemonQuotaService
│   └── DaemonIPCClient
├── All QuotaFetchers (8)
├── NotificationManager
├── RequestTracker
└── StatusBarManager
    └── StatusBarMenuBuilder

CLIProxyManager
├── ProxyBridge
├── ProxyStorageManager
└── CompatibilityChecker
```

---

## Runtime Files

### Configuration

| Path | Purpose |
|------|---------|
| `~/.config/quotio/` | Config directory |
| `~/.config/quotio/fallback-config.json` | Shared fallback configuration |
| `~/.cache/quotio-cli/quotio.sock` | Unix socket for IPC |
| `~/.cache/quotio-cli/daemon.pid` | Daemon PID file |

### Auth Files

| Path | Provider |
|------|----------|
| `~/.cli-proxy-api/gemini-cli-*.json` | Gemini |
| `~/.cli-proxy-api/claude-*.json` | Claude |
| `~/.cli-proxy-api/codex-*.json` | OpenAI Codex |
| `~/.cli-proxy-api/github-copilot-*.json` | GitHub Copilot |

### Application Support

| Path | Purpose |
|------|---------|
| `~/Library/Application Support/Quotio/` | App data |
| `~/Library/Application Support/Quotio/CLIProxyAPI` | Downloaded binary |

### UserDefaults Keys

| Key | Type | Purpose |
|-----|------|---------|
| `proxyPort` | Int | Proxy server port |
| `autoStartProxy` | Bool | Auto-start on launch |
| `operatingMode` | String | full/quotaOnly |
| `hasCompletedOnboarding` | Bool | Onboarding status |
| `menuBarSelectedQuotaItems` | Data | Menu bar items |
| `quotaAlertThreshold` | Double | Low quota threshold |
