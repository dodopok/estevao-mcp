---
name: anglican-liturgy
description: Answer questions about the Anglican liturgical calendar, lectionary readings, collects, saints and holy days, liturgical seasons and colours, and assemble the Daily Office (Morning Prayer, Evening Prayer, Compline) from the Book of Common Prayer or the Livro de Oração Comum, using the Estêvão tools. Use whenever someone asks what is celebrated on a date, which readings or psalms are appointed, what colour or season it is, why a feast was transferred, how two prayer books differ, or wants an office or a liturgy sheet (boletim) — in Portuguese ("leituras do domingo", "Ofício Diário", "Completas", "cor litúrgica", "LOC"), English or Spanish.
---

# Anglican liturgy with Estêvão

The Estêvão tools return liturgical data computed by a calendar engine: precedence between
celebrations, transfers, lectionary cycles and the assembled text of each office, for more than
twenty editions of the Book of Common Prayer and the Livro de Oração Comum. Answer from what the
tools return, not from general knowledge: calendars differ between provinces and editions, and a
date that looks obvious (a saint's day, a colour) is often resolved differently by precedence.

All tools are read-only except `set_default_prayer_book`, which saves the user's own prayer book.

## Settle the prayer book once, at the start

Every answer depends on the prayer book, and there is no safe default: two books can keep
different saints, readings and colours on the same day. So the first step of a conversation is
to know which book the person follows.

1. If they named a book, a church or a province, call `list_prayer_books` and use the matching
   code. Do not guess codes: editions are added upstream, and the list is the only source.
2. If they did not, ask which prayer book or church they follow before calling any date-based
   tool. Ask openly rather than offering a fixed short list, since the catalogue is long and
   growing. If they are unsure, call `list_prayer_books` (with `language` set to theirs) and show
   the editions in their language.
3. If `set_default_prayer_book` is available, save their answer with it, so later conversations
   use the book without asking. Tell them it was saved and that they can change it any time.
4. From then on, pass that `prayer_book` on every call in the conversation without asking again.
5. If they ask about another book for one question ("and in the 1662?"), use it for that question
   only, then go back to their book. Switch for good only when they say so, and then save the new
   one with `set_default_prayer_book` (or remove it with `null` if they ask).

If the server's instructions say the user already saved a book, use it without asking.

If a tool answers with `prayerBookRequired: true` instead of data, no book was passed: ask the
person, using the list it returns, and call again with their choice.

Some editions are premium-only through the API. If a tool returns that error, tell the person and
offer an edition that is available.

## Pick the tool

| The person asks | Call |
|---|---|
| What is celebrated, the season, the colour, the collect for a date | `get_liturgical_day` |
| The readings or psalm for a date or service | `get_readings` (`all_services: true` for every service) |
| Morning Prayer, Midday, Evening Prayer or Compline, in full | `get_daily_office` |
| A month at a glance | `get_calendar_month` |
| When Easter, Pentecost or Advent fall in a year; the seasons of a year | `get_year_overview` |
| Which Sunday (A/B/C) or weekday (1/2) cycle a year uses | `get_lectionary_cycle` |
| When a saint or feast is kept, or details about one celebration | `search_celebrations`, then `get_celebration` |
| A list of feasts of one kind, or fixed versus movable | `list_celebrations` |
| **Why** this celebration, colour, transfer or reading | `explain_liturgical_day` |
| How two to four books treat the same day or office | `compare_prayer_books` |
| Which options a book accepts (psalter, psalm cycle, canticles) | `get_prayer_book_preferences` |

For any "why" question, call `explain_liturgical_day` and answer from its decision trail rather
than reasoning about precedence yourself.

## Dates

Tools accept `YYYY-MM-DD`, `today` or `next-sunday`. For anything else ("this Saturday", "next
Christmas", "Ash Wednesday 2027"), work out the date and pass it as `YYYY-MM-DD`; for a movable
feast, find the date with `get_year_overview` or `search_celebrations` first.

## Preferences

`get_liturgical_day`, `get_readings` and `get_daily_office` take a `preferences` object (for
example the Coverdale psalter on the English books, or a monthly psalm cycle). The accepted keys
differ per book: call `get_prayer_book_preferences` for that book before passing any.

## Reproduce liturgical text faithfully

- Quote collects, psalms, canticles, readings and office text exactly as returned. Do not
  paraphrase, shorten, modernise or merge texts.
- Keep the text in the prayer book's own language. Translate only when asked, and label the
  result as your translation, not as text from the book.
- When the person asks for something of your own around the liturgy (a summary, a reflection,
  notes for a sermon), keep it visibly separate from the text that came from the prayer book.
- For a printable sheet, fetch the office with `format: "structured"` so rubrics and responses
  can be styled; for reading on screen, the default markdown is fine.

## When something fails

- **Rate limit**: the API allows a limited number of requests per minute and per day. Tell the
  person and suggest trying again later; do not retry in a loop.
- **Sign-in or key errors**: the connection signs in with the person's account on the Estêvão
  developer portal. If sign-in reports that the key limit was reached, the person can revoke an
  unused key at https://estevao.caminhoanglicano.com.br/dashboard/keys and connect again.
- **Office not available**: not every book has every office. Check `list_prayer_books` for the
  offices of that book.
