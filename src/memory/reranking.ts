/**
 * Re-ranking: Improve search result ordering using cross-encoders
 * 
 * Re-ranks initial search results using a more sophisticated scoring
 * model (cross-encoder) that considers query-document pairs together.
 */

import type { MemorySearchResult } from "./manager.js";

export interface RerankOptions {
  /** Maximum number of results to re-rank */
  topK?: number;
  /** Minimum score threshold after re-ranking */
  minScore?: number;
}

export interface RerankedResult extends MemorySearchResult {
  /** Original score before re-ranking */
  originalScore: number;
  /** Re-ranked score */
  rerankedScore: number;
}

/**
 * Simple re-ranking using query-document similarity heuristics
 * 
 * This is a basic implementation. For production, consider:
 * - Using a proper cross-encoder model (e.g., cross-encoder/ms-marco-MiniLM-L-6-v2)
 * - Using sentence-transformers for semantic matching
 * - Using BM25+ for better keyword matching
 */
export function rerankResults(
  query: string,
  results: MemorySearchResult[],
  options: RerankOptions = {},
): RerankedResult[] {
  const topK = options.topK ?? results.length;
  const minScore = options.minScore ?? 0;

  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter((t) => t.length > 2);

  const reranked = results.slice(0, topK).map((result) => {
    const snippetLower = result.snippet.toLowerCase();
    const textLower = (result.snippet + " " + result.path).toLowerCase();

    // Calculate term overlap score
    let termOverlap = 0;
    for (const term of queryTerms) {
      if (textLower.includes(term)) {
        termOverlap += 1;
      }
    }
    const termOverlapScore = queryTerms.length > 0 ? termOverlap / queryTerms.length : 0;

    // Calculate exact phrase match bonus
    const exactMatch = textLower.includes(queryLower) ? 0.2 : 0;

    // Calculate position bonus (earlier in snippet = better)
    const snippetIndex = snippetLower.indexOf(queryLower);
    const positionBonus = snippetIndex >= 0 ? Math.max(0, 0.1 * (1 - snippetIndex / 100)) : 0;

    // Calculate path relevance (entity names, etc.)
    const pathTerms = result.path.toLowerCase().split(/[/._-]/);
    const pathOverlap = queryTerms.filter((term) => pathTerms.some((pt) => pt.includes(term))).length;
    const pathBonus = queryTerms.length > 0 ? (pathOverlap / queryTerms.length) * 0.1 : 0;

    // Combine scores
    const rerankedScore = Math.min(
      1.0,
      result.score * 0.6 + // Original score weight
        termOverlapScore * 0.2 + // Term overlap
        exactMatch + // Exact phrase match
        positionBonus + // Position bonus
        pathBonus, // Path relevance
    );

    return {
      ...result,
      originalScore: result.score,
      rerankedScore,
    };
  });

  // Sort by re-ranked score
  reranked.sort((a, b) => b.rerankedScore - a.rerankedScore);

  // Update score to re-ranked score and filter by min score
  return reranked
    .filter((r) => r.rerankedScore >= minScore)
    .map((r) => ({
      ...r,
      score: r.rerankedScore,
    }));
}

/**
 * Re-rank using cross-encoder model (placeholder for future implementation)
 * 
 * This would use a proper cross-encoder model like:
 * - cross-encoder/ms-marco-MiniLM-L-6-v2
 * - sentence-transformers cross-encoder
 * 
 * For now, falls back to heuristic re-ranking.
 */
export async function rerankWithCrossEncoder(
  query: string,
  results: MemorySearchResult[],
  options: RerankOptions = {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  crossEncoderModel?: (query: string, document: string) => Promise<number>,
): Promise<RerankedResult[]> {
  // TODO: Implement cross-encoder re-ranking
  // For now, fall back to heuristic re-ranking
  return rerankResults(query, results, options);
}

/**
 * Re-rank using multiple signals (ensemble)
 */
export function rerankEnsemble(
  query: string,
  results: MemorySearchResult[],
  options: RerankOptions = {},
): RerankedResult[] {
  // Use heuristic re-ranking for now
  // In the future, this could combine multiple re-ranking methods
  return rerankResults(query, results, options);
}
