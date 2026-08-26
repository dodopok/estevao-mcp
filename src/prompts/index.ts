import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Prompts are strictly factual/liturgical by design: liturgical data lookup and
 * faithful document assembly. This server intentionally ships no prompt that
 * generates sermons, homilies, devotionals or authored theological reflection.
 */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "build_liturgy_sheet",
    {
      title: "Build liturgy sheet (boletim)",
      description:
        "Assemble a print-ready liturgy sheet for an office, faithfully reproducing the liturgical text.",
      argsSchema: {
        date: z.string().optional().describe('YYYY-MM-DD, "today" or "next-sunday" (default today)'),
        office: z.string().describe("morning, midday, evening or compline"),
        prayer_book: z.string().optional().describe("Prayer book code (default loc_2015)"),
      },
    },
    ({ date, office, prayer_book }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Build a print-ready liturgy sheet (boletim) for the ${office} office on ${date ?? "today"}` +
              `${prayer_book ? ` using prayer book ${prayer_book}` : ""}.\n\n` +
              `1. Call get_daily_office with format=structured to fetch the office.\n` +
              `2. Call get_liturgical_day for the same date to get season, color and celebration for the header.\n` +
              `3. Lay out the sheet: header (date, office name, season, liturgical color, celebration), then every ` +
              `module in order with its liturgical text reproduced FAITHFULLY and completely — do not paraphrase, ` +
              `shorten, or add any text of your own. Style rubrics in italics and congregation responses in bold.\n` +
              `4. Do not add commentary, reflections or explanations — the sheet contains only the liturgical text.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "explain_feast",
    {
      title: "Explain a feast or celebration",
      description:
        "Factual liturgical information about a celebration: origin, date rules, precedence, transfer rules and color.",
      argsSchema: {
        celebration_or_date: z
          .string()
          .describe('Celebration name (e.g. "Pentecostes") or date (YYYY-MM-DD)'),
        prayer_book: z.string().optional().describe("Prayer book code (default loc_2015)"),
      },
    },
    ({ celebration_or_date, prayer_book }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Explain the celebration "${celebration_or_date}"${prayer_book ? ` in prayer book ${prayer_book}` : ""} ` +
              `in strictly factual, historical and liturgical terms.\n\n` +
              `1. If it looks like a date, call get_liturgical_day for it; otherwise call search_celebrations and then ` +
              `get_celebration for details.\n` +
              `2. Cover: what it commemorates (historical facts), its type and rank in the calendar, whether it is ` +
              `fixed or movable (and how it is calculated), transfer/precedence rules, liturgical color, and its ` +
              `collect and readings as given by the tools.\n` +
              `3. Keep it factual and descriptive. Do not write devotional applications, homiletic material or ` +
              `personal spiritual advice.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "compare_traditions",
    {
      title: "Compare prayer book traditions",
      description: "Side-by-side factual comparison of how different prayer books treat the same day.",
      argsSchema: {
        date: z.string().optional().describe('YYYY-MM-DD, "today" or "next-sunday" (default today)'),
        books: z
          .string()
          .describe('Comma-separated prayer book codes, e.g. "loc_1662,loc_2019_en" (2 to 4)'),
      },
    },
    ({ date, books }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Compare how these prayer books treat ${date ?? "today"}: ${books}.\n\n` +
              `1. Call compare_prayer_books with aspect=day and books=[${books}].\n` +
              `2. Present a side-by-side table: celebration, season, liturgical color, collect and readings per book.\n` +
              `3. Point out concrete differences (different celebration, different readings/cycle, different color) ` +
              `and, where relevant, the historical reason (e.g. calendar revisions between editions) — factually, ` +
              `without theological evaluation of which tradition is better.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "explain_why",
    {
      title: "Explain why a day resolved this way",
      description:
        "Answers 'why this reading / this saint / this colour' from the engine's own decision trail, " +
        "instead of inferring a plausible reason from the result.",
      argsSchema: {
        date: z.string().optional().describe('YYYY-MM-DD, "today" or "next-sunday" (default today)'),
        question: z
          .string()
          .optional()
          .describe('What specifically to explain, e.g. "why this psalm" or "why not St James"'),
        prayer_book: z.string().optional().describe("Prayer book code (default loc_2015)"),
      },
    },
    ({ date, question, prayer_book }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Explain ${question ? `\u201c${question}\u201d` : "how the liturgy resolved"} for ` +
              `${date ?? "today"}${prayer_book ? ` in prayer book ${prayer_book}` : ""}.\n\n` +
              `1. Call explain_liturgical_day for that date${prayer_book ? ` with prayer_book=${prayer_book}` : ""}. ` +
              `It returns the actual decision trail: precedence between celebrations, transfers, how the colour ` +
              `was decided, which lectionary rule and table chose each reading, and where the psalm came from.\n` +
              `2. Answer using that trail. Name the rule that decided each thing, and say plainly when the trail ` +
              `does not explain something rather than filling the gap with a plausible reason.\n` +
              `3. If a competing celebration was outranked or transferred, say which one, to where, and under ` +
              `which rule.\n` +
              `4. Stay factual: this explains calendar and lectionary mechanics, not devotional meaning.`,
          },
        },
      ],
    }),
  );
}
