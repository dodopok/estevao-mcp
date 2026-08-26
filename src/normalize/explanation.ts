type Raw = Record<string, unknown>;

/**
 * The API already returns a curated decision trail, so this keeps its shape and only
 * drops envelope noise and empty branches — an explanation is most useful verbatim.
 */
export function normalizeExplanation(raw: unknown): Raw {
  const body = raw as { data?: Raw };
  return prune(body.data ?? (raw as Raw));
}

function prune(value: unknown): Raw {
  const out: Raw = {};
  for (const [key, raw] of Object.entries((value ?? {}) as Raw)) {
    // Prune first: a branch whose every field is empty is itself noise.
    const cleaned = clean(raw);
    if (!isEmpty(cleaned)) out[key] = cleaned;
  }
  return out;
}

function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.filter((item) => !isEmpty(item)).map(clean);
  if (value && typeof value === "object") return prune(value);
  return value;
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as Raw).length === 0;
  return false;
}
