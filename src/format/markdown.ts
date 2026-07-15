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
  const ref = line.reference ? ` *(${line.reference})*` : "";
  switch (line.type) {
    case "heading":
      return `### ${line.content}`;
    case "subheading":
      return `#### ${line.content}`;
    case "rubric":
      return `*${line.content}*`;
    case "congregation":
    case "responsive":
      return `**${line.content}**${ref}`;
    case "citation":
      return `— ${line.content}`;
    case "spacer":
      return undefined;
    case "html":
      return stripHtml(line.content) + ref;
    default:
      // leader, reader, plain text
      return line.content + ref;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
