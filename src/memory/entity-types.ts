/**
 * Entity-centric memory system types
 * 
 * Entities represent people, places, projects, concepts, and other
 * persistent objects that the agent interacts with or learns about.
 */

export type FactType = "world" | "experience" | "opinion" | "summary" | "observation";

export type EntityRelationType =
  | "works_with"
  | "knows"
  | "related_to"
  | "part_of"
  | "owns"
  | "created"
  | "manages"
  | "prefers"
  | "dislikes"
  | "custom";

export interface Fact {
  /** Unique identifier for this fact */
  id: string;
  /** Type of fact (world, experience, opinion, etc.) */
  type: FactType;
  /** The fact content (narrative, self-contained) */
  content: string;
  /** Entity names mentioned in this fact (e.g., ["Peter", "warelay"]) */
  entities: string[];
  /** Confidence score for opinions (0.0-1.0), undefined for other types */
  confidence?: number;
  /** Source file and line reference (e.g., "memory/2025-02-01.md#L12") */
  source: string;
  /** Timestamp when this fact was created/extracted */
  timestamp: number;
  /** Optional date range if fact is time-bound */
  dateRange?: {
    start: number;
    end?: number;
  };
  /** Evidence IDs supporting this fact (for opinions) */
  supportingEvidence?: string[];
  /** Evidence IDs contradicting this fact (for opinions) */
  contradictingEvidence?: string[];
}

export interface EntityPage {
  /** Entity name (slug, e.g., "Peter", "The-Castle") */
  name: string;
  /** Display name (e.g., "Peter", "The Castle") */
  displayName: string;
  /** Entity type (person, place, project, concept, etc.) */
  type: string;
  /** Brief description/summary */
  description?: string;
  /** Facts about this entity */
  facts: Fact[];
  /** Relationships to other entities */
  relationships: EntityRelationship[];
  /** Last updated timestamp */
  lastUpdated: number;
  /** File path relative to workspace */
  filePath: string;
}

export interface EntityRelationship {
  /** Related entity name */
  entity: string;
  /** Type of relationship */
  relation: EntityRelationType;
  /** Optional description of the relationship */
  description?: string;
  /** When this relationship was established */
  establishedAt: number;
  /** Source fact ID that established this relationship */
  sourceFactId?: string;
}

export interface EntitySummary {
  /** Entity name */
  name: string;
  /** Display name */
  displayName: string;
  /** Entity type */
  type: string;
  /** Brief summary */
  summary: string;
  /** Key facts (top N most important) */
  keyFacts: Fact[];
  /** Relationship count */
  relationshipCount: number;
  /** Last updated timestamp */
  lastUpdated: number;
}

export interface EntityQueryOptions {
  /** Filter by fact type */
  factType?: FactType;
  /** Filter by date range */
  since?: Date;
  until?: Date;
  /** Filter by relationship type */
  relationType?: EntityRelationType;
  /** Limit number of results */
  limit?: number;
}

export interface EntityCreateOptions {
  /** Display name (defaults to name) */
  displayName?: string;
  /** Entity type (defaults to "unknown") */
  type?: string;
  /** Initial description */
  description?: string;
}

export interface EntityUpdateOptions {
  /** Update display name */
  displayName?: string;
  /** Update entity type */
  type?: string;
  /** Update description */
  description?: string;
  /** Add facts */
  addFacts?: Fact[];
  /** Remove facts by ID */
  removeFactIds?: string[];
  /** Add relationships */
  addRelationships?: Omit<EntityRelationship, "establishedAt">[];
  /** Remove relationships */
  removeRelationships?: Array<{ entity: string; relation: EntityRelationType }>;
}
