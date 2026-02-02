/**
 * Entity page templates for generating Markdown files
 */

import type { EntityPage, Fact } from "./entity-types.js";

/**
 * Generate entity page Markdown content
 */
export function generateEntityPageMarkdown(entity: EntityPage): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${entity.displayName}`);
  lines.push("");

  // Metadata
  if (entity.type) {
    lines.push(`**Type:** ${entity.type}`);
  }
  if (entity.description) {
    lines.push("");
    lines.push(entity.description);
  }
  lines.push("");
  lines.push(`**Last Updated:** ${new Date(entity.lastUpdated).toISOString()}`);
  lines.push("");

  // Relationships section
  if (entity.relationships.length > 0) {
    lines.push("## Relationships");
    lines.push("");
    for (const rel of entity.relationships) {
      const relDesc = rel.description ? ` — ${rel.description}` : "";
      lines.push(`- **${rel.relation}** [${rel.entity}](./${rel.entity}.md)${relDesc}`);
    }
    lines.push("");
  }

  // Facts section
  if (entity.facts.length > 0) {
    lines.push("## Facts");
    lines.push("");

    // Group facts by type
    const factsByType = new Map<Fact["type"], Fact[]>();
    for (const fact of entity.facts) {
      const existing = factsByType.get(fact.type) || [];
      existing.push(fact);
      factsByType.set(fact.type, existing);
    }

    // Render facts grouped by type
    const typeOrder: Fact["type"][] = ["world", "experience", "opinion", "observation", "summary"];
    for (const type of typeOrder) {
      const facts = factsByType.get(type);
      if (!facts || facts.length === 0) continue;

      lines.push(`### ${type.charAt(0).toUpperCase() + type.slice(1)}`);
      lines.push("");

      for (const fact of facts) {
        const confidence = fact.confidence !== undefined ? ` (c=${fact.confidence.toFixed(2)})` : "";
        const source = fact.source ? ` [source](${fact.source})` : "";
        const dateInfo =
          fact.dateRange?.start && fact.dateRange.start > 0
            ? ` (${new Date(fact.dateRange.start).toLocaleDateString()}${
                fact.dateRange.end ? ` - ${new Date(fact.dateRange.end).toLocaleDateString()}` : ""
              })`
            : "";

        lines.push(`- ${fact.content}${confidence}${dateInfo}${source}`);
      }
      lines.push("");
    }
  } else {
    lines.push("## Facts");
    lines.push("");
    lines.push("_No facts recorded yet._");
    lines.push("");
  }

  // Evidence section (for opinions with evidence)
  const opinionsWithEvidence = entity.facts.filter(
    (f) => f.type === "opinion" && (f.supportingEvidence?.length || f.contradictingEvidence?.length),
  );
  if (opinionsWithEvidence.length > 0) {
    lines.push("## Evidence");
    lines.push("");
    for (const fact of opinionsWithEvidence) {
      if (fact.supportingEvidence?.length) {
        lines.push(`**Supporting ${fact.id}:**`);
        for (const evId of fact.supportingEvidence) {
          lines.push(`- ${evId}`);
        }
        lines.push("");
      }
      if (fact.contradictingEvidence?.length) {
        lines.push(`**Contradicting ${fact.id}:**`);
        for (const evId of fact.contradictingEvidence) {
          lines.push(`- ${evId}`);
        }
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

/**
 * Generate empty entity page template
 */
export function generateEmptyEntityPage(name: string, displayName: string, type = "unknown"): string {
  const entity: EntityPage = {
    name,
    displayName,
    type,
    facts: [],
    relationships: [],
    lastUpdated: Date.now(),
    filePath: `bank/entities/${name}.md`,
  };
  return generateEntityPageMarkdown(entity);
}

/**
 * Parse entity page from Markdown content
 */
export function parseEntityPageMarkdown(content: string, filePath: string): Partial<EntityPage> {
  const lines = content.split("\n");
  const entity: Partial<EntityPage> = {
    facts: [],
    relationships: [],
    filePath,
  };

  let currentSection: string | null = null;
  let currentSubsection: string | null = null;
  let factBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || "";
    const trimmed = line.trim();

    // Header
    if (line.startsWith("# ")) {
      entity.displayName = trimmed.slice(2);
      const nameMatch = filePath.match(/\/([^/]+)\.md$/);
      entity.name = nameMatch ? nameMatch[1] : entity.displayName.toLowerCase().replace(/\s+/g, "-");
      continue;
    }

    // Type
    if (trimmed.startsWith("**Type:**")) {
      entity.type = trimmed.slice(9).trim();
      continue;
    }

    // Description (between type and sections)
    if (!currentSection && trimmed && !trimmed.startsWith("**") && !trimmed.startsWith("#")) {
      if (!entity.description) {
        entity.description = trimmed;
      } else {
        entity.description += " " + trimmed;
      }
      continue;
    }

    // Section headers
    if (line.startsWith("## ")) {
      currentSection = trimmed.slice(3).toLowerCase();
      currentSubsection = null;
      factBuffer = [];
      continue;
    }

    if (line.startsWith("### ")) {
      currentSubsection = trimmed.slice(4).toLowerCase();
      factBuffer = [];
      continue;
    }

    // Relationships
    if (currentSection === "relationships" && trimmed.startsWith("- **")) {
      const match = trimmed.match(/^- \*\*([^*]+)\*\* \[([^\]]+)\]\(\.\/([^)]+)\)(.*)$/);
      if (match) {
        const [, relation, , entityName, description] = match;
        entity.relationships = entity.relationships || [];
        entity.relationships.push({
          entity: entityName,
          relation: relation as any,
          description: description.trim() || undefined,
          establishedAt: Date.now(),
        });
      }
      continue;
    }

    // Facts
    if (currentSection === "facts" && trimmed.startsWith("- ")) {
      const factContent = trimmed.slice(2);
      const fact: Partial<Fact> = {
        id: `fact-${Date.now()}-${i}`,
        content: factContent,
        entities: [],
        source: filePath,
        timestamp: Date.now(),
      };

      // Extract confidence
      const confidenceMatch = factContent.match(/\(c=([0-9.]+)\)/);
      if (confidenceMatch) {
        fact.confidence = parseFloat(confidenceMatch[1]);
        fact.type = "opinion";
      } else if (currentSubsection) {
        fact.type = currentSubsection as Fact["type"];
      } else {
        fact.type = "observation";
      }

      // Extract source link
      const sourceMatch = factContent.match(/\[source\]\(([^)]+)\)/);
      if (sourceMatch) {
        fact.source = sourceMatch[1];
      }

      entity.facts = entity.facts || [];
      entity.facts.push(fact as Fact);
      continue;
    }
  }

  // Extract last updated
  const lastUpdatedMatch = content.match(/\*\*Last Updated:\*\* (.+)/);
  if (lastUpdatedMatch) {
    const date = new Date(lastUpdatedMatch[1]);
    if (!isNaN(date.getTime())) {
      entity.lastUpdated = date.getTime();
    }
  }

  if (!entity.lastUpdated) {
    entity.lastUpdated = Date.now();
  }

  return entity;
}
