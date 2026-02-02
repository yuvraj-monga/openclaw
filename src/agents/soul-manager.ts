/**
 * Soul Manager: Manages agent personality evolution and reflection
 * 
 * Tracks personality traits, preferences, and boundaries, and provides
 * mechanisms for the soul to evolve based on interactions and feedback.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { resolveUserPath } from "../utils.js";
import type {
  SoulState,
  PersonalityTraits,
  CommunicationPreferences,
  ToolPreferences,
  BoundaryLearning,
  SoulUpdateOptions,
  SoulReflectionResult,
  PersonalityDimension,
} from "./soul-types.js";
import { ensureDir } from "../memory/internal.js";

const log = createSubsystemLogger("soul");

const DEFAULT_PERSONALITY: PersonalityTraits = {
  formality: 0.3,
  verbosity: 0.5,
  humor: 0.4,
  directness: 0.7,
  empathy: 0.6,
  curiosity: 0.7,
  assertiveness: 0.5,
  patience: 0.6,
};

const DEFAULT_COMMUNICATION: CommunicationPreferences = {
  preferredLength: { min: 50, max: 500 },
  emojiUsage: 0.3,
  technicalDepth: 0.6,
  exampleUsage: 0.5,
  analogyUsage: 0.4,
};

const DEFAULT_TOOLS: ToolPreferences = {
  preferredTools: {},
  avoidedTools: [],
  toolPatterns: [],
};

const DEFAULT_BOUNDARIES: BoundaryLearning = {
  successes: [],
  failures: [],
  boundaries: [],
};

export class SoulManager {
  private readonly workspaceDir: string;
  private readonly soulFile: string;
  private readonly soulStateFile: string;

  constructor(workspaceDir: string) {
    this.workspaceDir = resolveUserPath(workspaceDir);
    this.soulFile = path.join(this.workspaceDir, "SOUL.md");
    this.soulStateFile = path.join(this.workspaceDir, ".soul-state.json");
  }

  /**
   * Load soul state from disk
   */
  async loadSoulState(): Promise<SoulState> {
    try {
      const content = await fs.readFile(this.soulStateFile, "utf-8");
      const parsed = JSON.parse(content) as Partial<SoulState>;

      return {
        personality: { ...DEFAULT_PERSONALITY, ...parsed.personality },
        communication: { ...DEFAULT_COMMUNICATION, ...parsed.communication },
        tools: { ...DEFAULT_TOOLS, ...parsed.tools },
        boundaries: { ...DEFAULT_BOUNDARIES, ...parsed.boundaries },
        evolutionLog: parsed.evolutionLog || [],
        lastReflection: parsed.lastReflection || 0,
        lastUpdated: parsed.lastUpdated || Date.now(),
      };
    } catch (err: any) {
      if (err.code === "ENOENT") {
        // Create default state
        return this.createDefaultSoulState();
      }
      log.warn(`Failed to load soul state: ${String(err)}`);
      return this.createDefaultSoulState();
    }
  }

  /**
   * Save soul state to disk
   */
  async saveSoulState(soul: SoulState): Promise<void> {
    await ensureDir(this.workspaceDir);
    await fs.writeFile(this.soulStateFile, JSON.stringify(soul, null, 2), "utf-8");
    log.info("Saved soul state");
  }

  /**
   * Create default soul state
   */
  private createDefaultSoulState(): SoulState {
    return {
      personality: { ...DEFAULT_PERSONALITY },
      communication: { ...DEFAULT_COMMUNICATION },
      tools: { ...DEFAULT_TOOLS },
      boundaries: { ...DEFAULT_BOUNDARIES },
      evolutionLog: [],
      lastReflection: 0,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Update soul state
   */
  async updateSoul(options: SoulUpdateOptions): Promise<SoulState> {
    const soul = await this.loadSoulState();

    // Update personality
    if (options.personality) {
      for (const [key, value] of Object.entries(options.personality)) {
        if (value !== undefined && key in soul.personality) {
          const oldValue = soul.personality[key as PersonalityDimension];
          soul.personality[key as PersonalityDimension] = Math.max(
            0,
            Math.min(1, value),
          ) as number;
          soul.evolutionLog.push({
            timestamp: Date.now(),
            dimension: key as PersonalityDimension,
            change: `${oldValue.toFixed(2)} → ${soul.personality[key as PersonalityDimension].toFixed(2)}`,
            reason: options.reason || "Manual update",
          });
        }
      }
    }

    // Update communication preferences
    if (options.communication) {
      Object.assign(soul.communication, options.communication);
      soul.evolutionLog.push({
        timestamp: Date.now(),
        dimension: "communication",
        change: "Updated communication preferences",
        reason: options.reason || "Manual update",
      });
    }

    // Update tool preferences
    if (options.tools) {
      Object.assign(soul.tools, options.tools);
      soul.evolutionLog.push({
        timestamp: Date.now(),
        dimension: "boundaries",
        change: "Updated tool preferences",
        reason: options.reason || "Manual update",
      });
    }

    // Add boundary learning
    if (options.boundary) {
      const { type, data } = options.boundary;
      if (type === "success") {
        soul.boundaries.successes.push({
          action: data.action || "",
          context: data.context || "",
          timestamp: Date.now(),
        });
      } else if (type === "failure") {
        soul.boundaries.failures.push({
          action: data.action || "",
          context: data.context || "",
          feedback: data.feedback || "",
          timestamp: Date.now(),
        });
      } else if (type === "boundary") {
        soul.boundaries.boundaries.push({
          rule: data.rule || "",
          confidence: data.confidence ?? 0.5,
          source: data.source || "learned",
          timestamp: Date.now(),
        });
      }

      soul.evolutionLog.push({
        timestamp: Date.now(),
        dimension: "boundaries",
        change: `Added ${type}`,
        reason: options.reason || "Boundary learning",
      });
    }

    soul.lastUpdated = Date.now();
    await this.saveSoulState(soul);

    log.info("Updated soul state");
    return soul;
  }

  /**
   * Get current personality traits
   */
  async getPersonalityTraits(): Promise<PersonalityTraits> {
    const soul = await this.loadSoulState();
    return soul.personality;
  }

  /**
   * Get communication preferences
   */
  async getCommunicationPreferences(): Promise<CommunicationPreferences> {
    const soul = await this.loadSoulState();
    return soul.communication;
  }

  /**
   * Reflect on soul state and suggest updates
   */
  async reflect(): Promise<SoulReflectionResult> {
    const soul = await this.loadSoulState();
    const changes: SoulReflectionResult["changes"] = [];
    const suggestedUpdates: string[] = [];

    // Analyze recent evolution
    const recentLogs = soul.evolutionLog.filter(
      (log) => log.timestamp > soul.lastReflection,
    );

    // Analyze boundary learning
    const recentSuccesses = soul.boundaries.successes.filter(
      (s) => s.timestamp > soul.lastReflection,
    );
    const recentFailures = soul.boundaries.failures.filter(
      (f) => f.timestamp > soul.lastReflection,
    );

    // Suggest personality adjustments based on feedback
    if (recentFailures.length > recentSuccesses.length * 2) {
      // More failures than successes - might need to adjust approach
      const currentDirectness = soul.personality.directness;
      const newDirectness = Math.max(0, currentDirectness - 0.1);
      if (newDirectness !== currentDirectness) {
        changes.push({
          dimension: "directness",
          before: currentDirectness.toFixed(2),
          after: newDirectness.toFixed(2),
          reason: "High failure rate suggests need for more careful approach",
        });
        soul.personality.directness = newDirectness;
      }
    }

    // Update verbosity based on communication patterns
    if (soul.communication.preferredLength) {
      const avgLength =
        (soul.communication.preferredLength.min + soul.communication.preferredLength.max) / 2;
      if (avgLength < 200) {
        // Prefer shorter responses
        const newVerbosity = Math.max(0, soul.personality.verbosity - 0.1);
        if (newVerbosity !== soul.personality.verbosity) {
          changes.push({
            dimension: "verbosity",
            before: soul.personality.verbosity.toFixed(2),
            after: newVerbosity.toFixed(2),
            reason: "User prefers concise responses",
          });
          soul.personality.verbosity = newVerbosity;
        }
      }
    }

    // Generate suggested SOUL.md updates
    if (changes.length > 0) {
      suggestedUpdates.push("## Personality Evolution");
      for (const change of changes) {
        suggestedUpdates.push(
          `- ${change.dimension}: ${change.before} → ${change.after} (${change.reason})`,
        );
      }
    }

    if (soul.boundaries.boundaries.length > 0) {
      const recentBoundaries = soul.boundaries.boundaries
        .filter((b) => b.timestamp > soul.lastReflection)
        .slice(-5);
      if (recentBoundaries.length > 0) {
        suggestedUpdates.push("");
        suggestedUpdates.push("## Learned Boundaries");
        for (const boundary of recentBoundaries) {
          suggestedUpdates.push(`- ${boundary.rule} (confidence: ${boundary.confidence.toFixed(2)})`);
        }
      }
    }

    soul.lastReflection = Date.now();
    await this.saveSoulState(soul);

    return {
      soul,
      changes,
      suggestedUpdates,
    };
  }

  /**
   * Generate dynamic system prompt additions based on soul state
   */
  async generateSystemPromptAdditions(context?: {
    conversationHistory?: Array<{ role: string; content: string }>;
    currentTask?: string;
  }): Promise<string[]> {
    const soul = await this.loadSoulState();
    const additions: string[] = [];

    // Personality guidance
    additions.push("## Personality");
    additions.push(
      `Your personality traits: formality=${soul.personality.formality.toFixed(1)}, verbosity=${soul.personality.verbosity.toFixed(1)}, humor=${soul.personality.humor.toFixed(1)}, directness=${soul.personality.directness.toFixed(1)}`,
    );

    // Communication preferences
    if (soul.communication.preferredLength) {
      additions.push(
        `Preferred response length: ${soul.communication.preferredLength.min}-${soul.communication.preferredLength.max} words`,
      );
    }
    additions.push(`Emoji usage: ${soul.communication.emojiUsage < 0.3 ? "sparse" : soul.communication.emojiUsage < 0.7 ? "moderate" : "liberal"}`);
    additions.push("");

    // Learned boundaries
    if (soul.boundaries.boundaries.length > 0) {
      additions.push("## Learned Boundaries");
      const highConfidenceBoundaries = soul.boundaries.boundaries
        .filter((b) => b.confidence > 0.7)
        .slice(-5);
      for (const boundary of highConfidenceBoundaries) {
        additions.push(`- ${boundary.rule}`);
      }
      additions.push("");
    }

    // Context-aware adjustments
    if (context?.conversationHistory) {
      const recentMessages = context.conversationHistory.slice(-3);
      const userMessages = recentMessages.filter((m) => m.role === "user");
      
      // Adjust formality based on user's style
      if (userMessages.length > 0) {
        const avgFormality = userMessages.reduce((sum, msg) => {
          const formalIndicators = ["please", "thank you", "would you", "could you"].filter(
            (word) => msg.content.toLowerCase().includes(word),
          ).length;
          return sum + (formalIndicators > 0 ? 0.7 : 0.3);
        }, 0) / userMessages.length;

        if (Math.abs(avgFormality - soul.personality.formality) > 0.2) {
          additions.push(
            `Note: User's communication style suggests ${avgFormality > 0.5 ? "more formal" : "more casual"} tone may be appropriate.`,
          );
        }
      }
    }

    return additions;
  }
}

/**
 * Get or create SoulManager instance for a workspace
 */
const managerCache = new Map<string, SoulManager>();

export function getSoulManager(workspaceDir: string): SoulManager {
  const resolved = resolveUserPath(workspaceDir);
  let manager = managerCache.get(resolved);
  if (!manager) {
    manager = new SoulManager(resolved);
    managerCache.set(resolved, manager);
  }
  return manager;
}
