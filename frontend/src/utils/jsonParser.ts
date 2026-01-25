/**
 * JSON parsing utilities for handling LLM output
 * Includes tolerant parsing and extraction from mixed text
 */

// Maximum input length for JSON parsing to prevent ReDoS attacks
export const MAX_JSON_INPUT_LENGTH = 1_000_000; // 1MB limit

/**
 * Tolerant JSON parser that handles common LLM output issues
 * Security: Input length is limited to prevent ReDoS attacks
 */
export function tolerantJsonParse(str: string): unknown | null {
  // Security: Reject excessively long inputs to prevent ReDoS
  if (!str || str.length > MAX_JSON_INPUT_LENGTH) {
    console.warn('[tolerantJsonParse] Input rejected: empty or exceeds max length');
    return null;
  }
  
  const trimmed = str.trim();
  
  // Try standard JSON.parse first (fastest path)
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue to tolerant parsing
  }
  
  // Try to fix common issues
  let fixed = trimmed;
  
  // Remove trailing commas before } or ]
  // Note: This regex is safe - linear time complexity
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
  
  // Replace Python-style booleans and None
  // Note: These regexes are safe - word boundary matching is O(n)
  fixed = fixed.replace(/\bTrue\b/g, 'true');
  fixed = fixed.replace(/\bFalse\b/g, 'false');
  fixed = fixed.replace(/\bNone\b/g, 'null');
  
  // Replace single quotes with double quotes (careful with apostrophes)
  // Only do this if there are no double quotes in the string
  if (!fixed.includes('"') && fixed.includes("'")) {
    fixed = fixed.replace(/'/g, '"');
  }
  
  try {
    return JSON.parse(fixed);
  } catch {
    // Continue
  }
  
  // Try to extract JSON from the string
  // Note: This regex could be slow on pathological inputs, but we've limited input size
  const jsonMatch = fixed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // Try with fixes on extracted JSON
      let extracted = jsonMatch[0];
      extracted = extracted.replace(/,(\s*[}\]])/g, '$1');
      extracted = extracted.replace(/\bTrue\b/g, 'true');
      extracted = extracted.replace(/\bFalse\b/g, 'false');
      extracted = extracted.replace(/\bNone\b/g, 'null');
      try {
        return JSON.parse(extracted);
      } catch {
        // Give up
      }
    }
  }
  
  return null;
}

/**
 * Extract JSON from a string by finding balanced brackets
 * Handles prefix/suffix text around JSON
 */
export function extractJsonFromString(content: string): string | null {
  // Try to find balanced JSON object or array
  const trimmed = content.trim();
  let startChar = '';
  let endChar = '';
  let startIdx = -1;
  
  // Find the first { or [
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '{') {
      startChar = '{';
      endChar = '}';
      startIdx = i;
      break;
    } else if (trimmed[i] === '[') {
      startChar = '[';
      endChar = ']';
      startIdx = i;
      break;
    }
  }
  
  if (startIdx === -1) return null;
  
  // Count brackets to find balanced end
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  
  for (let i = startIdx; i < trimmed.length; i++) {
    const char = trimmed[i];
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }
    
    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === startChar) depth++;
      else if (char === endChar) {
        depth--;
        if (depth === 0) {
          return trimmed.substring(startIdx, i + 1);
        }
      }
    }
  }
  
  return null; // Incomplete JSON
}
