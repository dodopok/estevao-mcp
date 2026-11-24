---
name: pray-the-office
description: Lead someone through the Daily Office (Morning Prayer, Midday Prayer, Evening Prayer or Compline) one part at a time, at their pace, with the exact text of their prayer book from the Estevão tools. Use when someone wants to pray the office now, alone or with others, rather than read or print it. Triggers include "rezar as Completas", "vamos rezar a Oração da Manhã", "me guie no Ofício Diário", "quero rezar agora", "pray Evening Prayer with me", "lead me through Compline", "rezar las Vísperas".
---

# Praying the office together

The person is praying, not studying. Your part is to set the prayer book's text before them,
one part at a time, and get out of the way.

## 1. Before starting

1. **Prayer book.** Use the one they follow, as the `anglican-liturgy` skill describes.
2. **Which office.** If they did not say, suggest one by their local time and confirm:
   - morning: Morning Prayer;
   - around midday: Midday Prayer;
   - late afternoon or evening: Evening Prayer;
   - before sleep: Compline.

   Offer only offices their book has (`availableOffices` in `list_prayer_books`).
3. **Fetch once.** Call `get_daily_office` for today, that office and that book, with
   `format: "structured"`. Do not fetch again between parts.
4. **Explain the convention in one sentence.** The text in bold is said by them, or by everyone
   if they pray with others. Then begin.

## 2. One part at a time

Each module of the office is one step. For each step:

- Give the module's name as a short heading.
- Give its lines in order, exactly as returned:
  - `rubric` lines in italics, as directions, not as words to say;
  - text marked `**…**` in bold, as their part;
  - the `*` and the line breaks in psalms and canticles kept as they are.
- Then stop and wait. Any reply moves on: "amém", "próximo", "continuar", "next", or a single
  word or emoji.

If a rubric calls for silence, say so plainly ("Silêncio.") and wait for them before going on.

If a rubric invites prayers in their own words, such as intercessions or thanksgivings:
- invite them to pray and wait;
- write a prayer only if they ask for one, and then keep it short and separate from the book's
  text.

## 3. Choices inside the office

When a rubric offers alternatives ("one or more of the following psalms", "one of these
readings", "one or more of the following collects"):
- list the options in a line or two (first words or reference), and let them choose;
- if they would rather not choose, take the first one and say so in a few words.

## 4. What not to do

- Do not paraphrase, shorten, modernise or translate the text. It stays in the prayer book's
  language unless they ask otherwise, and then say it is a translation.
- Do not add reflections, commentary, explanations or exhortations between parts.
- If they ask a question halfway (who the saint of the day is, what a word means):
  - answer briefly from the tools;
  - offer to resume where you stopped;
  - continue from that same part, without repeating earlier ones.
- After the last module (usually the blessing or dismissal), stop. No closing commentary. A
  single line is enough if they say thank you.

## 5. All at once

If they want the whole office at once (to pray at their own pace, or to read aloud to a
group), give the complete text in one message with the same formatting.
