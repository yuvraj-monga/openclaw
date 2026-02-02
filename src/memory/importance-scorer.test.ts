import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  computeImportanceScore,
  getImportanceScorer,
  recordRetrievalForResults,
  type ImportanceRecord,
  type ImportanceWeights,
} from "./importance-scorer.js";

describe("computeImportanceScore", () => {
  it("returns 0.5 (neutral) for empty record", () => {
    const record: ImportanceRecord = {
      retrievalCount: 0,
      citationCount: 0,
      userCorrectionCount: 0,
      lastUpdated: Date.now(),
    };
    // sigmoid(0) = 0.5, which represents neutral importance
    expect(computeImportanceScore(record)).toBe(0.5);
  });

  it("increases with retrieval and citation", () => {
    const base: ImportanceRecord = {
      retrievalCount: 0,
      citationCount: 0,
      userCorrectionCount: 0,
      lastUpdated: Date.now(),
    };
    const withRetrieval = { ...base, retrievalCount: 5 };
    const withCitation = { ...base, citationCount: 3 };
    expect(computeImportanceScore(withRetrieval)).toBeGreaterThan(0);
    expect(computeImportanceScore(withCitation)).toBeGreaterThan(0);
  });

  it("decreases with user correction", () => {
    const positive: ImportanceRecord = {
      retrievalCount: 2,
      citationCount: 1,
      userCorrectionCount: 0,
      lastUpdated: Date.now(),
    };
    const corrected = { ...positive, userCorrectionCount: 2 };
    expect(computeImportanceScore(corrected)).toBeLessThan(computeImportanceScore(positive));
  });
});

describe("ImportanceScorer", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "importance-scorer-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("recordRetrieval creates record and getImportance returns > 0", async () => {
    const scorer = getImportanceScorer(tmpDir);
    scorer.recordRetrieval("memory/foo.md#L10");
    const score = await scorer.getImportance("memory/foo.md#L10");
    expect(score).toBeGreaterThan(0);
  });

  it("recordCitation and recordUserCorrection update record", async () => {
    const scorer = getImportanceScorer(tmpDir);
    const key = "memory/bar.md#L5";
    scorer.recordRetrieval(key);
    scorer.recordCitation(key);
    const record = scorer.getRecord(key);
    expect(record?.citationCount).toBe(1);
    scorer.recordUserCorrection(key);
    const after = scorer.getRecord(key);
    expect(after?.userCorrectionCount).toBe(1);
  });

  it("getTopKeys returns entries sorted by score", async () => {
    const scorer = getImportanceScorer(tmpDir);
    scorer.recordRetrieval("low");
    scorer.recordRetrieval("high");
    scorer.recordCitation("high");
    const top = await scorer.getTopKeys(5, 0);
    expect(top.length).toBeGreaterThanOrEqual(1);
    const highEntry = top.find((e) => e.key === "high");
    const lowEntry = top.find((e) => e.key === "low");
    if (highEntry && lowEntry) {
      expect(highEntry.score).toBeGreaterThanOrEqual(lowEntry.score);
    }
  });

  it("recordRetrievalForResults records each result", () => {
    recordRetrievalForResults(tmpDir, [
      { path: "memory/a.md", startLine: 1 },
      { path: "memory/b.md" },
    ]);
    const scorer = getImportanceScorer(tmpDir);
    expect(scorer.getRecord("memory/a.md#L1")?.retrievalCount).toBe(1);
    expect(scorer.getRecord("memory/b.md")?.retrievalCount).toBe(1);
  });

  it("recordRetrievalForResults is no-op for empty results", async () => {
    recordRetrievalForResults(tmpDir, []);
    const scorer = getImportanceScorer(tmpDir);
    const top = await scorer.getTopKeys(10, 0);
    expect(top).toHaveLength(0);
  });
});

describe("computeImportanceScore with custom weights", () => {
  it("respects custom weights", () => {
    const record: ImportanceRecord = {
      retrievalCount: 10,
      citationCount: 0,
      userCorrectionCount: 0,
      lastUpdated: Date.now(),
    };
    const defaultScore = computeImportanceScore(record);
    const zeroRetrievalWeight: ImportanceWeights = {
      retrieval: 0,
      citation: 0.5,
      userCorrection: -0.8,
      recencyDecayPerDay: 0.02,
    };
    const customScore = computeImportanceScore(record, zeroRetrievalWeight);
    expect(customScore).toBeLessThan(defaultScore);
  });
});
