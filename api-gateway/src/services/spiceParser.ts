/**
 * Spice tag parser (Slice 2).
 *
 * The smart model marks intimate fragments inline:
 *   {{SPICE style="..."}} ...fragment... {{/SPICE}}
 *
 * This module extracts those fragments to a side channel and returns the clean
 * SOFT prose with all spice markup removed. It is the contract boundary with a
 * stochastic model, so it is TOTAL: it never throws and never lets {{SPICE...}}
 * or {{/SPICE}} markup survive into the returned text.
 */

export interface SpiceRegion {
  /** The soft fragment text the model wrapped (used to re-locate at spice time). */
  text: string;
  /** Per-fragment style label from the tag (may be empty). */
  style: string;
}

const OPEN_RE = /\{\{\s*SPICE\b([^}]*)\}\}/i;
const CLOSE_RE = /\{\{\s*\/\s*SPICE\s*\}\}/i;
const ANY_MARKUP_RE = /\{\{\s*\/?\s*SPICE\b[^}]*\}\}/gi;

function parseStyle(attrs: string): string {
  const m = attrs.match(/style\s*=\s*"([^"]*)"/i);
  return m ? m[1].trim() : "";
}

/**
 * Extract well-formed (open…close) regions and return detagged soft prose.
 * Malformed or unclosed markup is stripped from the soft text and produces no
 * region. Nested opens are flattened (the outer region wins; inner markup is
 * scrubbed from both the region text and the soft text).
 */
export function extractSpiceRegions(raw: string): { soft: string; regions: SpiceRegion[] } {
  if (typeof raw !== "string" || raw.length === 0) {
    return { soft: typeof raw === "string" ? raw : "", regions: [] };
  }

  const regions: SpiceRegion[] = [];
  let soft = "";
  let rest = raw;

  // Greedy linear scan: find the next open, then its matching close.
  // Guard the loop with a hard iteration cap so malformed input can never spin.
  let guard = 0;
  while (guard++ < 10000) {
    const open = rest.match(OPEN_RE);
    if (!open || open.index === undefined) break;

    // Text before the open tag is clean soft prose.
    soft += rest.slice(0, open.index);
    const afterOpen = rest.slice(open.index + open[0].length);

    const close = afterOpen.match(CLOSE_RE);
    if (!close || close.index === undefined) {
      // Unclosed open: drop the open tag, keep the trailing text as soft, stop.
      rest = afterOpen;
      break;
    }

    // Inner fragment text, with any nested SPICE markup scrubbed.
    const innerRaw = afterOpen.slice(0, close.index);
    const inner = innerRaw.replace(ANY_MARKUP_RE, "").trim();
    if (inner.length > 0) {
      regions.push({ text: inner, style: parseStyle(open[1]) });
      soft += inner;
    }
    rest = afterOpen.slice(close.index + close[0].length);
  }

  soft += rest;
  // Final safety net: scrub any markup that survived (orphan closes, garbage).
  soft = soft.replace(ANY_MARKUP_RE, "");
  return { soft, regions };
}
