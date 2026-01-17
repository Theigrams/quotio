# Core Package (@quotio/core)

Shared TypeScript types and models used by both CLI and Server packages.

## Structure

```
core/
├── src/
│   ├── models/           # Business domain types
│   │   ├── provider.ts   # AIProvider enum
│   │   ├── agent.ts      # CLIAgent enum
│   │   ├── fallback.ts   # VirtualModel, FallbackEntry
│   │   ├── auth.ts       # AuthFile, Credential types
│   │   ├── quota.ts      # QuotaResult, UsageStats
│   │   └── request.ts    # RequestLog, ProxyRequest
│   └── index.ts          # Barrel export
└── package.json
```

## Where to Look

| Task | Location | Notes |
|------|----------|-------|
| Add AI provider | `models/provider.ts` | MUST also update Swift `AIProvider` enum |
| Add agent type | `models/agent.ts` | MUST also update Swift `CLIAgent` enum |
| Modify fallback model | `models/fallback.ts` | MUST also update `FallbackModels.swift` |

## Key Types

| Type | File | Swift Mirror |
|------|------|--------------|
| `AIProvider` | provider.ts | `Models/Models.swift` |
| `CLIAgent` | agent.ts | `Models/AgentModels.swift` |
| `VirtualModel` | fallback.ts | `Models/FallbackModels.swift` |
| `FallbackEntry` | fallback.ts | `Models/FallbackModels.swift` |
| `AuthFile` | auth.ts | `Models/Models.swift` |
| `QuotaResult` | quota.ts | Custom per-fetcher |

## Cross-Language Contract

This package defines the **source of truth** for shared types. Any changes here MUST be mirrored in Swift:

```
packages/core/src/models/     ←→     Quotio/Models/
         ↑                              ↑
    TypeScript                        Swift
```

## Conventions

### Enum Pattern
```typescript
export const AIProvider = {
  CLAUDE: 'claude',
  GEMINI: 'gemini',
  OPENAI: 'openai',
  // ...
} as const;

export type AIProvider = typeof AIProvider[keyof typeof AIProvider];
```

### Interface Pattern
```typescript
export interface FallbackEntry {
  id: string;
  provider: AIProvider;
  modelId: string;
  priority: number;
}
```

## Critical Rules

- **Breaking Changes**: Adding/removing enum values requires updating BOTH TypeScript and Swift
- **Serialization**: All types must be JSON-serializable (shared via IPC and config files)
- **Naming**: Use camelCase in TS, but JSON keys use snake_case for Swift compatibility

## Commands

```bash
bun run build      # Compile TypeScript
bun run typecheck  # Check types only
```
