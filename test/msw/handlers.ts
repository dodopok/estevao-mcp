import { http, HttpResponse } from "msw";
import calendarDay from "../fixtures/calendar-day.json" with { type: "json" };
import lectionaryDay from "../fixtures/lectionary-day.json" with { type: "json" };
import dailyOffice from "../fixtures/daily-office.json" with { type: "json" };
import prayerBooks from "../fixtures/prayer-books.json" with { type: "json" };
import celebrationsSearch from "../fixtures/celebrations-search.json" with { type: "json" };

export const BASE_URL = "https://api.test";

const celebrationDetail = {
  celebracao: {
    id: 42,
    nome: "Dia de Pentecostes",
    nome_latino: "Dies Pentecostes",
    tipo: "principal_feast",
    tipo_nome: "Festa Principal",
    rank: 1,
    data_fixa: null,
    movel: true,
    cor_liturgica: "vermelho",
    descricao: "Quinquagésimo dia após a Páscoa.",
    pode_ser_transferida: false,
    regras_transferencia: null,
    regra_calculo: "easter + 49",
    coletas: [{ texto: "Ó Deus, que neste dia..." }],
    leituras: [{ ciclo: "C", primeira_leitura: "Atos 2.1-21", salmo: "Salmo 104", evangelho: "João 14.8-17" }],
  },
};

const celebrationTypes = {
  tipos: [
    { valor: "principal_feast", nome: "Festa Principal", descricao: "Prevalece sobre tudo" },
    { valor: "festival", nome: "Festival", descricao: "Festas menores" },
  ],
};

const monthDays = [
  { date: "2026-07-01", color: "verde", celebration_name: null, week_name: "5ª Semana após Pentecostes" },
  { date: "2026-07-14", color: "verde", celebration_name: null, week_name: "7ª Semana após Pentecostes" },
  { date: "2026-07-25", color: "vermelho", celebration_name: "São Tiago, Apóstolo", week_name: null },
];

const yearOverview = {
  year: 2026,
  seasons: [{ name: "Advento", start: "2025-11-30", end: "2025-12-24" }],
  movable_dates: { easter: "2026-04-05", pentecost: "2026-05-24" },
};

const keyDates = { easter: "2026-04-05", pentecost: "2026-05-24", advent: "2026-11-29" };

const cycleInfo = {
  ano: 2026,
  ciclo_dominical: "C",
  ciclo_semanal: "2",
  descricao: { dominical: "Ano C - Lucas", semanal: "Ano 2" },
};

export const handlers = [
  // calendar — specific paths must precede the generic :year/:month
  http.get(`${BASE_URL}/api/v1/calendar/:year/overview`, () => HttpResponse.json(yearOverview)),
  http.get(`${BASE_URL}/api/v1/calendar/:year/seasons`, () => HttpResponse.json(yearOverview.seasons)),
  http.get(`${BASE_URL}/api/v1/calendar/:year/key_dates`, () => HttpResponse.json(keyDates)),
  http.get(`${BASE_URL}/api/v1/calendar/:year/celebrations`, () => HttpResponse.json(celebrationsSearch)),
  http.get(`${BASE_URL}/api/v1/calendar/:year/:month/:day`, () => HttpResponse.json(calendarDay)),
  http.get(`${BASE_URL}/api/v1/calendar/:year/:month`, () => HttpResponse.json(monthDays)),

  // lectionary
  http.get(`${BASE_URL}/api/v1/lectionary/cycle/:year`, () => HttpResponse.json(cycleInfo)),
  http.get(`${BASE_URL}/api/v1/lectionary/:year/:month/:day`, () => HttpResponse.json(lectionaryDay)),

  // daily office (loc_1549/loc_2019 simulate the premium gate)
  http.get(`${BASE_URL}/api/v1/daily_office/:year/:month/:day/:office`, ({ request }) => {
    const url = new URL(request.url);
    const book = url.searchParams.get("preferences[prayer_book_code]");
    if (book === "loc_1549" || book === "loc_2019") {
      return HttpResponse.json(
        { error: { code: "PREMIUM_REQUIRED", message: "Premium subscription required" } },
        { status: 403 },
      );
    }
    return HttpResponse.json(dailyOffice);
  }),

  // celebrations — specific paths before :id
  http.get(`${BASE_URL}/api/v1/celebrations/search`, () => HttpResponse.json(celebrationsSearch)),
  http.get(`${BASE_URL}/api/v1/celebrations/types`, () => HttpResponse.json(celebrationTypes)),
  http.get(`${BASE_URL}/api/v1/celebrations/date/:month/:day`, () => HttpResponse.json(celebrationsSearch)),
  http.get(`${BASE_URL}/api/v1/celebrations/:id`, () => HttpResponse.json(celebrationDetail)),
  http.get(`${BASE_URL}/api/v1/celebrations`, () => HttpResponse.json(celebrationsSearch)),

  // metadata
  http.get(`${BASE_URL}/api/v1/prayer_books`, () => HttpResponse.json(prayerBooks)),
  http.get(`${BASE_URL}/api/v1/bible_versions`, () =>
    HttpResponse.json({ data: [{ code: "NVI", name: "Nova Versão Internacional", language: "pt-BR" }] }),
  ),
];
