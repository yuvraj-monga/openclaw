/**
 * Confidence Tracker: Manages confidence scores and evidence for opinions
 * 
 * Tracks confidence levels (0.0-1.0) for opinion facts and manages
 * supporting/contradicting evidence. Handles confidence evolution based
 * on new evidence.
 */

import type { Fact } from "./entity-types.js";

export interface Evidence {
  /** Evidence fact ID */
  factId: string;
  /** Whether this evidence supports or contradicts the opinion */
  type: "supporting" | "contradicting";
  /** Strength of evidence (0.0-1.0) */
  strength: number;
  /** When this evidence was added */
  addedAt: number;
}

export interface OpinionState {
  /** The opinion fact */
  fact: Fact;
  /** Current confidence score */
  confidence: number;
  /** Supporting evidence */
  supportingEvidence: Evidence[];
  /** Contradicting evidence */
  contradictingEvidence: Evidence[];
  /** Last updated timestamp */
  lastUpdated: number;
}

export interface ConfidenceUpdate {
  /** New confidence score */
  confidence: number;
  /** Reason for the update */
  reason: string;
  /** Evidence that triggered the update */
  evidence?: Evidence;
}

/**
 * Calculate confidence update based on new evidence
 */
export function calculateConfidenceUpdate(
  currentConfidence: number,
  evidenceType: "supporting" | "contradicting",
  evidenceStrength: number,
): ConfidenceUpdate {
  // Clamp evidence strength to valid range
  const strength = Math.max(0, Math.min(1, evidenceStrength));

  // Calculate delta based on evidence type and strength
  let delta: number;
  if (evidenceType === "supporting") {
    // Supporting evidence increases confidence
    // Stronger evidence has more impact, but diminishing returns
    delta = strength * (1 - currentConfidence) * 0.2; // Max 20% increase per evidence
  } else {
    // Contradicting evidence decreases confidence
    // Stronger evidence has more impact
    delta = -strength * currentConfidence * 0.3; // Max 30% decrease per evidence
  }

  const newConfidence = Math.max(0, Math.min(1, currentConfidence + delta));

  return {
    confidence: newConfidence,
    reason:
      evidenceType === "supporting"
        ? `Supporting evidence (strength: ${strength.toFixed(2)}) increases confidence`
        : `Contradicting evidence (strength: ${strength.toFixed(2)}) decreases confidence`,
  };
}

/**
 * Calculate confidence from multiple evidence pieces
 */
export function calculateConfidenceFromEvidence(
  initialConfidence: number,
  evidence: Evidence[],
): number {
  let confidence = initialConfidence;

  // Sort evidence by strength (strongest first)
  const sortedEvidence = [...evidence].sort((a, b) => b.strength - a.strength);

  for (const ev of sortedEvidence) {
    const update = calculateConfidenceUpdate(confidence, ev.type, ev.strength);
    confidence = update.confidence;
  }

  return confidence;
}

/**
 * Detect conflicts between opinions
 */
export interface Conflict {
  /** First opinion fact ID */
  factId1: string;
  /** Second opinion fact ID */
  factId2: string;
  /** Type of conflict */
  type: "contradiction" | "inconsistency" | "overlap";
  /** Severity (0.0-1.0) */
  severity: number;
  /** Description of the conflict */
  description: string;
  /** Related entity names */
  entities: string[];
}

/**
 * Detect conflicts between opinions for an entity
 */
export function detectConflicts(opinions: OpinionState[]): Conflict[] {
  const conflicts: Conflict[] = [];

  for (let i = 0; i < opinions.length; i++) {
    for (let j = i + 1; j < opinions.length; j++) {
      const op1 = opinions[i];
      const op2 = opinions[j];

      // Check for direct contradictions
      if (areContradictory(op1.fact, op2.fact)) {
        const severity = Math.abs(op1.confidence - op2.confidence);
        conflicts.push({
          factId1: op1.fact.id,
          factId2: op2.fact.id,
          type: "contradiction",
          severity,
          description: `Opinions contradict each other: "${op1.fact.content}" vs "${op2.fact.content}"`,
          entities: [...new Set([...op1.fact.entities, ...op2.fact.entities])],
        });
      }

      // Check for inconsistencies (same topic, different conclusions)
      if (areInconsistent(op1.fact, op2.fact)) {
        const severity = Math.abs(op1.confidence - op2.confidence) * 0.7;
        conflicts.push({
          factId1: op1.fact.id,
          factId2: op2.fact.id,
          type: "inconsistency",
          severity,
          description: `Opinions are inconsistent: "${op1.fact.content}" vs "${op2.fact.content}"`,
          entities: [...new Set([...op1.fact.entities, ...op2.fact.entities])],
        });
      }
    }
  }

  return conflicts.sort((a, b) => b.severity - a.severity);
}

