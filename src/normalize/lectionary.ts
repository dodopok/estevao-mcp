import type { LectionaryDay, Reading, Readings } from "./types.js";

type Raw = Record<string, unknown>;

/** Upstream lectionary responses use Portuguese keys — map them to the canonical English contract. */
export function normalizeLectionaryDay(raw: unknown, prayerBook: string): LectionaryDay {
  const day = raw as Raw;
  const leituras = (day.leituras ?? {}) as Raw;
  return {
    date: String(day.data ?? ""),
    dayOfWeek: day.dia_da_semana as string | undefined,
    cycle: day.ciclo as string | undefined,
    readings: normalizeReadings(leituras),
    prayerBook,
  };
}

export function normalizeReadings(leituras: Raw): Readings {
  return {
    first: normalizeReading(leituras.primeira_leitura),
    psalm: normalizeReading(leituras.salmo),
    second: normalizeReading(leituras.segunda_leitura),
    gospel: normalizeReading(leituras.evangelho),
  };
}

function normalizeReading(raw: unknown): Reading | undefined {
  if (raw == null) return undefined;
  const reading = raw as Raw;
  const reference = reading.reference;
  if (reference == null) return undefined;
  return {
    reference: String(reference),
    alternative: reading.alternative_reference ? String(reading.alternative_reference) : undefined,
  };
}
