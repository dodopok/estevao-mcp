#!/usr/bin/env python3
"""Write an iCalendar (.ics) file of all-day events from a JSON list.

Usage:
    python3 make_ics.py EVENTS.json OUTPUT.ics [--name "Calendar name"]

EVENTS.json holds a list of objects:
    [{"date": "2026-12-06", "title": "2º Domingo do Advento", "description": "Cor: violeta\\n..."}]

"date" (YYYY-MM-DD) and "title" are required; "description" is optional and may
contain newlines. The output follows RFC 5545: CRLF line endings, escaped text,
lines folded at 75 octets, one all-day VEVENT per entry, and a UID derived from
the date and title so re-importing the same file updates events instead of
duplicating them. Standard library only.
"""

import argparse
import hashlib
import json
import sys
from datetime import date, datetime, timedelta, timezone


def escape(text: str) -> str:
    """Escape a TEXT value (RFC 5545, section 3.3.11)."""
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def fold(line: str) -> str:
    """Fold a content line at 75 octets without splitting a UTF-8 character."""
    out, current, size = [], "", 0
    for char in line:
        width = len(char.encode("utf-8"))
        limit = 75 if not out else 74  # continuation lines start with a space
        if size + width > limit:
            out.append(current)
            current, size = "", 0
        current += char
        size += width
    out.append(current)
    return "\r\n ".join(out)


def build(events: list, name: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Estevao//Liturgical planning//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{escape(name)}",
    ]
    for index, event in enumerate(events):
        try:
            day = date.fromisoformat(str(event["date"]))
            title = str(event["title"]).strip()
        except (KeyError, ValueError) as err:
            raise SystemExit(f"Event {index}: needs a YYYY-MM-DD 'date' and a 'title' ({err}).")
        if not title:
            raise SystemExit(f"Event {index}: 'title' is empty.")
        uid = hashlib.sha1(f"{day.isoformat()}|{title}".encode("utf-8")).hexdigest()
        lines += [
            "BEGIN:VEVENT",
            f"UID:{uid}@estevao.caminhoanglicano.com.br",
            f"DTSTAMP:{stamp}",
            f"DTSTART;VALUE=DATE:{day.strftime('%Y%m%d')}",
            f"DTEND;VALUE=DATE:{(day + timedelta(days=1)).strftime('%Y%m%d')}",
            f"SUMMARY:{escape(title)}",
        ]
        description = str(event.get("description") or "").strip()
        if description:
            lines.append(f"DESCRIPTION:{escape(description)}")
        lines += ["TRANSP:TRANSPARENT", "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return "".join(fold(line) + "\r\n" for line in lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("events", help="JSON file with the list of events")
    parser.add_argument("output", help="path of the .ics file to write")
    parser.add_argument("--name", default="Calendário litúrgico", help="calendar name shown in the app")
    args = parser.parse_args()

    with open(args.events, encoding="utf-8") as handle:
        events = json.load(handle)
    if not isinstance(events, list) or not events:
        raise SystemExit("The events file must hold a non-empty JSON list.")

    with open(args.output, "w", encoding="utf-8", newline="") as handle:
        handle.write(build(events, args.name))
    print(f"Wrote {len(events)} events to {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
