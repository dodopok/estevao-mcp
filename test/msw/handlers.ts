import { http, HttpResponse } from "msw";
import calendarDay from "../fixtures/calendar-day.json" with { type: "json" };
import lectionaryDay from "../fixtures/lectionary-day.json" with { type: "json" };
import dailyOffice from "../fixtures/daily-office.json" with { type: "json" };
import prayerBooks from "../fixtures/prayer-books.json" with { type: "json" };
import celebrationsSearch from "../fixtures/celebrations-search.json" with { type: "json" };

export const BASE_URL = "https://api.test";

export const handlers = [
  http.get(`${BASE_URL}/api/v1/calendar/:year/:month/:day`, () => HttpResponse.json(calendarDay)),
  http.get(`${BASE_URL}/api/v1/lectionary/:year/:month/:day`, () => HttpResponse.json(lectionaryDay)),
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
  http.get(`${BASE_URL}/api/v1/celebrations/search`, () => HttpResponse.json(celebrationsSearch)),
  http.get(`${BASE_URL}/api/v1/prayer_books`, () => HttpResponse.json(prayerBooks)),
  http.get(`${BASE_URL}/api/v1/bible_versions`, () =>
    HttpResponse.json({ data: [{ code: "NVI", name: "Nova Versão Internacional", language: "pt-BR" }] }),
  ),
];
