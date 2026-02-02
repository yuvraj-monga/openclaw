/**
 * Capture Hooks: Bridge from internal hook events to the capture engine
 *
 * Called by the memory-capture bundled hook on agent:end and optionally
 * from tool execution handlers for decision-point capture.
 */

import type { InternalHookEvent } from "../hooks/internal-hooks.js";
import type { CaptureMessage } from "./capture-engine.js";
import { captureFromAgentEnd } from "./capture-engine.js";

/** Context shape for agent:end internal hook (populated by attempt.ts). */
export type AgentEndHookContext = {
  workspaceDir?: string;
  messages?: unknown[];
  runId?: string;
  sessionKey?: string;
  success?: boolean;
};

function toCaptureMessages(messages: unknown[]): CaptureMessage[] {
  const out: CaptureMessage[] = [];
  for (const m of messages) {
    if (
      m &&
      typeof m === "object" &&
      "role" in m &&
      typeof (m as { role: unknown }).role === "string"
    ) {
      const msg = m as { role: string; content?: unknown };
      out.push({ role: msg.role, content: msg.content });
    }
  }
  return out;
}

/**
 * Handle agent:end internal hook: run post-task capture (extract and persist facts).
 * No-op if workspaceDir or messages missing; errors are logged, not thrown.
 */
export async function onAgentEnd(event: InternalHookEvent): Promise<void> {
  if (event.type !== "agent" || event.action !== "end") {
    return;
  }

  const ctx = event.context as AgentEndHookContext;
  const workspaceDir = typeof ctx?.workspaceDir === "string" ? ctx.workspaceDir : undefined;
  const rawMessages = Array.isArray(ctx?.messages) ? ctx.messages : [];

  if (!workspaceDir || rawMessages.length === 0) {
    return;
  }

  const messages = toCaptureMessages(rawMessages);
  await captureFromAgentEnd(workspaceDir, {
    messages,
    runId: typeof ctx.runId === "string" ? ctx.runId : undefined,
    sessionKey: typeof ctx.sessionKey === "string" ? ctx.sessionKey : event.sessionKey,
    success: typeof ctx.success === "boolean" ? ctx.success : undefined,
    defaultEntity: "user",
    maxFactsPerRun: 5,
  });
}
