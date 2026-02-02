/**
 * Opinions Manager: Manages opinion facts with confidence tracking
 * 
 * Stores opinions in bank/opinions.md and tracks confidence evolution
 * based on supporting/contradicting evidence.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { resolveUserPath } from "../utils.js";
import type { Fact } from "./entity-types.js";
import {
  type ConfidenceUpdate,
  type Evidence,
  type OpinionState,
  calculateConfidenceUpdate,
  detectConflicts,
  updateOpinionConfidence,
} from "./confidence-tracker.js";
import { ensureDir } from "./internal.js";

const log = createSubsystemLogger("memory:opinions");

export class OpinionsManager {
  private readonly workspaceDir: string;
  private readonly bankDir: string;
  private readonly opinionsFile: string;

  constructor(workspaceDir: string) {
    this.workspaceDir = resolveUserPath(workspaceDir);
    this.bankDir = path.join(this.workspaceDir, "bank");
    this.opinionsFile = path.join(this.bankDir, "opinions.md");
  }

  /**
   * Ensure bank directory exists
   */
  private async ensureDirectories(): Promise<void> {
    await ensureDir(this.bankDir);
  }

  /**
   * Load all opinions from bank/opinions.md
   */
  async loadOpinions(): Promise<OpinionState[]> {
    await this.ensureDirectories();

    try {
      const content = await fs.readFile(this.opinionsFile, "utf-8");
      return this.parseOpinionsMarkdown(content);
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return [];
      }
      throw err;
    }
  }

  /**
   * Save opinions to bank/opinions.md
   */
  async saveOpinions(opinions: OpinionState[]): Promise<void> {
    await this.ensureDirectories();

    const content = this.generateOpinionsMarkdown(opinions);
    await fs.writeFile(this.opinionsFile, content, "utf-8");

    log.info(`Saved ${opinions.length} opinions to bank/opinions.md`);
  }

  /**
   * Add or update an opinion
   */
  async addOpinion(fact: Fact, initialConfidence: number = 0.5): Promise<OpinionState> {
    if (fact.type !== "opinion") {
      throw new Error("Fact must be of type 'opinion'");
    }

    const opinions = await this.loadOpinions();

    // Check if opinion already exists (by fact ID or similar content)
    const existing = opinions.find((o) => o.fact.id === fact.id);

    if (existing) {
      // Update existing opinion
      existing.fact = fact;
      existing.confidence = fact.confidence ?? initialConfidence;
      existing.lastUpdated = Date.now();
      await this.saveOpinions(opinions);
      return existing;
    }

    // Create new opinion
    const opinion: OpinionState = {
      fact: {
        ...fact,
        confidence: fact.confidence ?? initialConfidence,
      },
      confidence: fact.confidence ?? initialConfidence,
      supportingEvidence: [],
      contradictingEvidence: [],
      lastUpdated: Date.now(),
    };

    opinions.push(opinion);
    await this.saveOpinions(opinions);

    log.info(`Added opinion: ${fact.content.slice(0, 50)}...`);
    return opinion;
  }

  /**
   * Update opinion confidence with new evidence
   */
  async updateConfidence(
    factId: string,
    evidence: Evidence,
  ): Promise<{ opinion: OpinionState; update: ConfidenceUpdate } | null> {
    const opinions = await this.loadOpinions();
    const opinion = opinions.find((o) => o.fact.id === factId);

    if (!opinion) {
      return null;
    }

    const updated = updateOpinionConfidence(opinion, evidence);
    const update: ConfidenceUpdate = {
      confidence: updated.confidence,
      reason: `Updated based on ${evidence.type} evidence (strength: ${evidence.strength.toFixed(2)})`,
      evidence,
    };

    await this.saveOpinions(opinions);

    log.info(
      `Updated opinion ${factId}: confidence ${opinion.confidence.toFixed(2)} → ${updated.confidence.toFixed(2)}`,
    );

    return { opinion: updated, update };
  }

  /**
   * Get opinions for specific entities
   */
  async getOpinionsForEntities(entityNames: string[]): Promise<OpinionState[]> {
    const opinions = await this.loadOpinions();
    return opinions.filter((o) =>
      entityNames.some((entity) => o.fact.entities.includes(entity)),
    );
  }

  /**
   * Detect conflicts in opinions
   */
  async detectConflictsForEntities(entityNames?: string[]): Promise<Conflict[]> {
    const opinions = await this.loadOpinions();
    const filtered = entityNames
      ? opinions.filter((o) => entityNames.some((entity) => o.fact.entities.includes(entity)))
      : opinions;

    return detectConflicts(filtered);
  }

  /**
   * Generate Markdown from opinions
   */
  private generateOpinionsMarkdown(opinions: OpinionState[]): string {
    const lines: string[] = [];

    lines.push("# Opinions");
    lines.push("");
    lines.push("Opinions with confidence scores and evidence tracking.");
    lines.push("");

    if (opinions.length === 0) {
      lines.push("_No opinions recorded yet._");
      lines.push("");
      return lines.join("\n");
    }

    // Group by entity
    const byEntity = new Map<string, OpinionState[]>();
    for (const opinion of opinions) {
      for (const entity of opinion.fact.entities) {
        const existing = byEntity.get(entity) || [];
        existing.push(opinion);
        byEntity.set(entity, existing);
      }
    }

    // Sort entities
    const sortedEntities = Array.from(byEntity.keys()).sort();

    for (const entity of sortedEntities) {
      const entityOpinions = byEntity.get(entity) || [];
      lines.push(`## ${entity}`);
      lines.push("");

      for (const opinion of entityOpinions) {
        const confidence = opinion.confidence.toFixed(2);
        const updated = new Date(opinion.lastUpdated).toLocaleDateString();
        lines.push(`### ${opinion.fact.content.slice(0, 60)}...`);
        lines.push("");
        lines.push(`**Confidence:** ${confidence}`);
        lines.push(`**Last Updated:** ${updated}`);
        lines.push(`**Fact ID:** ${opinion.fact.id}`);
        lines.push("");

        if (opinion.supportingEvidence.length > 0) {
          lines.push("**Supporting Evidence:**");
          for (const ev of opinion.supportingEvidence) {
            lines.push(`- ${ev.factId} (strength: ${ev.strength.toFixed(2)})`);
          }
          lines.push("");
        }

        if (opinion.contradictingEvidence.length > 0) {
          lines.push("**Contradicting Evidence:**");
          for (const ev of opinion.contradictingEvidence) {
            lines.push(`- ${ev.factId} (strength: ${ev.strength.toFixed(2)})`);
          }
          lines.push("");
        }
      }
    }

    return lines.join("\n");
  }

  /**
   * Parse opinions from Markdown
   */
  private parseOpinionsMarkdown(content: string): OpinionState[] {
    const opinions: OpinionState[] = [];
    const lines = content.split("\n");

    let currentEntity: string | null = null;
    let currentOpinion: Partial<OpinionState> | null = null;
    let currentSection: string | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Entity header
      if (line.startsWith("## ") && !line.startsWith("### ")) {
        currentEntity = trimmed.slice(3);
        continue;
      }

      // Opinion header
      if (line.startsWith("### ")) {
        // Save previous opinion
        if (currentOpinion && currentOpinion.fact) {
          opinions.push(currentOpinion as OpinionState);
        }

        // Start new opinion
        const content = trimmed.slice(4).replace(/\.\.\.$/, "");
        currentOpinion = {
          fact: {
            id: "",
            type: "opinion",
            content,
            entities: currentEntity ? [currentEntity] : [],
            confidence: 0.5,
            source: this.opinionsFile,
            timestamp: Date.now(),
          },
          confidence: 0.5,
          supportingEvidence: [],
          contradictingEvidence: [],
          lastUpdated: Date.now(),
        };
        currentSection = null;
        continue;
      }

      // Confidence
      if (trimmed.startsWith("**Confidence:**")) {
        const conf = parseFloat(trimmed.slice(15).trim());
        if (!isNaN(conf) && currentOpinion) {
          currentOpinion.confidence = conf;
          if (currentOpinion.fact) {
            currentOpinion.fact.confidence = conf;
          }
        }
        continue;
      }

      // Last Updated
      if (trimmed.startsWith("**Last Updated:**")) {
        const dateStr = trimmed.slice(17).trim();
        const date = new Date(dateStr);
        if (!isNaN(date.getTime()) && currentOpinion) {
          currentOpinion.lastUpdated = date.getTime();
        }
        continue;
      }

      // Fact ID
      if (trimmed.startsWith("**Fact ID:**")) {
        const id = trimmed.slice(12).trim();
        if (currentOpinion && currentOpinion.fact) {
          currentOpinion.fact.id = id;
        }
        continue;
      }

      // Supporting/Contradicting Evidence
      if (trimmed === "**Supporting Evidence:**") {
        currentSection = "supporting";
        continue;
      }

      if (trimmed === "**Contradicting Evidence:**") {
        currentSection = "contradicting";
        continue;
      }

      // Evidence items
      if (trimmed.startsWith("- ") && currentSection && currentOpinion) {
        const match = trimmed.match(/^- (.+) \(strength: ([0-9.]+)\)$/);
        if (match) {
          const [, factId, strengthStr] = match;
          const strength = parseFloat(strengthStr);
          const evidence: Evidence = {
            factId,
            type: currentSection === "supporting" ? "supporting" : "contradicting",
            strength: isNaN(strength) ? 0.5 : strength,
            addedAt: Date.now(),
          };

          if (currentSection === "supporting") {
            currentOpinion.supportingEvidence = currentOpinion.supportingEvidence || [];
            currentOpinion.supportingEvidence.push(evidence);
          } else {
            currentOpinion.contradictingEvidence = currentOpinion.contradictingEvidence || [];
            currentOpinion.contradictingEvidence.push(evidence);
          }
        }
        continue;
      }
    }

    // Save last opinion
    if (currentOpinion && currentOpinion.fact) {
      opinions.push(currentOpinion as OpinionState);
    }

    return opinions;
  }
}

/**
 * Get or create OpinionsManager instance for a workspace
 */
const managerCache = new Map<string, OpinionsManager>();

export function getOpinionsManager(workspaceDir: string): OpinionsManager {
  const resolved = resolveUserPath(workspaceDir);
  let manager = managerCache.get(resolved);
  if (!manager) {
    manager = new OpinionsManager(resolved);
    managerCache.set(resolved, manager);
  }
  return manager;
}

// Re-export Conflict type
export type Conflict = ReturnType<typeof detectConflicts>[number];
