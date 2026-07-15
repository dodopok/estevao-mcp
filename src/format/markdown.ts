import type { DailyOffice, OfficeLine } from "../normalize/types.js";

/** Render a normalized Daily Office as readable markdown (default tool output). */
export function renderOfficeMarkdown(office: DailyOffice): string {
  const parts: string[] = [];
  const header = [
    `# ${titleForOffice(office.officeType)} — ${office.date}`,
    office.season && `**Season:** ${office.season}`,
    office.color && `**Color:** ${office.color}`,
    office.prayerBook && `**Prayer book:** ${office.prayerBook}`,
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

function titleForOffice(officeType: string): string {
  const titles: Record<string, string> = {
    morning: "Morning Prayer",
    midday: "Midday Prayer",
    evening: "Evening Prayer",
    compline: "Compline",
    late_evening: "Late Evening Prayer",
  };
  return titles[officeType] ?? officeType;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
