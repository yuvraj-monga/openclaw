/**
 * Importance Scorer: Tracks retrieval, citation, and user correction to compute memory importance
 *
 * Used by the capture engine to prioritize what to retain and by retrieval to boost important chunks.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { resolveUserPath } from "../utils.js";
import { ensureDir } from "./internal.js";

const log = createSubsystemLogger("memory:importance");

export type ImportanceRecord = {
  /** Number of times this memory was retrieved in search */
  retrievalCount: number;
  /** Number of times this memory was cited in a reply */
  citationCount: number;
  /** Number of times the user corrected or contradicted this memory */
  userCorrectionCount: number;
  /** Last time any signal was recorded (ms) */
  lastUpdated: number;
};

export type ImportanceStore = Record<string, ImportanceRecord>;

const DEFAULT_WEIGHTS = {
  retrieval: 0.3,
  citation: 0.5,
  userCorrection: -0.8,
  recencyDecayPerDay: 0.02,
};

export type ImportanceWeights = typeof DEFAULT_WEIGHTS;

/**
 * Compute a 0–1 importance score from a record and optional weights.
 * Recency decay applied so older signals matter slightly less.
 */
export function computeImportanceScore(
  record: ImportanceRecord,
  weights: ImportanceWeights = DEFAULT_WEIGHTS,
): number {
  const daysSinceUpdate = (Date.now() - record.lastUpdated) / (24 * 60 * 60 * 1000);
  const recencyFactor = Math.max(0, 1 - weights.recencyDecayPerDay * daysSinceUpdate);

  const raw =
    record.retrievalCount * weights.retrieval +
    record.citationCount * weights.citation +
    record.userCorrectionCount * weights.userCorrection;

  const normalized = 1 / (1 + Math.exp(-raw)); // sigmoid-ish, clamped by usage
  return Math.max(0, Math.min(1, normalized * recencyFactor));
}

export class ImportanceScorer {
  private readonly bankDir: string;
  private readonly storePath: string;
  private store: ImportanceStore = {};
  private dirty = false;

  constructor(workspaceDir: string) {
    const resolved = resolveUserPath(workspaceDir);
    this.bankDir = path.join(resolved, "bank");
    this.storePath = path.join(this.bankDir, "importance.json");
  }

  private async ensureBank(): Promise<void> {
    await ensureDir(this.bankDir);
  }

  /** Load store from disk (idempotent). */
  async load(): Promise<ImportanceStore> {
    try {
      const raw = await fs.readFile(this.storePath, "utf-8");
      const parsed = JSON.parse(raw) as ImportanceStore;
      if (parsed && typeof parsed === "object") {
        this.store = parsed;
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
        log.warn("Failed to load importance store: %s", String(err));
      }
    }
    return this.store;
  }

  /** Persist store to disk if dirty. */
  async save(): Promise<void> {
    if (!this.dirty) return;
    await this.ensureBank();
    await fs.writeFile(this.storePath, JSON.stringify(this.store, null, 2), "utf-8");
    this.dirty = false;
    log.debug("Saved importance store to %s", this.storePath);
  }

  private getOrCreateRecord(key: string): ImportanceRecord {
    let record = this.store[key];
    if (!record) {
      record = {
        retrievalCount: 0,
        citationCount: 0,
        userCorrectionCount: 0,
        lastUpdated: Date.now(),
      };
      this.store[key] = record;
      this.dirty = true;
    }
    return record;
  }

  /** Record a retrieval of this memory key (e.g. path or path#L12). */
  recordRetrieval(key: string): void {
    const record = this.getOrCreateRecord(key);
    record.retrievalCount += 1;
    record.lastUpdated = Date.now();
    this.dirty = true;
  }

  /** Record that a reply cited this memory. */
  recordCitation(key: string): void {
    const record = this.getOrCreateRecord(key);
    record.citationCount += 1;
    record.lastUpdated = Date.now();
    this.dirty = true;
  }

  /** Record that the user corrected or contradicted this memory. */
  recordUserCorrection(key: string): void {
    const record = this.getOrCreateRecord(key);
    record.userCorrectionCount += 1;
    record.lastUpdated = Date.now();
    this.dirty = true;
  }

  /** Get importance score for a key (0–1). Loads store if not yet loaded. */
  async getImportance(key: string, weights?: ImportanceWeights): Promise<number> {
    await this.load();
    const record = this.store[key];
    if (!record) return 0;
    return computeImportanceScore(record, weights ?? DEFAULT_WEIGHTS);
  }

  /** Get top keys by importance score, optionally above a minimum score. */
  async getTopKeys(
    limit: number = 50,
    minScore: number = 0,
    weights?: ImportanceWeights,
  ): Promise<Array<{ key: string; score: number }>> {
    await this.load();
    const w = weights ?? DEFAULT_WEIGHTS;
    const entries = Object.entries(this.store)
      .map(([key, record]) => ({ key, score: computeImportanceScore(record, w) }))
      .filter((e) => e.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return entries;
  }

  /** Get raw record for a key. */
  getRecord(key: string): ImportanceRecord | undefined {
    return this.store[key];
  }
}

const scorerCache = new Map<string, ImportanceScorer>();

export function getImportanceScorer(workspaceDir: string): ImportanceScorer {
  const resolved = resolveUserPath(workspaceDir);
  let scorer = scorerCache.get(resolved);
  if (!scorer) {
    scorer = new ImportanceScorer(resolved);
    scorerCache.set(resolved, scorer);
  }
  return scorer;
}

/**
 * Record retrieval for each search result (used by memory search to track importance).
 * Updates are in-memory until save() is called; persistence is left to callers if needed.
 */
export function recordRetrievalForResults(
  workspaceDir: string,
  results: Array<{ path: string; startLine?: number }>,
): void {
  if (results.length === 0) return;
  const scorer = getImportanceScorer(workspaceDir);
  for (const r of results) {
    const key = r.startLine != null ? `${r.path}#L${r.startLine}` : r.path;
    scorer.recordRetrieval(key);
  }
}
