export function canonicalize(obj: Record<string, any>): string {
  const sorted: Record<string, any> = {};
  const keys = Object.keys(obj).sort();
  for (const k of keys) {
    sorted[k] = obj[k];
  }
  return JSON.stringify(sorted);
}
