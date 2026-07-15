import type { DailyOffice, OfficeLine } from "../normalize/types.js";
import { labels, resolveLocale } from "./i18n.js";

/**
 * Render a normalized Daily Office as readable markdown (default tool output).
 * Generated labels follow the office's own language, falling back to
 * `fallbackLanguage` (e.g. ESTEVAO_LANGUAGE) and then English.
 */
export function renderOfficeMarkdown(office: DailyOffice, fallbackLanguage?: string): string {
  const t = labels(resolveLocale(office.language, fallbackLanguage));
  const parts: string[] = [];
  const header = [
    `# ${t.offices[office.officeType] ?? office.officeType} — ${office.date}`,
    office.season && `**${t.season}:** ${office.season}`,
    office.color && `**${t.color}:** ${office.color}`,
    office.prayerBook && `**${t.prayerBook}:** ${office.prayerBook}`,
  ].filter(Boolean);
  parts.push(header.join("  \n"));

  for (const module of office.modules) {
    const lines = module.lines.map(renderLine).filter((l) => l !== undefined);
    parts.push(`## ${module.name}\n\n${lines.join("\n\n")}`);
  }
  return parts.join("\n\n");
}

function renderLine(line: OfficeLine): string | undefined {
  const content = line.content.trim();
  const ref = line.reference ? ` *(${line.reference})*` : "";
  const verse = line.verseNumber != null ? `**${line.verseNumber}** ` : "";
  if (!content && line.type !== "spacer") return undefined;
  switch (line.type) {
    case "heading":
      return `### ${content}`;
    case "subheading":
    case "subtitle":
      return `#### ${content}`;
    case "rubric":
      return `*${content}*`;
    case "congregation":
    case "responsive":
    case "all":
      return `**${verse}${content}**${ref}`;
    case "citation":
      return `— ${content}`;
    case "spacer":
      return undefined;
    case "html":
      return stripHtml(content) + ref;
    default:
      // leader, reader, text, reading_text, plain content
      return verse + content + ref;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
