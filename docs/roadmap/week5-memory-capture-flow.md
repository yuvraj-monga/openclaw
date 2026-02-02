# Week 5: Proactive Memory Capture — Complete Flow

Step-by-step verification that the memory capture feature works end-to-end.

---

## 1. Gateway startup (hooks loaded)

| Step | Where | What happens |
|------|--------|--------------|
| 1.1 | `src/gateway/server-startup.ts` | `loadInternalHooks(params.cfg, params.defaultWorkspaceDir)` is called. |
| 1.2 | `src/hooks/loader.ts` | If `cfg.hooks?.internal?.enabled` is false, returns 0 and no hooks load. Otherwise calls `loadWorkspaceHookEntries(workspaceDir, { config: cfg })`. |
| 1.3 | `src/hooks/workspace.ts` | `loadHookEntries()` merges hooks from: extra dirs, **bundled** (via `resolveBundledHooksDir()`), managed, workspace. Bundled dir includes `memory-capture/`. |
| 1.4 | Loader | For each hook entry, `shouldIncludeHook()` runs: not disabled in config, OS/bin/env/config requirements. memory-capture requires `workspace.dir` (defaults true). If enabled, handler is imported and `registerInternalHook("agent:end", handler)` is called. |
| 1.5 | Result | `memory-capture` handler is registered for event key `"agent:end"` (and remains in memory for the process). |

**Check:** Internal hooks enabled + memory-capture not disabled → handler registered for `agent:end`.

---

## 2. User sends a message (agent run)

| Step | Where | What happens |
|------|--------|--------------|
| 2.1 | Gateway / CLI | Inbound message triggers an agent run. |
| 2.2 | `src/agents/pi-embedded-runner/run.ts` | `runEmbeddedAttempt({ ... params })` is called with `params.workspaceDir` (required in `RunEmbeddedPiAgentParams`). |
| 2.3 | `src/agents/pi-embedded-runner/run/attempt.ts` | Run executes: prompt, tools, compaction as needed. `messagesSnapshot = activeSession.messages.slice()` is set after the run (line ~827). |

**Check:** Every embedded run has `workspaceDir` and ends with a `messagesSnapshot`.

---

## 3. Agent run ends → internal hook fired

| Step | Where | What happens |
|------|--------|--------------|
| 3.1 | `attempt.ts` (after prompt and compaction wait) | `createInternalHookEvent("agent", "end", params.sessionKey ?? params.sessionId, { workspaceDir: params.workspaceDir, messages: messagesSnapshot, success: !aborted && !promptError, runId: params.runId, sessionKey: params.sessionKey })` builds the event. |
| 3.2 | `attempt.ts` | `void triggerInternalHook(agentEndEvent)` is called (fire-and-forget). |
| 3.3 | `src/hooks/internal-hooks.ts` | `triggerInternalHook(event)` looks up handlers for `"agent"` and `"agent:end"`. Handlers for `"agent:end"` include the memory-capture handler. Each handler is `await handler(event)`; errors are caught and logged. |

**Check:** Event always has `type: "agent"`, `action: "end"`, and `context.workspaceDir`, `context.messages`, `context.success`, etc.

---

## 4. Memory-capture handler runs

| Step | Where | What happens |
|------|--------|--------------|
| 4.1 | `src/hooks/bundled/memory-capture/handler.ts` | Default export receives the internal hook event and calls `onAgentEnd(event)`. |
| 4.2 | `src/memory/capture-hooks.ts` | `onAgentEnd(event)` returns early if `event.type !== "agent"` or `event.action !== "end"`. Reads `ctx.workspaceDir` and `ctx.messages` from `event.context`. Returns early if `!workspaceDir` or `rawMessages.length === 0`. |
| 4.3 | `capture-hooks.ts` | `toCaptureMessages(rawMessages)` maps each message to `{ role, content }`. `captureFromAgentEnd(workspaceDir, { messages, runId, sessionKey, success, defaultEntity: "user", maxFactsPerRun: 5 })` is called. |

**Check:** Handler only runs when workspaceDir and messages are present; capture options are fixed (user, max 5 facts).

---

## 5. Capture engine extracts and persists

| Step | Where | What happens |
|------|--------|--------------|
| 5.1 | `src/memory/capture-engine.ts` | `captureFromAgentEnd()` returns `{ captured: 0, skipped: 0 }` if `messages.length === 0`. Otherwise `extractCandidates(messages, defaultEntity)` runs (preference/experience regexes, @mentions). |
| 5.2 | `capture-engine.ts` | For each candidate (up to `maxFactsPerRun`), `entityManager.addFactToEntity(primaryEntity, { type, content, entities, confidence })` is called. `getEntityManager(workspaceDir)` uses the same workspace (and cache). |
| 5.3 | `src/memory/entity-manager.ts` | `addFactToEntity()` creates the entity if missing, builds a full fact (id, timestamp, source), then `updateEntity(..., { addFacts: [fullFact] })`. If type is `"opinion"`, `getOpinionsManager(workspaceDir).addOpinion(fullFact, confidence)` is also called. |
| 5.4 | Result | Facts are written to `bank/entities/<entity>.md` and opinions to `bank/opinions.md`. Errors in the loop are caught and logged; capture is best-effort. |

**Check:** Entities and opinions live under the same workspaceDir; duplicates/invalid facts are skipped without breaking the run.

---

## 6. Memory search → importance recording (separate path)

| Step | Where | What happens |
|------|--------|--------------|
| 6.1 | `src/memory/manager.ts` | When `MemoryIndexManager.search()` returns (either via enhanced search or standard hybrid/vector path), `recordRetrievalForResults(this.workspaceDir, results)` is called before returning. |
| 6.2 | `src/memory/importance-scorer.ts` | `recordRetrievalForResults(workspaceDir, results)` gets `ImportanceScorer` for that workspace and calls `recordRetrieval(key)` for each result (key = `path#LstartLine` or `path`). Updates are in-memory until `save()` is called. |

**Check:** Every search that returns results updates the importance scorer for that workspace; no persistence unless something else calls `save()`.

---

## Summary

| # | Phase | Condition | Outcome |
|---|--------|-----------|---------|
| 1 | Hooks load | `hooks.internal.enabled` and memory-capture not disabled; `workspace.dir` (default true) | memory-capture registered for `agent:end` |
| 2 | Agent run | All embedded runs | `workspaceDir` and `messagesSnapshot` available at end |
| 3 | Hook trigger | After every run (success or not) | `agent:end` fired with workspaceDir, messages, success, runId, sessionKey |
| 4 | Handler | workspaceDir and messages present | `onAgentEnd` → `captureFromAgentEnd` with fixed options |
| 5 | Capture | Messages with extractable patterns | Facts and opinions written to bank/; errors logged, not thrown |
| 6 | Search | Any memory search returning results | Retrieval counts updated in importance scorer (in-memory) |

Everything is wired correctly: hooks load at startup, the run always fires `agent:end` with the right context, the handler only runs when context is valid, and capture + importance recording use the same workspace and are best-effort/safe.
