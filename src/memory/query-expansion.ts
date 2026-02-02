/**
 * Query Expansion: Expand queries with synonyms and related terms
 * 
 * Improves recall by expanding user queries with semantically related
 * terms, synonyms, and contextually relevant keywords.
 */

import type { MemorySearchResult } from "./manager.js";

export interface ExpandedQuery {
  /** Original query */
  original: string;
  /** Expanded terms */
  expandedTerms: string[];
  /** Full expanded query */
  expanded: string;
  /** Confidence in expansion (0.0-1.0) */
  confidence: number;
}

/**
 * Simple query expansion using common synonyms and related terms
 * 
 * This is a basic implementation. For production, consider:
 * - Using WordNet or similar lexical databases
 * - Using LLM-based expansion
 * - Using embedding-based term similarity
 */
export function expandQuery(query: string, maxTerms: number = 3): ExpandedQuery {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const expandedTerms: string[] = [];

  // Simple synonym mapping (can be extended with a proper dictionary)
  const synonyms: Record<string, string[]> = {
    // Technical terms
    error: ["bug", "issue", "problem", "failure"],
    fix: ["repair", "resolve", "solve", "correct"],
    feature: ["functionality", "capability", "function"],
    config: ["configuration", "settings", "setup"],
    api: ["endpoint", "service", "interface"],
    database: ["db", "store", "storage"],
    server: ["host", "machine", "instance"],
    client: ["app", "application", "frontend"],
    backend: ["server", "api", "service"],

    // Common verbs
    create: ["make", "build", "generate", "add"],
    update: ["modify", "change", "edit", "alter"],
    delete: ["remove", "drop", "erase"],
    get: ["fetch", "retrieve", "load", "read"],
    set: ["configure", "assign", "define"],

    // Common nouns
    user: ["person", "account", "profile"],
    message: ["text", "chat", "communication"],
    file: ["document", "resource"],
    folder: ["directory", "path"],
    project: ["workspace", "repo", "codebase"],

    // Time-related
    today: ["now", "current", "recent"],
    yesterday: ["previous day", "recent"],
    week: ["7 days", "recent"],
    month: ["30 days", "recent period"],

    // Memory-related
    remember: ["recall", "retrieve", "find"],
    memory: ["recall", "history", "past"],
    fact: ["information", "detail", "data"],
  };

  // Expand each term
  for (const term of terms) {
    // Add original term
    if (!expandedTerms.includes(term)) {
      expandedTerms.push(term);
    }

    // Add synonyms
    const termSynonyms = synonyms[term] || [];
    for (const synonym of termSynonyms.slice(0, maxTerms)) {
      if (!expandedTerms.includes(synonym) && expandedTerms.length < maxTerms * terms.length) {
        expandedTerms.push(synonym);
      }
    }
  }

  // Build expanded query
  const expanded = expandedTerms.join(" ");

  // Calculate confidence (more terms = lower confidence per term)
  const confidence = Math.max(0.3, 1.0 - (expandedTerms.length - terms.length) * 0.1);

  return {
    original: query,
    expandedTerms: expandedTerms.slice(terms.length), // Only new terms
    expanded,
    confidence,
  };
}

/**
 * Expand query using LLM (if available)
 * 
 * This would use an LLM to generate semantically related terms.
 * For now, this is a placeholder that falls back to simple expansion.
 */
export async function expandQueryWithLLM(
  query: string,
  maxTerms: number = 3,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  llmProvider?: (prompt: string) => Promise<string>,
): Promise<ExpandedQuery> {
  // TODO: Implement LLM-based expansion
  // For now, fall back to simple expansion
  return expandQuery(query, maxTerms);
}

/**
 * Expand query based on search results (pseudo-relevance feedback)
 * 
 * Uses top results to extract additional relevant terms.
 */
export function expandQueryFromResults(
  query: string,
  results: MemorySearchResult[],
  maxTerms: number = 3,
): ExpandedQuery {
  if (results.length === 0) {
    return expandQuery(query, maxTerms);
  }

  // Extract keywords from top results
  const termFreq = new Map<string, number>();
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "should",
    "could",
    "may",
    "might",
    "can",
    "this",
    "that",
    "these",
    "those",
  ]);

  // Count terms from top results
  for (const result of results.slice(0, 5)) {
    const words = result.snippet
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopWords.has(w));

    for (const word of words) {
      const cleaned = word.replace(/[^a-z0-9]/g, "");
      if (cleaned.length > 2) {
        termFreq.set(cleaned, (termFreq.get(cleaned) || 0) + result.score);
      }
    }
  }

  // Get top terms not in original query
  const originalTerms = new Set(query.toLowerCase().split(/\s+/));
  const expandedTerms: string[] = [];

  const sortedTerms = Array.from(termFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([term]) => term)
    .filter((term) => !originalTerms.has(term))
    .slice(0, maxTerms);

  expandedTerms.push(...sortedTerms);

  const expanded = query + " " + expandedTerms.join(" ");

  return {
    original: query,
    expandedTerms,
    expanded,
    confidence: 0.6, // Moderate confidence for result-based expansion
  };
}
