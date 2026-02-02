/**
 * Soul Types: Personality dimensions, traits, and evolution tracking
 * 
 * Defines the structure for tracking and evolving the agent's personality,
 * preferences, and behavioral patterns over time.
 */

export type PersonalityDimension =
  | "formality"
  | "verbosity"
  | "humor"
  | "directness"
  | "empathy"
  | "curiosity"
  | "assertiveness"
  | "patience";

export interface PersonalityTraits {
  /** Formality level (0.0 = casual, 1.0 = formal) */
  formality: number;
  /** Verbosity level (0.0 = concise, 1.0 = verbose) */
  verbosity: number;
  /** Humor level (0.0 = serious, 1.0 = playful) */
  humor: number;
  /** Directness level (0.0 = indirect, 1.0 = direct) */
  directness: number;
  /** Empathy level (0.0 = analytical, 1.0 = empathetic) */
  empathy: number;
  /** Curiosity level (0.0 = focused, 1.0 = exploratory) */
  curiosity: number;
  /** Assertiveness level (0.0 = passive, 1.0 = assertive) */
  assertiveness: number;
  /** Patience level (0.0 = quick, 1.0 = patient) */
  patience: number;
}

export interface CommunicationPreferences {
  /** Preferred response length in words */
  preferredLength?: {
    min: number;
    max: number;
  };
  /** Emoji usage preference (0.0 = none, 1.0 = frequent) */
  emojiUsage: number;
  /** Technical depth preference (0.0 = simple, 1.0 = deep) */
  technicalDepth: number;
  /** Use of examples (0.0 = none, 1.0 = frequent) */
  exampleUsage: number;
  /** Use of analogies (0.0 = none, 1.0 = frequent) */
  analogyUsage: number;
}

export interface ToolPreferences {
  /** Preferred tools for common tasks */
  preferredTools: Record<string, string[]>;
  /** Tools to avoid when possible */
  avoidedTools: string[];
  /** Tool usage patterns */
  toolPatterns: Array<{
    task: string;
    tools: string[];
    frequency: number;
  }>;
}

export interface BoundaryLearning {
  /** What works well */
  successes: Array<{
    action: string;
    context: string;
    timestamp: number;
  }>;
  /** What doesn't work */
  failures: Array<{
    action: string;
    context: string;
    feedback: string;
    timestamp: number;
  }>;
  /** Learned boundaries */
  boundaries: Array<{
    rule: string;
    confidence: number;
    source: string;
    timestamp: number;
  }>;
}

export interface SoulState {
  /** Current personality traits */
  personality: PersonalityTraits;
  /** Communication preferences */
  communication: CommunicationPreferences;
  /** Tool preferences */
  tools: ToolPreferences;
  /** Learned boundaries */
  boundaries: BoundaryLearning;
  /** Evolution log */
  evolutionLog: Array<{
    timestamp: number;
    dimension: PersonalityDimension | "communication" | "boundaries";
    change: string;
    reason: string;
  }>;
  /** Last reflection timestamp */
  lastReflection: number;
  /** Last updated timestamp */
  lastUpdated: number;
}

export interface SoulReflectionResult {
  /** Updated soul state */
  soul: SoulState;
  /** Changes made */
  changes: Array<{
    dimension: string;
    before: number | string;
    after: number | string;
    reason: string;
  }>;
  /** Suggested SOUL.md updates */
  suggestedUpdates: string[];
}

export interface SoulUpdateOptions {
  /** Update personality traits */
  personality?: Partial<PersonalityTraits>;
  /** Update communication preferences */
  communication?: Partial<CommunicationPreferences>;
  /** Update tool preferences */
  tools?: Partial<ToolPreferences>;
  /** Add boundary learning */
  boundary?: {
    type: "success" | "failure" | "boundary";
    data: {
      action?: string;
      context?: string;
      feedback?: string;
      rule?: string;
      confidence?: number;
      source?: string;
    };
  };
  /** Reason for update */
  reason?: string;
}
