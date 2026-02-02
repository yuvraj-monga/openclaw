/**
 * Temporal Queries: Query facts and entities by time ranges
 * 
 * Provides functions for querying memory with temporal filters,
 * supporting "since", "until", and "between" queries.
 */

import type { Fact, EntityPage, EntityQueryOptions } from "./entity-types.js";

export interface TemporalQuery {
  /** Start timestamp (inclusive) */
  since?: number;
  /** End timestamp (inclusive) */
  until?: number;
  /** Specific date range */
  dateRange?: {
    start: number;
    end?: number;
  };
}

/**
 * Check if a fact matches temporal query
 */
export function factMatchesTemporalQuery(fact: Fact, query: TemporalQuery): boolean {
  // Get fact timestamp (prefer dateRange.start, fallback to timestamp)
  const factTime = fact.dateRange?.start || fact.timestamp;

  // Check since
  if (query.since !== undefined && factTime < query.since) {
    return false;
  }

  // Check until
  if (query.until !== undefined && factTime > query.until) {
    return false;
  }

  // Check date range
  if (query.dateRange) {
    const { start, end } = query.dateRange;
    if (factTime < start) {
      return false;
    }
    if (end !== undefined && factTime > end) {
      return false;
    }
  }

  return true;
}

/**
 * Filter facts by temporal query
 */
export function filterFactsByTemporalQuery(facts: Fact[], query: TemporalQuery): Fact[] {
  return facts.filter((fact) => factMatchesTemporalQuery(fact, query));
}

/**
 * Filter entity facts by temporal query
 */
export function filterEntityFactsByTemporalQuery(
  entity: EntityPage,
  query: TemporalQuery,
): Fact[] {
  return filterFactsByTemporalQuery(entity.facts, query);
}

/**
 * Convert EntityQueryOptions to TemporalQuery
 */
export function entityQueryOptionsToTemporalQuery(
  options: EntityQueryOptions,
): TemporalQuery | null {
  if (!options.since && !options.until) {
    return null;
  }

  return {
    since: options.since?.getTime(),
    until: options.until?.getTime(),
  };
}

/**
 * Query facts since a date
 */
export function queryFactsSince(facts: Fact[], since: Date): Fact[] {
  return filterFactsByTemporalQuery(facts, { since: since.getTime() });
}

/**
 * Query facts until a date
 */
export function queryFactsUntil(facts: Fact[], until: Date): Fact[] {
  return filterFactsByTemporalQuery(facts, { until: until.getTime() });
}

/**
 * Query facts between two dates
 */
export function queryFactsBetween(facts: Fact[], start: Date, end: Date): Fact[] {
  return filterFactsByTemporalQuery(facts, {
    since: start.getTime(),
    until: end.getTime(),
  });
}

/**
 * Get facts for a specific date range
 */
export function queryFactsInDateRange(
  facts: Fact[],
  startDate: Date,
  endDate?: Date,
): Fact[] {
  return filterFactsByTemporalQuery(facts, {
    dateRange: {
      start: startDate.getTime(),
      end: endDate?.getTime(),
    },
  });
}

/**
 * Get most recent facts
 */
export function getMostRecentFacts(facts: Fact[], limit: number = 10): Fact[] {
  return [...facts]
    .sort((a, b) => {
      const timeA = a.dateRange?.start || a.timestamp;
      const timeB = b.dateRange?.start || b.timestamp;
      return timeB - timeA;
    })
    .slice(0, limit);
}

/**
 * Get facts by date (grouped by day)
 */
export function groupFactsByDate(facts: Fact[]): Map<string, Fact[]> {
  const grouped = new Map<string, Fact[]>();

  for (const fact of facts) {
    const factTime = fact.dateRange?.start || fact.timestamp;
    const date = new Date(factTime);
    const dateKey = date.toISOString().split("T")[0]; // YYYY-MM-DD

    const existing = grouped.get(dateKey) || [];
    existing.push(fact);
    grouped.set(dateKey, existing);
  }

  return grouped;
}

/**
 * Get facts for a specific day
 */
export function getFactsForDay(facts: Fact[], date: Date): Fact[] {
  const dateKey = date.toISOString().split("T")[0];
  const grouped = groupFactsByDate(facts);
  return grouped.get(dateKey) || [];
}

/**
 * Get facts for a date range (grouped by day)
 */
export function getFactsForDateRange(
  facts: Fact[],
  startDate: Date,
  endDate: Date,
): Map<string, Fact[]> {
  const filtered = queryFactsBetween(facts, startDate, endDate);
  return groupFactsByDate(filtered);
}
