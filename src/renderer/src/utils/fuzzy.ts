/**
 * Fuzzy search utility for matching projects, terminals, and commands.
 * Uses a simple but effective algorithm that scores based on:
 * - Character matches (case-insensitive)
 * - Consecutive matches
 * - Match positions (earlier = better)
 */

export interface FuzzyResult<T> {
  item: T;
  score: number;
  matches: number[];
}

/**
 * Performs fuzzy matching on a string against a query.
 * Returns a score and match positions, or null if no match.
 */
function fuzzyMatch(text: string, query: string): { score: number; matches: number[] } | null {
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  
  let queryIndex = 0;
  let score = 0;
  const matches: number[] = [];
  let consecutiveBonus = 0;

  for (let i = 0; i < text.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      matches.push(i);
      queryIndex++;
      
      // Score calculation
      // Bonus for matching at start of word
      if (i === 0 || text[i - 1] === ' ' || text[i - 1] === '-' || text[i - 1] === '_') {
        score += 15;
      }
      // Bonus for consecutive matches
      else if (matches.length > 1 && matches[matches.length - 2] === i - 1) {
        consecutiveBonus += 5;
        score += 5 + consecutiveBonus;
      } else {
        score += 1;
        consecutiveBonus = 0;
      }
      
      // Penalty for distance from start
      score -= Math.floor(i / 10);
    }
  }

  // No match if we didn't find all query characters
  if (queryIndex < queryLower.length) {
    return null;
  }

  // Bonus for exact match
  if (textLower === queryLower) {
    score += 100;
  }
  
  // Bonus for match at start
  if (matches[0] === 0) {
    score += 20;
  }

  return { score: Math.max(0, score), matches };
}

/**
 * Search through a list of items using fuzzy matching.
 */
export function fuzzySearch<T>(
  items: T[],
  query: string,
  getSearchableText: (item: T) => string | string[]
): FuzzyResult<T>[] {
  if (!query.trim()) {
    // Return all items with equal score when query is empty
    return items.map(item => ({
      item,
      score: 0,
      matches: []
    }));
  }

  const results: FuzzyResult<T>[] = [];

  for (const item of items) {
    const searchTexts = Array.isArray(getSearchableText(item)) 
      ? getSearchableText(item) as string[]
      : [getSearchableText(item) as string];
    
    let bestResult: { score: number; matches: number[] } | null = null;

    for (const text of searchTexts) {
      const result = fuzzyMatch(text, query);
      if (result && (!bestResult || result.score > bestResult.score)) {
        bestResult = result;
      }
    }

    if (bestResult) {
      results.push({
        item,
        score: bestResult.score,
        matches: bestResult.matches
      });
    }
  }

  // Sort by score descending
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Highlights matches in text for display.
 * Returns an array of text segments with match flags.
 */
export function highlightMatches(text: string, matches: number[]): Array<{ text: string; isMatch: boolean }> {
  if (matches.length === 0) {
    return [{ text, isMatch: false }];
  }

  const segments: Array<{ text: string; isMatch: boolean }> = [];
  let lastIndex = 0;

  // Sort matches and dedupe
  const sortedMatches = [...new Set(matches)].sort((a, b) => a - b);

  for (const matchIndex of sortedMatches) {
    // Add non-matching segment before this match
    if (matchIndex > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, matchIndex),
        isMatch: false
      });
    }
    
    // Check if this continues a previous match
    const prevSegment = segments[segments.length - 1];
    if (prevSegment?.isMatch && sortedMatches[sortedMatches.indexOf(matchIndex) - 1] === matchIndex - 1) {
      // Extend previous match
      prevSegment.text += text[matchIndex];
    } else {
      segments.push({
        text: text[matchIndex],
        isMatch: true
      });
    }
    
    lastIndex = matchIndex + 1;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      isMatch: false
    });
  }

  return segments;
}
