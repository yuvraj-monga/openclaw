/**
 * Entity Manager: CRUD operations for entity-centric memory system
 * 
 * Manages entity pages in bank/entities/ directory and provides
 * methods for creating, reading, updating, and querying entities.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { resolveUserPath } from "../utils.js";
import type {
  EntityPage,
  EntityCreateOptions,
  EntityUpdateOptions,
  EntityQueryOptions,
  EntitySummary,
  Fact,
  EntityRelationship,
} from "./entity-types.js";
import {
  generateEntityPageMarkdown,
  generateEmptyEntityPage,
  parseEntityPageMarkdown,
} from "./entity-templates.js";
import { ensureDir } from "./internal.js";

const log = createSubsystemLogger("memory:entity");

export class EntityManager {
  private readonly workspaceDir: string;
  private readonly bankDir: string;
  private readonly entitiesDir: string;

  constructor(workspaceDir: string) {
    this.workspaceDir = resolveUserPath(workspaceDir);
    this.bankDir = path.join(this.workspaceDir, "bank");
    this.entitiesDir = path.join(this.bankDir, "entities");
  }

  /**
   * Ensure bank/entities directory exists
   */
  private async ensureDirectories(): Promise<void> {
    await ensureDir(this.bankDir);
    await ensureDir(this.entitiesDir);
  }

  /**
   * Get entity file path
   */
  private getEntityFilePath(name: string): string {
    // Sanitize name for filename
    const sanitized = name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return path.join(this.entitiesDir, `${sanitized}.md`);
  }

  /**
   * Normalize entity name (slug)
   */
  private normalizeEntityName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  /**
   * Create a new entity
   */
  async createEntity(name: string, options: EntityCreateOptions = {}): Promise<EntityPage> {
    await this.ensureDirectories();

    const normalizedName = this.normalizeEntityName(name);
    const filePath = this.getEntityFilePath(normalizedName);

    // Check if entity already exists
    try {
      await fs.access(filePath);
      throw new Error(`Entity "${name}" already exists`);
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        throw err;
      }
    }

    const entity: EntityPage = {
      name: normalizedName,
      displayName: options.displayName || name,
      type: options.type || "unknown",
      description: options.description,
      facts: [],
      relationships: [],
      lastUpdated: Date.now(),
      filePath: `bank/entities/${normalizedName}.md`,
    };

    const content = generateEntityPageMarkdown(entity);
    await fs.writeFile(filePath, content, "utf-8");

    log.info(`Created entity: ${name} (${normalizedName})`);
    return entity;
  }

  /**
   * Get an entity by name
   */
  async getEntity(name: string): Promise<EntityPage | null> {
    await this.ensureDirectories();

    const normalizedName = this.normalizeEntityName(name);
    const filePath = this.getEntityFilePath(normalizedName);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = parseEntityPageMarkdown(content, `bank/entities/${normalizedName}.md`);

      if (!parsed.name || !parsed.displayName) {
        return null;
      }

      return {
        name: parsed.name,
        displayName: parsed.displayName,
        type: parsed.type || "unknown",
        description: parsed.description,
        facts: parsed.facts || [],
        relationships: parsed.relationships || [],
        lastUpdated: parsed.lastUpdated || Date.now(),
        filePath: parsed.filePath || `bank/entities/${normalizedName}.md`,
      };
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  /**
   * Update an entity
   */
  async updateEntity(name: string, options: EntityUpdateOptions): Promise<EntityPage> {
    await this.ensureDirectories();

    const normalizedName = this.normalizeEntityName(name);
    const existing = await this.getEntity(name);

    if (!existing) {
      throw new Error(`Entity "${name}" not found`);
    }

    // Apply updates
    if (options.displayName !== undefined) {
      existing.displayName = options.displayName;
    }
    if (options.type !== undefined) {
      existing.type = options.type;
    }
    if (options.description !== undefined) {
      existing.description = options.description;
    }

    // Add facts
    if (options.addFacts) {
      for (const fact of options.addFacts) {
        if (!fact.id) {
          fact.id = randomUUID();
        }
        if (!fact.timestamp) {
          fact.timestamp = Date.now();
        }
        existing.facts.push(fact);
      }
    }

    // Remove facts
    if (options.removeFactIds) {
      existing.facts = existing.facts.filter((f) => !options.removeFactIds!.includes(f.id));
    }

    // Add relationships
    if (options.addRelationships) {
      for (const rel of options.addRelationships) {
        existing.relationships.push({
          ...rel,
          establishedAt: Date.now(),
        });
      }
    }

    // Remove relationships
    if (options.removeRelationships) {
      existing.relationships = existing.relationships.filter(
        (r) =>
          !options.removeRelationships!.some(
            (rr) => rr.entity === r.entity && rr.relation === r.relation,
          ),
      );
    }

    existing.lastUpdated = Date.now();

    // Write back
    const content = generateEntityPageMarkdown(existing);
    const filePath = this.getEntityFilePath(normalizedName);
    await fs.writeFile(filePath, content, "utf-8");

    log.info(`Updated entity: ${name}`);
    return existing;
  }

  /**
   * Delete an entity
   */
  async deleteEntity(name: string): Promise<void> {
    await this.ensureDirectories();

    const normalizedName = this.normalizeEntityName(name);
    const filePath = this.getEntityFilePath(normalizedName);

    try {
      await fs.unlink(filePath);
      log.info(`Deleted entity: ${name}`);
    } catch (err: any) {
      if (err.code === "ENOENT") {
        throw new Error(`Entity "${name}" not found`);
      }
      throw err;
    }
  }

  /**
   * List all entities
   */
  async listEntities(): Promise<EntitySummary[]> {
    await this.ensureDirectories();

    try {
      const files = await fs.readdir(this.entitiesDir);
      const entities: EntitySummary[] = [];

      for (const file of files) {
        if (!file.endsWith(".md")) continue;

        const name = file.slice(0, -3); // Remove .md
        const entity = await this.getEntity(name);

        if (entity) {
          // Get key facts (top 5 by importance or recency)
          const keyFacts = entity.facts
            .sort((a, b) => {
              // Prioritize opinions with high confidence
              if (a.type === "opinion" && b.type !== "opinion") return -1;
              if (b.type === "opinion" && a.type !== "opinion") return 1;
              if (a.type === "opinion" && b.type === "opinion") {
                return (b.confidence || 0) - (a.confidence || 0);
              }
              // Then by recency
              return b.timestamp - a.timestamp;
            })
            .slice(0, 5);

          entities.push({
            name: entity.name,
            displayName: entity.displayName,
            type: entity.type,
            summary: entity.description || `Entity of type ${entity.type}`,
            keyFacts,
            relationshipCount: entity.relationships.length,
            lastUpdated: entity.lastUpdated,
          });
        }
      }

      return entities.sort((a, b) => b.lastUpdated - a.lastUpdated);
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return [];
      }
      throw err;
    }
  }

  /**
   * Query entities with filters
   */
  async queryEntities(options: EntityQueryOptions = {}): Promise<EntityPage[]> {
    const allEntities = await this.listEntities();
    const results: EntityPage[] = [];

    for (const summary of allEntities) {
      const entity = await this.getEntity(summary.name);
      if (!entity) continue;

      // Filter by fact type
      if (options.factType) {
        if (!entity.facts.some((f) => f.type === options.factType)) {
          continue;
        }
      }

      // Filter by date range
      if (options.since || options.until) {
        const sinceTs = options.since?.getTime() || 0;
        const untilTs = options.until?.getTime() || Date.now();

        const hasFactsInRange = entity.facts.some((f) => {
          const factTime = f.dateRange?.start || f.timestamp;
          return factTime >= sinceTs && factTime <= untilTs;
        });

        if (!hasFactsInRange && entity.lastUpdated < sinceTs) {
          continue;
        }
      }

      // Filter by relationship type
      if (options.relationType) {
        if (!entity.relationships.some((r) => r.relation === options.relationType)) {
          continue;
        }
      }

      results.push(entity);

      if (options.limit && results.length >= options.limit) {
        break;
      }
    }

    return results;
  }

  /**
   * Link two entities with a relationship
   */
  async linkEntities(
    entity1: string,
    entity2: string,
    relation: EntityRelationship["relation"],
    description?: string,
    sourceFactId?: string,
  ): Promise<void> {
    // Ensure both entities exist
    const e1 = await this.getEntity(entity1);
    const e2 = await this.getEntity(entity2);

    if (!e1) {
      throw new Error(`Entity "${entity1}" not found`);
    }
    if (!e2) {
      throw new Error(`Entity "${entity2}" not found`);
    }

    // Add relationship to entity1
    await this.updateEntity(entity1, {
      addRelationships: [
        {
          entity: e2.name,
          relation,
          description,
          sourceFactId,
        },
      ],
    });

    // Add reverse relationship to entity2 (if applicable)
    // For symmetric relations, add the reverse
    const reverseRelations: Record<string, EntityRelationship["relation"]> = {
      works_with: "works_with",
      knows: "knows",
      related_to: "related_to",
    };

    if (reverseRelations[relation]) {
      await this.updateEntity(entity2, {
        addRelationships: [
          {
            entity: e1.name,
            relation: reverseRelations[relation],
            description,
            sourceFactId,
          },
        ],
      });
    }
  }

  /**
   * Add a fact to an entity (or create entity if it doesn't exist)
   */
  async addFactToEntity(entityName: string, fact: Omit<Fact, "id" | "timestamp" | "source">): Promise<void> {
    const entity = await this.getEntity(entityName);

    if (!entity) {
      // Create entity if it doesn't exist
      await this.createEntity(entityName, {
        type: "unknown",
      });
    }

    const fullFact: Fact = {
      ...fact,
      id: randomUUID(),
      timestamp: Date.now(),
      source: `bank/entities/${this.normalizeEntityName(entityName)}.md`,
    };

    await this.updateEntity(entityName, {
      addFacts: [fullFact],
    });
  }
}

/**
 * Get or create EntityManager instance for a workspace
 */
const managerCache = new Map<string, EntityManager>();

export function getEntityManager(workspaceDir: string): EntityManager {
  const resolved = resolveUserPath(workspaceDir);
  let manager = managerCache.get(resolved);
  if (!manager) {
    manager = new EntityManager(resolved);
    managerCache.set(resolved, manager);
  }
  return manager;
}
