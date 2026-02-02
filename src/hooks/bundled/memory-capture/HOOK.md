---
name: memory-capture
description: "Proactive memory capture when an agent run ends (extract and persist facts)"
homepage: https://docs.openclaw.ai/hooks#memory-capture
metadata:
  {
    "openclaw":
      {
        "emoji": "🧠",
        "events": ["agent:end"],
        "requires": { "config": ["workspace.dir"] },
        "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with OpenClaw" }],
      },
  }
---

# Memory Capture Hook

Runs proactive memory capture when an agent run ends. Extracts candidate facts (preferences, experiences) from the conversation and persists them to the entity/opinion bank (`bank/entities/*.md`, `bank/opinions.md`).

## What It Does

When an agent run finishes:

1. **Receives agent:end** – Internal hook is triggered with workspace path and message snapshot.
2. **Extracts candidates** – Heuristic extraction of preference-like and experience-like sentences (e.g. "I prefer X", "we fixed Y").
3. **Persists to bank** – Adds facts to entities (default entity "user" when no @mention) and opinions where applicable.

## Requirements

- **Config**: `workspace.dir` must be set (automatically configured during onboarding).
- Internal hooks must be enabled (`hooks.internal.enabled`).

## Disabling

To disable this hook:

```bash
openclaw hooks disable memory-capture
```

Or in config:

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "memory-capture": { "enabled": false }
      }
    }
  }
}
```
