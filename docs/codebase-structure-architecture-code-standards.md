# Quotio - Architecture and Code Standards

> **Last Updated**: January 17, 2026  
> **Version**: 2.0.0  
> **Architecture**: Hybrid Swift + TypeScript

---

## Table of Contents

1. [Three-Tier Architecture](#three-tier-architecture)
2. [IPC Protocol](#ipc-protocol)
3. [Swift Code Standards](#swift-code-standards)
4. [TypeScript Code Standards](#typescript-code-standards)
5. [Cross-Language Patterns](#cross-language-patterns)
6. [Anti-Patterns](#anti-patterns)
7. [Critical Invariants](#critical-invariants)
8. [Build Commands](#build-commands)

---

## Three-Tier Architecture

### Overview

Quotio uses a three-tier architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────────┐
│ TIER 1: Swift macOS App (Presentation Layer)                    │
│ ────────────────────────────────────────────────────────────────│
│ • SwiftUI views, menu bar integration                           │
│ • @Observable ViewModels for reactive state                     │
│ • Actor-based services for thread safety                        │
│ • DaemonIPCClient for backend communication                     │
└────────────────────────────┬────────────────────────────────────┘
                             │ Unix Socket IPC (JSON-RPC 2.0)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ TIER 2: quotio-cli Daemon (Application Layer)                   │
│ ────────────────────────────────────────────────────────────────│
│ • Bun-native daemon process                                     │
│ • 50+ IPC method handlers                                       │
│ • Proxy process lifecycle management                            │
│ • File-based configuration storage                              │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP/Subprocess
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ TIER 3: @quotio/server (Data/API Layer)                         │
│ ────────────────────────────────────────────────────────────────│
│ • Hono HTTP framework                                           │
│ • OpenAI-compatible API routes                                  │
│ • Provider executors and credential pooling                     │
│ • OAuth and authentication management                           │
└─────────────────────────────────────────────────────────────────┘
```

### Communication Patterns

| From | To | Method | Protocol |
|------|-----|--------|----------|
| Swift App | CLI Daemon | Unix Socket | JSON-RPC 2.0 |
| CLI Daemon | Proxy Server | HTTP | REST API |
| CLI Daemon | Proxy Server | Subprocess | spawn() |
| CLI Tools | Proxy Server | HTTP | OpenAI-compat |

---

## IPC Protocol

### JSON-RPC 2.0 over Unix Socket

The Swift app communicates with the quotio-cli daemon via JSON-RPC 2.0 over a Unix socket at `~/.cache/quotio-cli/quotio.sock`.

### Request Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "proxy.start",
  "params": { "port": 8317 }
}
```

### Response Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { "success": true, "pid": 12345 }
}
```

### Error Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": 1001,
    "message": "Proxy not running"
  }
}
```

### IPC Methods (50+)

| Category | Methods |
|----------|---------|
| **Daemon** | `daemon.ping`, `daemon.status`, `daemon.shutdown` |
| **Proxy** | `proxy.start`, `proxy.stop`, `proxy.status`, `proxy.health`, `proxy.healthCheck`, `proxy.latestVersion` |
| **Auth** | `auth.list`, `auth.delete`, `auth.deleteAll`, `auth.setDisabled`, `auth.models` |
| **OAuth** | `oauth.start`, `oauth.poll` |
| **Quota** | `quota.fetch`, `quota.list`, `quota.refreshTokens` |
| **Config** | `config.get`, `config.set`, `proxyConfig.getAll`, `proxyConfig.get`, `proxyConfig.set` |
| **API Keys** | `apiKeys.list`, `apiKeys.add`, `apiKeys.delete` |
| **Logs** | `logs.fetch`, `logs.clear` |
| **Agent** | `agent.detect`, `agent.configure` |
| **Remote** | `remote.setConfig`, `remote.getConfig`, `remote.clearConfig`, `remote.testConnection` |

### Swift IPC Client

```swift
actor DaemonIPCClient {
    func call<P: Encodable, R: Decodable>(
        method: IPCMethod,
        params: P?
    ) async throws -> R {
        let request = IPCRequest(id: nextId(), method: method.rawValue, params: params)
        let data = try JSONEncoder().encode(request)
        let response = try await sendToSocket(data)
        return try JSONDecoder().decode(IPCResponse<R>.self, from: response).result!
    }
}
```

### TypeScript IPC Handler

```typescript
export function createDaemonService(): DaemonService {
  return {
    async handleRequest(request: IPCRequest): Promise<IPCResponse> {
      switch (request.method) {
        case 'proxy.start':
          return await handleProxyStart(request.params);
        case 'auth.list':
          return await handleAuthList(request.params);
        // ... 48 more methods
      }
    }
  };
}
```

---

## Swift Code Standards

### Swift 6 Concurrency (CRITICAL)

```swift
// UI-bound classes: @MainActor @Observable
@MainActor
@Observable
final class QuotaViewModel {
    var isLoading = false
    var authFiles: [AuthFile] = []
    
    func refreshData() async {
        isLoading = true
        defer { isLoading = false }
        // ...
    }
}

// Thread-safe services: actor
actor DaemonIPCClient {
    private var connection: NWConnection?
    
    func call<P, R>(...) async throws -> R {
        // Safe concurrent access
    }
}

// Data crossing actor boundaries: Sendable
struct AuthFile: Codable, Sendable {
    let id: String
    let name: String
}
```

### @Observable Pattern (Not ObservableObject)

```swift
// ViewModel declaration
@MainActor
@Observable
final class QuotaViewModel {
    var isLoading = false
    var authFiles: [AuthFile] = []
}

// View injection via @Environment
struct DashboardScreen: View {
    @Environment(QuotaViewModel.self) private var viewModel
    
    var body: some View {
        @Bindable var vm = viewModel  // For two-way bindings
        List(selection: $vm.currentPage) { ... }
    }
}
```

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Types | PascalCase | `AIProvider`, `QuotaViewModel` |
| Properties | camelCase | `authFiles`, `isLoading` |
| Methods | camelCase | `refreshData()`, `startProxy()` |
| Enum Cases | camelCase | `case gemini`, `case quotaOnly` |
| File Names | Match primary type | `QuotaViewModel.swift` |

### Codable with snake_case APIs

```swift
struct AuthFile: Codable, Sendable {
    let id: String
    let statusMessage: String?
    let accountType: String?
    
    enum CodingKeys: String, CodingKey {
        case id
        case statusMessage = "status_message"
        case accountType = "account_type"
    }
}
```

### View Structure

```swift
struct DashboardScreen: View {
    @Environment(QuotaViewModel.self) private var viewModel
    
    // MARK: - Computed Properties
    private var isSetupComplete: Bool {
        viewModel.proxyManager.proxyStatus.running
    }
    
    // MARK: - Body
    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                headerSection
                statsSection
            }
            .padding()
        }
    }
    
    // MARK: - Subviews
    private var headerSection: some View { ... }
    private var statsSection: some View { ... }
}
```

### Error Handling

```swift
enum APIError: LocalizedError {
    case invalidURL
    case httpError(Int)
    case ipcError(String)
    
    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .httpError(let code): return "HTTP error: \(code)"
        case .ipcError(let msg): return "IPC error: \(msg)"
        }
    }
}
```

---

## TypeScript Code Standards

### Bun + Biome Conventions

```typescript
// Use Bun APIs for file operations
const content = await Bun.file(path).text();
await Bun.write(path, JSON.stringify(data, null, 2));

// Use import for JSON (ESM)
import pkg from "../package.json";

// Use Biome formatting (2-space indent, no semicolons optional)
export async function fetchQuota(): Promise<QuotaResult> {
  // ...
}
```

### Type Definitions

```typescript
// Const enums for string values
export const AIProvider = {
  CLAUDE: 'claude',
  GEMINI: 'gemini-cli',
  OPENAI: 'codex',
  // ...
} as const;
export type AIProvider = typeof AIProvider[keyof typeof AIProvider];

// Interfaces for data structures
export interface FallbackEntry {
  id: string;
  provider: AIProvider;
  modelId: string;
  priority: number;
}
```

### IPC Handler Pattern

```typescript
// Each method gets a dedicated handler
async function handleProxyStart(
  params: IPCProxyStartParams
): Promise<IPCResult<IPCProxyStartResult>> {
  try {
    const manager = getProxyProcessManager();
    const result = await manager.start(params.port);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
```

### Service Pattern

```typescript
// Services are singleton classes
export class FallbackSettingsService {
  private static instance: FallbackSettingsService;
  
  static getInstance(): FallbackSettingsService {
    if (!this.instance) {
      this.instance = new FallbackSettingsService();
    }
    return this.instance;
  }
  
  async loadConfig(): Promise<FallbackConfiguration> {
    const configPath = paths.fallbackConfig;
    if (await Bun.file(configPath).exists()) {
      return JSON.parse(await Bun.file(configPath).text());
    }
    return defaultConfig;
  }
}
```

---

## Cross-Language Patterns

### Type Mirroring

Types defined in `@quotio/core` must be mirrored in Swift:

| TypeScript | Swift |
|------------|-------|
| `models/provider.ts` → `AIProvider` | `Models/Models.swift` → `AIProvider` |
| `models/agent.ts` → `CLIAgent` | `Models/AgentModels.swift` → `CLIAgent` |
| `models/fallback.ts` → `VirtualModel` | `Models/FallbackModels.swift` → `VirtualModel` |

### JSON Serialization

Both sides use JSON with snake_case for cross-language compatibility:

```swift
// Swift: Use CodingKeys for snake_case
struct FallbackEntry: Codable {
    let modelId: String
    enum CodingKeys: String, CodingKey {
        case modelId = "model_id"
    }
}
```

```typescript
// TypeScript: Use snake_case in interfaces
interface FallbackEntry {
  model_id: string;
}
```

### Shared Configuration

`~/.config/quotio/fallback-config.json` is read/written by both Swift and TypeScript:

```
Swift FallbackSettingsManager ←→ ~/.config/quotio/fallback-config.json ←→ TS FallbackSettingsService
```

---

## Anti-Patterns

### Swift Anti-Patterns

| Pattern | Problem | Solution |
|---------|---------|----------|
| `Text("localhost:\(port)")` | Locale formats as "8.217" | `Text("localhost:" + String(port))` |
| Direct `UserDefaults` in View | Inconsistent | `@AppStorage("key")` |
| Blocking main thread | UI freeze | `Task { await ... }` |
| Force unwrap `!` | Crashes | Guard/if-let |
| `ObservableObject` | Deprecated in Swift 6 | `@Observable` macro |
| `@Published` | Deprecated | Direct property access |

### TypeScript Anti-Patterns

| Pattern | Problem | Solution |
|---------|---------|----------|
| `require()` for JSON | ESM incompatibility | `import pkg from "...json"` |
| Sync file operations | Blocks event loop | `await Bun.file().text()` |
| Hardcoded paths | Platform issues | Use `utils/paths.ts` |
| `console.log` in production | Noisy | Use structured logging |
| Manual `try/catch` in every handler | Repetitive | Use error middleware |

---

## Critical Invariants

### From Code Comments - NEVER Violate

| Component | Rule |
|-----------|------|
| `ProxyStorageManager` | Never delete current version symlink |
| `AgentConfigurationService` | Backups never overwritten |
| `ProxyBridge` | Target host always localhost |
| `CLIProxyManager` | Base URL always points to CLIProxyAPI directly |
| `DaemonIPCClient` | Local mode ONLY - Unix socket limitation |
| `ManagementAPIClient` | **DEPRECATED** for local use - remote mode only |

### IPC Contract Rules

1. Changes to `IPCProtocol.swift` MUST mirror `packages/cli/src/ipc/protocol.ts`
2. All IPC methods must handle timeout gracefully
3. Socket reconnection must be automatic on disconnect

### Fallback Configuration Rules

1. `~/.config/quotio/fallback-config.json` is shared source of truth
2. Both Swift and TypeScript must use same schema version
3. File watcher in Swift detects CLI-made changes

### Process Management Rules

1. Single daemon instance enforced via PID file
2. Daemon health check before all IPC operations
3. Proxy server runs as subprocess of daemon

---

## Build Commands

### Swift (macOS App)

```bash
# Debug build
xcodebuild -project Quotio.xcodeproj -scheme Quotio -configuration Debug build

# Release build
./scripts/build.sh

# Full release (build + package + notarize + appcast)
./scripts/release.sh

# Check compile errors
xcodebuild -project Quotio.xcodeproj -scheme Quotio -configuration Debug build 2>&1 | head -50
```

### TypeScript (Monorepo)

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Build individual packages
bun run --cwd packages/core build
bun run --cwd packages/cli build
bun run --cwd packages/server build

# Development mode
bun run --cwd packages/cli dev
bun run --cwd packages/server dev

# Type checking
bun run typecheck

# Linting (Biome)
bun run lint
bun run format
```

### Cross-Package Commands

```bash
# Run from monorepo root
turbo run build          # Build all packages
turbo run typecheck      # Type check all
turbo run lint           # Lint all

# Run CLI commands
./packages/cli/dist/quotio proxy start
./packages/cli/dist/quotio fallback list
```

---

## Testing Guidelines

### Manual Testing Checklist

- [ ] Run app in Xcode (`Cmd + R`)
- [ ] Test light/dark mode transitions
- [ ] Verify menu bar integration
- [ ] Test all provider OAuth flows
- [ ] Validate fallback chain execution
- [ ] Test mode switching (Full ↔ Quota-Only)
- [ ] Verify localization (en, vi, zh-Hans)
- [ ] Test daemon start/stop/restart
- [ ] Verify IPC reconnection on disconnect

### TypeScript Testing

```bash
# Run tests
bun test

# Run specific package tests
bun test --cwd packages/cli
bun test --cwd packages/server
```
