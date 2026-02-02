/**
 * Context-Aware Retrieval: Use conversation context to improve queries
 * 
 * Enhances search queries with context from the current conversation,
 * recent messages, and user intent to improve relevance.
 */

import type { MemorySearchResult } from "./manager.js";
import { expandQuery } from "./query-expansion.js";

export interface ConversationContext {
  /** Recent messages in the conversation */
  recentMessages?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  /** Current user intent or topic */
  intent?: string;
  /** Mentioned entities */
  entities?: string[];
  /** Current task or goal */
  task?: string;
}

export interface ContextualizedQuery {
  /** Original query */
  original: string;
  /** Context-enhanced query */
  contextualized: string;
  /** Context terms added */
  contextTerms: string[];
  /** Confidence in contextualization */
  confidence: number;
}

/**
 * Enhance query with conversation context
 */
export function contextualizeQuery(
  query: string,
  context: ConversationContext,
): ContextualizedQuery {
  const contextTerms: string[] = [];
  let contextualized = query;

  // Add intent if available
  if (context.intent) {
    contextTerms.push(context.intent);
    contextualized += ` ${context.intent}`;
  }

  // Extract keywords from recent messages
  if (context.recentMessages) {
    const recentKeywords = extractKeywords(context.recentMessages, 3);
    for (const keyword of recentKeywords) {
      if (!contextTerms.includes(keyword) && contextTerms.length < 5) {
        contextTerms.push(keyword);
        contextualized += ` ${keyword}`;
      }
    }
  }

  // Add mentioned entities
  if (context.entities && context.entities.length > 0) {
    for (const entity of context.entities.slice(0, 3)) {
      if (!contextTerms.includes(entity)) {
        contextTerms.push(entity);
        contextualized += ` ${entity}`;
      }
    }
  }

  // Add task context
  if (context.task) {
    const taskKeywords = context.task.split(/\s+/).filter((w) => w.length > 3).slice(0, 2);
    for (const keyword of taskKeywords) {
      if (!contextTerms.includes(keyword)) {
        contextTerms.push(keyword);
        contextualized += ` ${keyword}`;
      }
    }
  }

  // Calculate confidence (more context = potentially lower precision)
  const confidence = Math.max(0.5, 1.0 - contextTerms.length * 0.1);

  return {
    original: query,
    contextualized,
    contextTerms,
    confidence,
  };
}

/**
 * Extract keywords from recent messages
 */
function extractKeywords(
  messages: Array<{ role: string; content: string }>,
  maxKeywords: number,
): string[] {
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
    "i",
    "you",
    "he",
    "she",
    "it",
    "we",
    "they",
  ]);

  // Count terms from recent messages (weight user messages more)
  for (const message of messages.slice(-5)) {
    const weight = message.role === "user" ? 2 : 1;
    const words = message.content
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopWords.has(w));

    for (const word of words) {
      const cleaned = word.replace(/[^a-z0-9]/g, "");
      if (cleaned.length > 2) {
        termFreq.set(cleaned, (termFreq.get(cleaned) || 0) + weight);
      }
    }
  }

  // Return top keywords
  return Array.from(termFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([term]) => term);
}

/**
 * Perform context-aware search
 */
export async function contextAwareSearch(
  query: string,
  context: ConversationContext,
  searchFn: (q: string, limit: number) => Promise<MemorySearchResult[]>,
  limit: number = 10,
): Promise<MemorySearchResult[]> {
  // Contextualize query
  const contextualized = contextualizeQuery(query, context);

  // Perform search with contextualized query
  const results = await searchFn(contextualized.contextualized, limit * 2);

  // Boost results that match original query more
  const boosted = results.map((result) => {
    const snippetLower = result.snippet.toLowerCase();
    const queryLower = query.toLowerCase();
    const originalMatch = snippetLower.includes(queryLower) ? 0.1 : 0;

    return {
      ...result,
      score: Math.min(1.0, result.score + originalMatch),
    };
  });

  // Sort and return top results
  return boosted
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Extract entities from text (simple implementation)
 * 
 * In production, this could use NER models or entity extraction APIs.
 */
export function extractEntitiesSimple(text: string): string[] {
  const entities: string[] = [];

  // Look for capitalized words/phrases (simple heuristic)
  const words = text.split(/\s+/);
  let currentEntity: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i] || "";
    const cleaned = word.replace(/[^a-zA-Z0-9]/g, "");

    // Check if word starts with capital (potential entity)
    if (cleaned.length > 2 && /^[A-Z]/.test(cleaned)) {
      currentEntity.push(cleaned);
    } else {
      // End of potential entity
      if (currentEntity.length > 0) {
        const entity = currentEntity.join(" ");
        if (entity.length > 2 && !entities.includes(entity)) {
          entities.push(entity);
        }
        currentEntity = [];
      }
    }
  }

  // Add final entity if exists
  if (currentEntity.length > 0) {
    const entity = currentEntity.join(" ");
    if (entity.length > 2 && !entities.includes(entity)) {
      entities.push(entity);
    }
  }

  return entities.slice(0, 10); // Limit to 10 entities
}