/**
 * Check if two facts are contradictory
 */
function areContradictory(fact1: Fact, fact2: Fact): boolean {
  // Simple heuristic: check for negation words
  const negationWords = ["not", "no", "never", "none", "doesn't", "don't", "won't", "can't"];
  const content1 = fact1.content.toLowerCase();
  const content2 = fact2.content.toLowerCase();

  // Check if one contains negation and the other doesn't, and they're about similar topics
  const hasNegation1 = negationWords.some((word) => content1.includes(word));
  const hasNegation2 = negationWords.some((word) => content2.includes(word));

  if (hasNegation1 !== hasNegation2) {
    // Check if they mention similar entities
    const sharedEntities = fact1.entities.filter((e) => fact2.entities.includes(e));
    if (sharedEntities.length > 0) {
      // Check for similar keywords (simple word overlap)
      const words1 = new Set(content1.split(/\s+/).filter((w) => w.length > 3));
      const words2 = new Set(content2.split(/\s+/).filter((w) => w.length > 3));
      const overlap = [...words1].filter((w) => words2.has(w)).length;
      const totalUnique = new Set([...words1, ...words2]).size;
      const similarity = overlap / Math.max(1, totalUnique);

      // If high similarity and opposite negation, likely contradictory
      return similarity > 0.3;
    }
  }

  return false;
}

/**
 * Check if two facts are inconsistent (same topic, different conclusions)
 */
function areInconsistent(fact1: Fact, fact2: Fact): boolean {
  // Check for shared entities
  const sharedEntities = fact1.entities.filter((e) => fact2.entities.includes(e));
  if (sharedEntities.length === 0) {
    return false;
  }

  // Check for similar topics (word overlap)
  const words1 = new Set(fact1.content.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const words2 = new Set(fact2.content.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const overlap = [...words1].filter((w) => words2.has(w)).length;
  const totalUnique = new Set([...words1, ...words2]).size;
  const similarity = overlap / Math.max(1, totalUnique);

  // High similarity but different confidence suggests inconsistency
  return similarity > 0.4 && Math.abs((fact1.confidence || 0) - (fact2.confidence || 0)) > 0.3;
}

/**
 * Update opinion confidence based on new evidence
 */
export function updateOpinionConfidence(
  opinion: OpinionState,
  evidence: Evidence,
): OpinionState {
  // Add evidence to appropriate list
  if (evidence.type === "supporting") {
    opinion.supportingEvidence.push(evidence);
  } else {
    opinion.contradictingEvidence.push(evidence);
  }

  // Recalculate confidence
  const allEvidence = [...opinion.supportingEvidence, ...opinion.contradictingEvidence];
  const newConfidence = calculateConfidenceFromEvidence(opinion.fact.confidence || 0.5, allEvidence);

  // Update fact confidence
  opinion.fact.confidence = newConfidence;
  opinion.confidence = newConfidence;
  opinion.lastUpdated = Date.now();

  // Update fact's evidence arrays
  opinion.fact.supportingEvidence = opinion.supportingEvidence.map((e) => e.factId);
  opinion.fact.contradictingEvidence = opinion.contradictingEvidence.map((e) => e.factId);

  return opinion;
}

/**
 * Merge evidence from multiple sources
 */
export function mergeEvidence(evidence1: Evidence[], evidence2: Evidence[]): Evidence[] {
  const merged = new Map<string, Evidence>();

  // Add all evidence, keeping the strongest version of each fact ID
  for (const ev of [...evidence1, ...evidence2]) {
    const existing = merged.get(ev.factId);
    if (!existing || ev.strength > existing.strength) {
      merged.set(ev.factId, ev);
    }
  }

  return Array.from(merged.values());
}
