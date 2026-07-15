import { describe, expect, it } from "vitest";
import { resolveDate, toIso } from "../src/dates.js";

describe("resolveDate", () => {
  it("parses explicit ISO dates", () => {
    expect(resolveDate("2026-12-25")).toEqual({ year: 2026, month: 12, day: 25 });
  });

  it("defaults to today", () => {
    const today = resolveDate(undefined);
    expect(today.year).toBeGreaterThanOrEqual(2026);
  });

  it("resolves next-sunday to a Sunday strictly after today", () => {
    const next = resolveDate("next-sunday");
    const date = new Date(Date.UTC(next.year, next.month - 1, next.day));
    expect(date.getUTCDay()).toBe(0);
    const today = resolveDate("today");
    expect(toIso(next) > toIso(today)).toBe(true);
  });

  it("rejects invalid input", () => {
    expect(() => resolveDate("25/12/2026")).toThrow(/Invalid date/);
  });
});
