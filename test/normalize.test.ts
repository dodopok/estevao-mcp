import { describe, expect, it } from "vitest";
import { normalizeLectionaryDay } from "../src/normalize/lectionary.js";
import { normalizeCelebrationSearch } from "../src/normalize/celebrations.js";
import { normalizeDailyOffice } from "../src/normalize/dailyOffice.js";
import { normalizeLiturgicalDay } from "../src/normalize/calendar.js";
import { normalizePrayerBooks } from "../src/normalize/prayerBooks.js";
import { renderOfficeMarkdown } from "../src/format/markdown.js";
import lectionaryDay from "./fixtures/lectionary-day.json" with { type: "json" };
import celebrationsSearch from "./fixtures/celebrations-search.json" with { type: "json" };
import dailyOffice from "./fixtures/daily-office.json" with { type: "json" };
import calendarDay from "./fixtures/calendar-day.json" with { type: "json" };
import prayerBooks from "./fixtures/prayer-books.json" with { type: "json" };

describe("normalizeLectionaryDay", () => {
  it("maps Portuguese keys to the canonical English contract", () => {
    const day = normalizeLectionaryDay(lectionaryDay, "loc_2015");
    expect(day.date).toBe("2026-07-19");
    expect(day.cycle).toBe("C");
    expect(day.readings.first?.reference).toBe("Amós 8.1-12");
    expect(day.readings.first?.alternative).toBe("Gênesis 18.1-10a");
    expect(day.readings.psalm?.reference).toBe("Salmo 52");
    expect(day.readings.second?.reference).toBe("Colossenses 1.15-28");
    expect(day.readings.gospel?.reference).toBe("Lucas 10.38-42");
    expect(day.prayerBook).toBe("loc_2015");
  });
});

describe("normalizeCelebrationSearch", () => {
  it("maps celebracoes/tipo/cor_liturgica to English keys", () => {
    const result = normalizeCelebrationSearch(celebrationsSearch, "loc_2015");
    expect(result.total).toBe(1);
    const [pentecost] = result.celebrations;
    expect(pentecost.name).toBe("Dia de Pentecostes");
    expect(pentecost.latinName).toBe("Dies Pentecostes");
    expect(pentecost.type).toBe("principal_feast");
    expect(pentecost.movable).toBe(true);
    expect(pentecost.color).toBe("vermelho");
    expect(pentecost.fixedDate).toBeNull();
  });
});

describe("normalizeLiturgicalDay", () => {
  it("maps calendar day fields and drops empty celebration/saint objects", () => {
    const day = normalizeLiturgicalDay(calendarDay, "loc_2015");
    expect(day.date).toBe("2026-07-14");
    expect(day.season).toBe("Tempo Comum");
    expect(day.color).toBe("verde");
    expect(day.liturgicalYear).toBe("C");
    expect(day.celebration).toBeUndefined();
    expect(day.saint).toBeUndefined();
  });
});

describe("normalizeDailyOffice + renderOfficeMarkdown", () => {
  it("normalizes modules/lines and renders every line type", () => {
    const office = normalizeDailyOffice(dailyOffice, "loc_2015");
    expect(office.officeType).toBe("compline");
    expect(office.modules).toHaveLength(2);
    expect(office.modules[0].lines[0]).toEqual({
      content: "Completas",
      type: "heading",
      reference: undefined,
      verseNumber: undefined,
    });
    expect(office.language).toBe("pt-BR");

    // labels follow the office's own language (pt-BR here)
    const markdown = renderOfficeMarkdown(office);
    expect(markdown).toContain("# Completas — 2026-07-14");
    expect(markdown).toContain("**Tempo:** Tempo Comum");
    expect(markdown).toContain("### Completas");
    expect(markdown).toContain("*O oficiante inicia dizendo*");
    expect(markdown).toContain("#### Salmo 134");
    expect(markdown).toContain("**1** Bendizei ao Senhor");
    expect(markdown).toContain("**Glória ao Pai, e ao Filho, e ao Espírito Santo.**");
    expect(markdown).toContain("**Amém.**");
    expect(markdown).not.toContain("spacer");
  });

  it("renders labels in English or Spanish when the office language says so", () => {
    const office = normalizeDailyOffice(dailyOffice, "loc_2015");

    const en = renderOfficeMarkdown({ ...office, language: "en" });
    expect(en).toContain("# Compline — 2026-07-14");
    expect(en).toContain("**Season:** Tempo Comum");

    const es = renderOfficeMarkdown({ ...office, language: "es" });
    expect(es).toContain("# Completas — 2026-07-14");
    expect(es).toContain("**Tiempo:** Tempo Comum");

    // unknown office language → fallback param → English default
    const fallback = renderOfficeMarkdown({ ...office, language: undefined }, "pt-BR");
    expect(fallback).toContain("# Completas — 2026-07-14");
    expect(renderOfficeMarkdown({ ...office, language: undefined })).toContain("# Compline —");
  });
});

describe("normalizePrayerBooks", () => {
  it("maps premium_required to premium and keeps offices", () => {
    const books = normalizePrayerBooks(prayerBooks);
    expect(books).toHaveLength(2);
    expect(books[0].code).toBe("loc_2015");
    expect(books[0].premium).toBe(false);
    expect(books[0].availableOffices).toContain("compline");
    expect(books[1].code).toBe("loc_1549");
    expect(books[1].premium).toBe(true);
  });
});
