# Memory

[← Back to MODULE](MODULE.md) | [← Back to INDEX](../../INDEX.md)

## Summary

| High 🔴 | Medium 🟡 | Low 🟢 |
| 0 | 0 | 12 |

## 🟢 Low Priority

### `NOTE` (Quotio/Services/AgentDetectionService.swift:16)

> Only checks file existence (metadata), does NOT read file content

### `NOTE` (Quotio/Services/AgentDetectionService.swift:91)

> May not work in GUI apps due to limited PATH inheritance

### `NOTE` (Quotio/Services/AgentDetectionService.swift:97)

> Only checks file existence (metadata), does NOT read file content

### `NOTE` (Quotio/Services/CLIExecutor.swift:33)

> Only checks file existence (metadata), does NOT read file content

### `NOTE` (Quotio/Services/Proxy/CLIProxyManager.swift:186)

> Bridge mode default is registered in AppDelegate.applicationDidFinishLaunching()

### `NOTE` (Quotio/Services/Proxy/CLIProxyManager.swift:215)

> Changes take effect after proxy restart (CLIProxyAPI does not support live routing API)

### `NOTE` (Quotio/ViewModels/QuotaViewModel.swift:209)

> Cursor and Trae are NOT auto-refreshed - user must use "Scan for IDEs" (issue #29)

### `NOTE` (Quotio/ViewModels/QuotaViewModel.swift:217)

> Cursor and Trae removed from auto-refresh to address privacy concerns (issue #29)

### `NOTE` (Quotio/ViewModels/QuotaViewModel.swift:966)

> Cursor and Trae removed from auto-refresh (issue #29)

### `NOTE` (Quotio/ViewModels/QuotaViewModel.swift:986)

> Cursor and Trae require explicit user scan (issue #29)

### `NOTE` (Quotio/ViewModels/QuotaViewModel.swift:995)

> Cursor and Trae removed - require explicit scan (issue #29)

### `NOTE` (Quotio/ViewModels/QuotaViewModel.swift:1043)

> Don't call detectActiveAccount() here - already set by switch operation

