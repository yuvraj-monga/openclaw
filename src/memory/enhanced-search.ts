/**
 * Enhanced Search: Wrapper around MemoryIndexManager with advanced retrieval features
 * 
 * Provides query expansion, re-ranking, multi-hop retrieval, and context-aware
 * search capabilities on top of the base memory search.
 */

import type { MemorySearchResult } from "./manager.js";
import type { MemoryIndexManager } from "./manager.js";
import { contextualizeQuery, type ConversationContext } from "./context-aware.js";
import { multiHopRetrieval } from "./multi-hop.js";
import { expandQuery, type ExpandedQuery } from "./query-expansion.js";
import { rerankResults, type RerankedResult } from "./reranking.js";

export interface EnhancedSearchOptions {
  /** Enable query expansion */
  expansion?: {
    enabled: boolean;
    maxTerms?: number;
  };
  /** Enable re-ranking */
  rerank?: {
    enabled: boolean;
    topK?: number;
    minScore?: number;
  };
  /** Enable multi-hop retrieval */
  multiHop?: {
    enabled: boolean;
    maxHops?: number;
    minImprovement?: number;
    resultsPerHop?: number;
  };
  /** Enable context-aware search */
  contextAware?: {
    enabled: boolean;
    context?: ConversationContext;
  };
}

/**
 * Perform enhanced search with all retrieval improvements
 */
export async function enhancedSearch(
  manager: MemoryIndexManager,
  query: string,
  options: EnhancedSearchOptions = {},
): Promise<MemorySearchResult[]> {
  const expansion = options.expansion ?? { enabled: false };
  const rerank = options.rerank ?? { enabled: false };
  const multiHop = options.multiHop ?? { enabled: false };
  const contextAware = options.contextAware ?? { enabled: false };

  let searchQuery = query;
  let results: MemorySearchResult[];

  // Step 1: Context-aware query enhancement
  if (contextAware.enabled && contextAware.context) {
    const contextualized = contextualizeQuery(query, contextAware.context);
    searchQuery = contextualized.contextualized;
  }

  // Step 2: Query expansion
  let expandedQuery: ExpandedQuery | null = null;
  if (expansion.enabled) {
    expandedQuery = expandQuery(searchQuery, expansion.maxTerms ?? 3);
    searchQuery = expandedQuery.expanded;
  }

  // Step 3: Multi-hop retrieval (if enabled)
  if (multiHop.enabled) {
    results = await multiHopRetrieval(
      searchQuery,
      async (q: string, limit: number) => {
        return await manager.search(q, { maxResults: limit });
      },
      {
        maxHops: multiHop.maxHops ?? 2,
        minImprovement: multiHop.minImprovement ?? 0.05,
        resultsPerHop: multiHop.resultsPerHop ?? 10,
      },
    );
  } else {
    // Standard single-hop search
    results = await manager.search(searchQuery, {
      maxResults: rerank.enabled ? (rerank.topK ?? 20) * 2 : 10,
    });
  }

  // Step 4: Re-ranking (if enabled)
  if (rerank.enabled && results.length > 0) {
    const reranked = rerankResults(query, results, {
      topK: rerank.topK,
      minScore: rerank.minScore,
    });

    // Convert reranked results back to MemorySearchResult format
    results = reranked.map((r) => ({
      path: r.path,
      startLine: r.startLine,
      endLine: r.endLine,
      score: r.rerankedScore,
      snippet: r.snippet,
      source: r.source,
    }));
  }

  return results;
}

/**
 * Search with query expansion only
 */
export async function searchWithExpansion(
  manager: MemoryIndexManager,
  query: string,
  maxTerms: number = 3,
): Promise<MemorySearchResult[]> {
  return enhancedSearch(manager, query, {
    expansion: { enabled: true, maxTerms },
  });
}

/**
 * Search with re-ranking only
 */
export async function searchWithReranking(
  manager: MemoryIndexManager,
  query: string,
  topK: number = 20,
  minScore: number = 0.25,
): Promise<MemorySearchResult[]> {
  return enhancedSearch(manager, query, {
    rerank: { enabled: true, topK, minScore },
  });
}

/**
 * Search with multi-hop retrieval only
 */
export async function searchWithMultiHop(
  manager: MemoryIndexManager,
  query: string,
  maxHops: number = 2,
): Promise<MemorySearchResult[]> {
  return enhancedSearch(manager, query, {
    multiHop: { enabled: true, maxHops },
  });
}

/**
 * Search with context awareness only
 */
export async function searchWithContext(
  manager: MemoryIndexManager,
  query: string,
  context: ConversationContext,
): Promise<MemorySearchResult[]> {
  return enhancedSearch(manager, query, {
    contextAware: { enabled: true, context },
  });
}
