/**
 * Multi-hop Retrieval: Iterative search for better recall
 * 
 * Performs multiple search iterations, using results from previous
 * iterations to refine the query and find related information.
 */

import type { MemorySearchResult } from "./manager.js";
import { expandQueryFromResults } from "./query-expansion.js";

export interface MultiHopOptions {
  /** Maximum number of hops */
  maxHops?: number;
  /** Minimum score improvement to continue */
  minImprovement?: number;
  /** Maximum results per hop */
  resultsPerHop?: number;
}

export interface MultiHopResult extends MemorySearchResult {
  /** Which hop found this result */
  hop: number;
  /** Query used to find this result */
  query: string;
}

/**
 * Perform multi-hop retrieval
 * 
 * Strategy:
 * 1. Initial search with original query
 * 2. Extract terms from top results
 * 3. Expand query and search again
 * 4. Merge and deduplicate results
 * 5. Repeat until max hops or no improvement
 */
export async function multiHopRetrieval(
  query: string,
  searchFn: (q: string, limit: number) => Promise<MemorySearchResult[]>,
  options: MultiHopOptions = {},
): Promise<MultiHopResult[]> {
  const maxHops = options.maxHops ?? 2;
  const minImprovement = options.minImprovement ?? 0.05;
  const resultsPerHop = options.resultsPerHop ?? 10;

  const allResults = new Map<string, MultiHopResult>();
  let currentQuery = query;
  let previousBestScore = 0;

  for (let hop = 0; hop < maxHops; hop++) {
    // Perform search
    const results = await searchFn(currentQuery, resultsPerHop * 2);

    if (results.length === 0) {
      break;
    }

    // Add results with hop information
    for (const result of results) {
      const key = `${result.path}:${result.startLine}:${result.endLine}`;
      if (!allResults.has(key)) {
        allResults.set(key, {
          ...result,
          hop,
          query: currentQuery,
        });
      } else {
        // Update if this hop found it with better score
        const existing = allResults.get(key)!;
        if (result.score > existing.score) {
          allResults.set(key, {
            ...result,
            hop,
            query: currentQuery,
          });
        }
      }
    }

    // Check if we should continue
    const bestScore = Math.max(...Array.from(allResults.values()).map((r) => r.score));
    const improvement = bestScore - previousBestScore;

    if (improvement < minImprovement && hop > 0) {
      // No significant improvement, stop
      break;
    }

    previousBestScore = bestScore;

    // Expand query for next hop
    if (hop < maxHops - 1 && results.length > 0) {
      const expanded = expandQueryFromResults(currentQuery, results, 2);
      if (expanded.expandedTerms.length > 0) {
        currentQuery = expanded.expanded;
      } else {
        // No expansion possible, stop
        break;
      }
    }
  }

  // Sort by score and return
  return Array.from(allResults.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, resultsPerHop * maxHops);
}

/**
 * Multi-hop with entity linking
 * 
 * Uses entity mentions in results to find related information.
 */
export async function multiHopWithEntities(
  query: string,
  searchFn: (q: string, limit: number) => Promise<MemorySearchResult[]>,
  entityExtractor: (text: string) => Promise<string[]>,
  options: MultiHopOptions = {},
): Promise<MultiHopResult[]> {
  const maxHops = options.maxHops ?? 2;
  const resultsPerHop = options.resultsPerHop ?? 10;

  const allResults = new Map<string, MultiHopResult>();
  const usedEntities = new Set<string>();
  let currentQuery = query;

  for (let hop = 0; hop < maxHops; hop++) {
    // Perform search
    const results = await searchFn(currentQuery, resultsPerHop * 2);

    if (results.length === 0) {
      break;
    }

    // Add results
    for (const result of results) {
      const key = `${result.path}:${result.startLine}:${result.endLine}`;
      if (!allResults.has(key)) {
        allResults.set(key, {
          ...result,
          hop,
          query: currentQuery,
        });
      }
    }

    // Extract entities from results
    if (hop < maxHops - 1) {
      const entities: string[] = [];
      for (const result of results.slice(0, 5)) {
        const extracted = await entityExtractor(result.snippet);
        for (const entity of extracted) {
          if (!usedEntities.has(entity) && entities.length < 3) {
            entities.push(entity);
            usedEntities.add(entity);
          }
        }
      }

      // Build next query with entities
      if (entities.length > 0) {
        currentQuery = `${query} ${entities.join(" ")}`;
      } else {
        // No entities found, use query expansion
        const expanded = expandQueryFromResults(currentQuery, results, 2);
        if (expanded.expandedTerms.length > 0) {
          currentQuery = expanded.expanded;
        } else {
          break;
        }
      }
    }
  }

  return Array.from(allResults.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, resultsPerHop * maxHops);
}
