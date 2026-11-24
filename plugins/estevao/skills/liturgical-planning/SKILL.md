---
name: liturgical-planning
description: Plan a stretch of the Anglican liturgical calendar with the Estevão tools (the next Sundays, a season such as Advent or Lent, a month or a whole year) as a table of dates, celebrations, liturgical colours and lectionary readings, and export it as CSV for a spreadsheet or as an .ics file for Google Calendar, Outlook or Apple Calendar. Use for parish planning such as readers' rotas, altar guild and vestment colours, music planning and notice boards. Triggers include "escala de leitores", "calendário do Advento", "cores dos paramentos", "planejar os próximos domingos", "exportar para o Google Agenda", "plan the Sundays of Lent", "rota for readers", "calendario litúrgico de Cuaresma".
---

# Planning with the liturgical calendar

The person wants an overview of many dates at once, usually to organise people and things around
them. Build it from the Estevão tools only: colours, celebrations and readings differ between
prayer books and between years, so nothing here should come from memory.

## 1. Settle the prayer book

Use the book the person follows, as the `anglican-liturgy` skill describes: the one they name,
the one saved to their account, or ask. Pass it as `prayer_book` on every call. Say in the
result which book the plan follows.

## 2. Work out the dates

- **Next N Sundays**: count the Sundays from today and pass each as `YYYY-MM-DD`.
- **A month**: `get_calendar_month` returns every day of it.
- **A season** (Advent, Christmas, Lent, Easter…) or a whole year: call `get_year_overview` with
  `include: ["seasons", "key_dates"]` and take the season's start and end dates from it. A
  liturgical year begins in Advent, so a season that starts late in a civil year can appear
  in the next year's overview; if it is missing, look at the adjacent year.
- **Only feasts of a kind** (principal feasts, holy days): `list_celebrations` with `year` and
  `type`.

## 3. Gather the data, cheaply

- Colour, celebration and week name for **every day**: one `get_calendar_month` call per month.
  Do not call `get_liturgical_day` day by day for this.
- **Readings**: one `get_readings` call per date that needs them, usually Sundays and principal
  feasts. Readings come back as references (with an alternative when the lectionary offers
  one), not as Bible text.
- Before more than about 15 reading calls, tell the person and offer to limit the plan to
  Sundays and principal feasts.

## 4. Present the plan

A table, one row per date:

| Date | Day | Sunday or celebration | Colour | First reading | Psalm | Second reading | Gospel |
|---|---|---|---|---|---|---|---|

- Write dates the way the person does (`06/12/2026` in Portuguese, for example).
- Keep celebration names, week names and colours in the words the tool returns. They are in the
  prayer book's language.
- Where a day has both a Sunday name and a saint (for example "2º Domingo do Advento" and
  "Nicolau"), show both, as the tool returns them.
- For a rota, add empty columns with the roles the person names (reader, acolyte, organist,
  flowers…). Never fill in people's names they did not give you.
- Mention the lectionary year (A, B or C) when `get_readings` returns `cycle`.

## 5. Export, when asked

**CSV** (spreadsheets):
- UTF-8, one header row, the same columns as the table.
- Quote every field that contains a comma, a quote or a line break, doubling inner quotes.
- For Excel set to Portuguese, separate fields with `;` and start the file with a UTF-8 byte
  order mark, so columns split and accents show correctly. Google Sheets and LibreOffice read
  the comma version.

**.ics** (calendar apps): use the bundled script, which handles the format's escaping, line
folding and stable event IDs.

1. Write a JSON list with one object per date:
   ```json
   [{"date": "2026-12-06",
     "title": "2º Domingo do Advento (violeta)",
     "description": "Cor: violeta\nCelebração: Nicolau\n1ª leitura: Isaías 40:1-11\nSalmo: Salmo 85:1-2, 8-13\n2ª leitura: 2 Pedro 3:8-15a\nEvangelho: Marcos 1:1-8\nLivro: loc_2027 · Ano B"}]
   ```
   Put the colour in the title when the plan is for vestments or the altar guild. Put the
   readings and the prayer book in the description.
2. Run `python3 scripts/make_ics.py events.json calendario.ics --name "Advento 2026"` from this
   skill's directory.
3. Give the person the file. Each date becomes an all-day event. Importing the same file again
   updates the events instead of duplicating them.

If scripts cannot run here, write the file by hand with the same rules:
- CRLF line endings;
- one all-day `VEVENT` per date with `DTSTART;VALUE=DATE` and `DTEND` set to the next day;
- `\,`, `\;` and `\n` escaped in text;
- lines longer than 75 bytes folded with a leading space.

## Keep it factual

The plan holds what the tools returned. Do not add themes, sermon titles, hymn suggestions or
reflections unless the person asks for them, and then keep them in a separate column, marked
as yours.
