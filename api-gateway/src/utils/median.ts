/**
 * Median of a non-empty numeric array. For an even count, returns the mean of the
 * two central values. Throws on an empty array (callers must guarantee >=1 sample).
 */
export function median(values: number[]): number {
  if (values.length === 0) throw new Error("median() requires at least one value");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
