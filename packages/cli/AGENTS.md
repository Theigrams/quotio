# CLI Package (@quotio/cli)

Bun-native CLI tool and daemon managing proxy lifecycle, IPC communication, and quota fetching.

## Structure

```
cli/
├── src/
│   ├── cli/commands/     # Command handlers (proxy, auth, quota, fallback)
│   ├── services/         # Business logic
│   │   ├── daemon/       # IPC handlers and state management
│   │   ├── quota-fetchers/ # Provider-specific quota extraction (12 files)
│   │   ├── agent-detection/ # CLI agent discovery and configuration
│   │   ├── fallback/     # Virtual model routing logic
│   │   └── proxy-process/ # Server subprocess management
│   ├── ipc/              # JSON-RPC 2.0 protocol implementation
│   └── utils/            # Paths, logging, formatting
└── tests/                # Bun test suites
```

## Where to Look

| Task | Location | Notes |
|------|----------|-------|
| Add IPC method | `ipc/protocol.ts` + `services/daemon/service.ts` | MUST update both |
| Add CLI command | `cli/commands/` | Follow existing pattern |
| Add quota fetcher | `services/quota-fetchers/` | Actor-like async functions |
| Modify daemon | `services/daemon/service.ts` | Central IPC dispatcher |
| Add fallback logic | `services/fallback/settings-service.ts` | Shared config with Swift |

## Code Map

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `IPCMethods` | Interface | ipc/protocol.ts | Contract for all 50+ IPC methods |
| `createDaemonService` | Function | services/daemon/service.ts | Main IPC handler dispatcher |
| `ProxyProcessManager` | Class | services/proxy-process/manager.ts | Spawns/monitors @quotio/server |
| `FallbackSettingsService` | Class | services/fallback/settings-service.ts | Reads/writes fallback-config.json |
| `QuotaService` | Class | services/quota-service.ts | Orchestrates all quota fetchers |

## IPC Protocol

JSON-RPC 2.0 over Unix Socket (`~/.cache/quotio-cli/quotio.sock`).

| Method Pattern | Example | Handler Location |
|----------------|---------|------------------|
| `daemon.*` | `daemon.ping`, `daemon.status` | service.ts |
| `proxy.*` | `proxy.start`, `proxy.stop` | service.ts → ProxyProcessManager |
| `auth.*` | `auth.list`, `auth.delete` | service.ts → file operations |
| `oauth.*` | `oauth.start`, `oauth.poll` | service.ts → server API |
| `apiKeys.*` | `apiKeys.list`, `apiKeys.add` | service.ts → config files |

## Conventions

### Command Pattern
```typescript
// Commands delegate to services
export async function startCommand(args: string[], ctx: CLIContext) {
  const manager = getProxyProcessManager();
  await manager.start();
  return { success: true };
}
```

### Quota Fetcher Pattern
```typescript
// Each provider has dedicated extraction logic
export async function fetchClaudeQuota(): Promise<QuotaResult> {
  // 1. Locate auth files in ~/.claude/
  // 2. Parse JSON credentials
  // 3. Call API or extract local data
  // 4. Return normalized QuotaResult
}
```

## Anti-Patterns

| Pattern | Why Bad | Instead |
|---------|---------|---------|
| Sync file ops in handlers | Blocks event loop | Use `Bun.file().text()` async |
| Manual `require()` for JSON | ESM inconsistency | `import pkg from "...json"` |
| Hardcoded paths | Platform issues | Use `utils/paths.ts` |

## Critical Rules

- **IPC Contract**: Changes to `ipc/protocol.ts` MUST mirror `IPCProtocol.swift`
- **Fallback Config**: `~/.config/quotio/fallback-config.json` is shared with Swift app
- **PID Management**: Single daemon instance enforced via `~/.cache/quotio-cli/daemon.pid`

## Commands

```bash
bun run build      # Compile binary
bun test           # Run tests
bun run dev        # Development mode
```
