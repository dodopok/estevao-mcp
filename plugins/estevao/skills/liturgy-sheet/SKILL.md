---
name: liturgy-sheet
description: Build a print-ready liturgy sheet (folheto, boletim, order of service, service leaflet) from the Estevão tools. It covers the full Daily Office of a day (Morning Prayer, Midday, Evening Prayer or Compline) or the readings of a Sunday or feast, with a header (date, celebration, season, liturgical colour), rubrics set apart, the congregation's parts in bold and psalms with their pointing, as a Word document, a PDF or printable HTML. The prayer book's text is reproduced exactly. Use when someone asks for "folheto", "boletim", "liturgia impressa", "programa do culto", "imprimir as Completas", "service sheet", "order of service" or "folleto de la liturgia".
---

# Liturgy sheets

A liturgy sheet puts the prayer book's text in the hands of a congregation. The text must be
the book's, word for word. Everything else on the page is layout.

## 1. Settle the prayer book and what goes on the sheet

- Use the book the person follows, as the `anglican-liturgy` skill describes, and pass it as
  `prayer_book` on every call.
- Ask, if it is not clear:
  - which office, or whether it is the readings of a Sunday or feast;
  - the date;
  - the paper: A4, Letter, or A5 folded as a booklet;
  - the format: Word, PDF or HTML.
- Offices exist per book. If the office is not in the book's `availableOffices`
  (`list_prayer_books`), say so and offer the ones that are.

## 2. Fetch

- **The office**: `get_daily_office` with `format: "structured"`. Each module has a name and
  lines, and each line has a `type`.
- **The header**: `get_liturgical_day` for the same date and book gives the celebration, season,
  colour and collect.
- **A readings sheet**: `get_readings` gives references only, not Bible text.
  - Print the references.
  - If the person wants the full passages, ask them to paste the text from the Bible translation
    their church uses.
  - Never write Bible text from memory. Translations differ and may be under copyright.
- **Options**: if the person wants options the book allows, such as another psalter or canticle,
  call `get_prayer_book_preferences` first and pass `preferences`.

## 3. Lay out each line by its type

| `type` | On the sheet |
|---|---|
| `heading`, `subheading`, `subtitle` | Headings at their level |
| `rubric` | Italic and smaller; red if the sheet is printed in colour (rubrics are traditionally red) |
| `text`, `leader`, `reader`, `reading_text` | Body text |
| `congregation`, `all` | Bold: said by everyone |
| `responsive` | Versicle and response; the response is already marked in bold |
| `citation` | Small, right-aligned, after the passage |
| `spacer` | Vertical space |

- Inside `content`, `**…**` marks what the congregation says. Keep it bold.
- Keep line breaks as they are.
- In psalms and canticles, keep the `*` that marks the half-verse and the indentation of the
  second half: they guide chanting.
- Start each module with its `name` as a small heading, in the book's language.

The header carries:
- date, written out;
- name of the office;
- celebration or Sunday name;
- season and liturgical colour;
- prayer book.

The footer names the prayer book the text comes from.

## 4. Fit the page without touching the text

If the office is longer than the page:
- change the layout: two columns, a smaller font, narrower margins, or an A5 booklet;
- never shorten, summarise or paraphrase the text.

Where a rubric offers alternatives ("one or more of the following psalms"), you may print all of
them or the one the person chooses. Choosing among printed options is fine; writing new text is
not.

Do not add reflections, sermon notes, explanations or prayers of your own. If the person asks
for announcements or hymn numbers, put them in a clearly separate box, with their text.

## 5. Produce the file

- **Word or PDF**: if a document or PDF skill or tool is available, use it, applying the layout
  above.
- **Otherwise**, write one self-contained HTML file with print CSS that opens in any browser and
  prints cleanly:
  - `@page` with the chosen size and margins;
  - a serif body font;
  - rubrics in italic (and red, if chosen);
  - `break-inside: avoid` on short modules.

  Tell the person to print it from the browser, or to save it as PDF from the print dialog.

Name the file after the date and office, for example `2026-12-06-oracao-da-manha.docx`.
