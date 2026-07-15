import type { CelebrationSearchResult, CelebrationSummary } from "./types.js";

type Raw = Record<string, unknown>;

/** Upstream celebration responses use Portuguese keys — map them to the canonical English contract. */
export function normalizeCelebrationSearch(raw: unknown, prayerBook: string): CelebrationSearchResult {
  const result = raw as Raw;
  const celebracoes = (result.celebracoes ?? []) as Raw[];
  return {
    total: Number(result.total ?? celebracoes.length),
    celebrations: celebracoes.map(normalizeCelebration),
    prayerBook,
  };
}

export function normalizeCelebration(raw: Raw): CelebrationSummary {
  const dataFixa = raw.data_fixa as Raw | null | undefined;
  return {
    id: raw.id as number | string,
    name: String(raw.nome ?? ""),
    latinName: (raw.nome_latino as string | null | undefined) ?? undefined,
    type: raw.tipo as string | undefined,
    typeName: raw.tipo_nome as string | undefined,
    rank: raw.rank as number | undefined,
    fixedDate: dataFixa ? { month: Number(dataFixa.mes), day: Number(dataFixa.dia) } : null,
    movable: raw.movel as boolean | undefined,
    color: raw.cor_liturgica as string | undefined,
  };
}
