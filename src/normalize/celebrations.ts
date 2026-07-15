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

export interface CelebrationDetail extends CelebrationSummary {
  description?: string;
  canBeTransferred?: boolean;
  transferRules?: unknown;
  calculationRule?: unknown;
  collects?: unknown;
  readings?: unknown;
}

/** Normalize the `/celebrations/:id` show response (`{ celebracao: {...} }`). */
export function normalizeCelebrationDetail(raw: unknown): CelebrationDetail {
  const body = raw as Raw;
  const celebracao = (body.celebracao ?? body) as Raw;
  return {
    ...normalizeCelebration(celebracao),
    description: celebracao.descricao as string | undefined,
    canBeTransferred: celebracao.pode_ser_transferida as boolean | undefined,
    transferRules: celebracao.regras_transferencia,
    calculationRule: celebracao.regra_calculo,
    collects: celebracao.coletas,
    readings: celebracao.leituras,
  };
}

export interface CelebrationType {
  value: string;
  name: string;
  description?: string;
}

/** Normalize `/celebrations/types` (`{ tipos: [{ valor, nome, descricao }] }`). */
export function normalizeCelebrationTypes(raw: unknown): CelebrationType[] {
  const tipos = ((raw as Raw).tipos ?? []) as Raw[];
  return tipos.map((tipo) => ({
    value: String(tipo.valor ?? ""),
    name: String(tipo.nome ?? ""),
    description: tipo.descricao as string | undefined,
  }));
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
