import { LRUCache } from "lru-cache";

const DAY_MS = 24 * 60 * 60 * 1000;
export const TTL_IMMUTABLE = 7 * DAY_MS; // date-scoped liturgical data never changes
export const TTL_METADATA = DAY_MS; // prayer books / bible versions

const store = new LRUCache<string, object>({
  max: 500,
  maxSize: 50 * 1024 * 1024,
  sizeCalculation: (value) => JSON.stringify(value).length,
});

/** Cache the *normalized* result of fn under key. Errors are never cached. */
export async function cached<T extends object>(
  key: string,
  ttl: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = store.get(key) as T | undefined;
  if (hit !== undefined) return hit;
  const value = await fn();
  store.set(key, value, { ttl });
  return value;
}

export function clearCache(): void {
  store.clear();
}
