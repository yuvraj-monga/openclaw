/**
 * Capture Engine: Proactive memory capture from agent events
 *
 * Event-driven extraction after task completion, decision points, and preference signals.
 * Persists to entity/opinion bank via EntityManager and OpinionsManager.
 */

import type { FactType } from "./entity-types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { getEntityManager } from "./entity-manager.js";
import { getImportanceScorer } from "./importance-scorer.js";

const log = createSubsystemLogger("memory:capture");

/** Minimal message shape for extraction (avoids pi-agent-core dependency in memory). */
export type CaptureMessage = {
  role: string;
  content?: unknown;
};

export type CaptureFromAgentEndOptions = {
  /** Last N messages from the run (user + assistant). */
  messages: CaptureMessage[];
  runId?: string;
  sessionKey?: string;
  /** Whether the run completed without error. */
  success?: boolean;
  /** Default entity for facts when no entity is inferred (e.g. "user"). */
  defaultEntity?: string;
  /** Max facts to add per run (avoid noise). */
  maxFactsPerRun?: number;
};

/** Preference patterns -> opinion; experience patterns -> experience fact. */
const PREFERENCE_PATTERNS = [
  /\b(?:I prefer|I like|I love|I enjoy)\s+(.+?)(?:\.|$)/gi,
  /\b(?:I don't like|I dislike|I hate|don't)\s+(.+?)(?:\.|$)/gi,
  /\b(?:please do|please don't|always|never)\s+(.+?)(?:\.|$)/gi,
  /\b(?:prefer|want)\s+(?:my |me )?(.+?)(?:\.|$)/gi,
];

const EXPERIENCE_PATTERNS = [
  /\b(?:we fixed|we did|we completed|fixed|completed)\s+(.+?)(?:\.|$)/gi,
  /\b(?:decided to|decided that)\s+(.+?)(?:\.|$)/gi,
];

/** Extract @mention or "with Name" style entity references. */
function extractEntityMentions(text: string): string[] {
  const names = new Set<string>();
  const atMentions = text.match(/@([A-Za-z0-9_-]+)/g);
  if (atMentions) {
    for (const m of atMentions) {
      names.add(m.slice(1).trim());
    }
  }
  const withMatch = text.match(/\bwith\s+([A-Za-z0-9_-]+)\b/gi);
  if (withMatch) {
    for (const m of withMatch) {
      const name = m.replace(/\bwith\s+/i, "").trim();
      if (name) names.add(name);
    }
  }
  return Array.from(names);
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textPart = content.find(
      (c: unknown) => c && typeof c === "object" && (c as { type?: string }).type === "text",
    );
    return textPart && typeof (textPart as { text?: string }).text === "string"
      ? (textPart as { text: string }).text
      : "";
  }
  return "";
}

/**
 * Heuristic extraction of preference-like and experience-like sentences from recent messages.
 * Returns candidate facts (content, type, entities) without persisting.
 */
function extractCandidates(
  messages: CaptureMessage[],
  defaultEntity: string,
): Array<{ content: string; type: FactType; entities: string[] }> {
  const candidates: Array<{ content: string; type: FactType; entities: string[] }> = [];
  const seen = new Set<string>();

  for (const msg of messages) {
    const text = extractTextFromContent(msg.content);
    if (!text || text.length < 10) continue;

    const entities = extractEntityMentions(text);
    const entityList = entities.length > 0 ? entities : [defaultEntity];

    for (const pattern of PREFERENCE_PATTERNS) {
      let m: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((m = pattern.exec(text)) !== null) {
        const content = m[1].trim();
        if (content.length < 3 || content.length > 500) continue;
        const key = `opinion:${content.slice(0, 80)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({ content, type: "opinion", entities: entityList });
      }
    }

    for (const pattern of EXPERIENCE_PATTERNS) {
      let m: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((m = pattern.exec(text)) !== null) {
        const content = m[1].trim();
        if (content.length < 3 || content.length > 500) continue;
        const key = `experience:${content.slice(0, 80)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({ content, type: "experience", entities: entityList });
      }
    }
  }

  return candidates;
}

/**
 * Run proactive capture after agent run ends: extract candidate facts and persist to entity/opinion bank.
 * Best-effort; logs errors but does not throw.
 */
export async function captureFromAgentEnd(
  workspaceDir: string,
  options: CaptureFromAgentEndOptions,
): Promise<{ captured: number; skipped: number }> {
  const { messages, defaultEntity = "user", maxFactsPerRun = 5 } = options;

  if (!messages.length) {
    return { captured: 0, skipped: 0 };
  }

  const entityManager = getEntityManager(workspaceDir);
  const candidates = extractCandidates(messages, defaultEntity);
  let captured = 0;
  let skipped = 0;

  for (let i = 0; i < candidates.length && captured < maxFactsPerRun; i++) {
    const { content, type, entities } = candidates[i];
    const primaryEntity = entities[0] ?? defaultEntity;

    try {
      await entityManager.addFactToEntity(primaryEntity, {
        type,
        content,
        entities,
        confidence: type === "opinion" ? 0.7 : undefined,
      });
      captured++;
      log.debug("Captured fact for %s: %s", primaryEntity, content.slice(0, 60));
    } catch (err) {
      log.debug(
        "Skip fact (e.g. duplicate or invalid): %s",
        err instanceof Error ? err.message : String(err),
      );
      skipped++;
    }
  }

  if (candidates.length > maxFactsPerRun) {
    skipped += candidates.length - maxFactsPerRun;
  }

  if (captured > 0) {
    log.info(
      "Capture: %d facts added, %d skipped (run %s)",
      captured,
      skipped,
      options.runId ?? "?",
    );
  }

  return { captured, skipped };
}

/**
 * Record a decision point for later importance/analytics (e.g. tool name + outcome).
 * Does not add facts; use from tool execution hooks if needed.
 */
export function recordDecisionPoint(
  _workspaceDir: string,
  _opts: { toolName: string; success: boolean; summary?: string },
): void {
  // Placeholder for Week 5: importance scorer can be updated here when we wire tool hooks.
}

/**
 * Record a preference change signal (user correction or explicit "I prefer X").
 * Updates importance scorer and can trigger opinion update in a future iteration.
 */
export function recordPreferenceChange(workspaceDir: string, memoryKey: string): void {
  const scorer = getImportanceScorer(workspaceDir);
  scorer.recordUserCorrection(memoryKey);
  log.debug("Preference change recorded for key: %s", memoryKey);
}
