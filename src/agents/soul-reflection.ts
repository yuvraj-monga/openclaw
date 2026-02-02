/**
 * Soul Reflection: Periodic reflection job for soul evolution
 * 
 * Analyzes recent interactions, feedback, and patterns to suggest
 * personality and preference updates.
 */

import type { OpenClawConfig } from "../config/config.js";
import { resolveAgentWorkspaceDir } from "./agent-scope.js";
import { getSoulManager, type SoulManager } from "./soul-manager.js";
import { runEmbeddedPiAgent } from "./pi-embedded.js";
import type { ResolvedMemorySearchConfig } from "./memory-search.js";

export interface SoulReflectionOptions {
  /** Agent ID */
  agentId: string;
  /** Config */
  config: OpenClawConfig;
  /** Memory search config (optional, for context) */
  memorySearchConfig?: ResolvedMemorySearchConfig | null;
}

/**
 * Run soul reflection job
 * 
 * This triggers an agentic turn that analyzes recent interactions
 * and suggests updates to SOUL.md and personality traits.
 */
export async function runSoulReflection(
  options: SoulReflectionOptions,
): Promise<void> {
  const { agentId, config } = options;
  const workspaceDir = resolveAgentWorkspaceDir(config, agentId);
  const soulManager = getSoulManager(workspaceDir);

  // Load current soul state
  const soul = await soulManager.loadSoulState();

  // Check if reflection is needed (weekly by default)
  const daysSinceReflection = (Date.now() - soul.lastReflection) / (1000 * 60 * 60 * 24);
  if (daysSinceReflection < 7) {
    return; // Too soon for reflection
  }

  // Prepare reflection prompt
  const reflectionPrompt = buildReflectionPrompt(soul);

  // Run agentic reflection turn
  // This would typically use a separate agent session or a reflection-specific model
  // For now, we'll use the standard agent runner with a special prompt

  // After reflection, update soul state
  const reflectionResult = await soulManager.reflect();

  // Generate suggested SOUL.md updates
  if (reflectionResult.suggestedUpdates.length > 0) {
    // In a real implementation, this would update SOUL.md or create a reflection summary
    // For now, we'll just log it
    console.log("Soul reflection complete. Suggested updates:");
    console.log(reflectionResult.suggestedUpdates.join("\n"));
  }
}

/**
 * Build reflection prompt for agentic turn
 */
function buildReflectionPrompt(soul: Awaited<ReturnType<SoulManager["loadSoulState"]>>): string {
  const lines: string[] = [];

  lines.push("# Soul Reflection");
  lines.push("");
  lines.push("Analyze your recent interactions and personality evolution.");
  lines.push("");
  lines.push("## Current Personality");
  lines.push(`- Formality: ${soul.personality.formality.toFixed(2)}`);
  lines.push(`- Verbosity: ${soul.personality.verbosity.toFixed(2)}`);
  lines.push(`- Humor: ${soul.personality.humor.toFixed(2)}`);
  lines.push(`- Directness: ${soul.personality.directness.toFixed(2)}`);
  lines.push("");

  if (soul.boundaries.successes.length > 0) {
    lines.push("## Recent Successes");
    for (const success of soul.boundaries.successes.slice(-5)) {
      lines.push(`- ${success.action} (${success.context})`);
    }
    lines.push("");
  }

  if (soul.boundaries.failures.length > 0) {
    lines.push("## Recent Failures");
    for (const failure of soul.boundaries.failures.slice(-5)) {
      lines.push(`- ${failure.action} (${failure.context}): ${failure.feedback}`);
    }
    lines.push("");
  }

  lines.push("## Reflection Tasks");
  lines.push("1. Review your recent interactions and identify patterns");
  lines.push("2. Consider what worked well and what didn't");
  lines.push("3. Suggest personality trait adjustments if needed");
  lines.push("4. Update learned boundaries based on feedback");
  lines.push("5. Propose updates to SOUL.md if significant changes are needed");
  lines.push("");
  lines.push("Reply with NO_REPLY if no significant changes are needed.");

  return lines.join("\n");
}
