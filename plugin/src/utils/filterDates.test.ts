import { describe, expect, it } from "vitest";

import { rewriteFilterDates } from "@/utils/filterDates";

// May 5 2026 in PT is during Daylight Saving Time → UTC-7.
// May 5 local 00:00 = May 5 07:00 UTC; May 6 local 00:00 = May 6 07:00 UTC.
const PT = "America/Los_Angeles";

// Auckland NZ in May is in NZST (winter, DST off) → UTC+12.
// May 5 local 00:00 = May 4 12:00 UTC; May 6 local 00:00 = May 5 12:00 UTC.
const NZ = "Pacific/Auckland";

// Asia/Kolkata is UTC+5:30 year-round.
// May 5 local 00:00 = May 4 18:30 UTC; May 6 local 00:00 = May 5 18:30 UTC.
const IST = "Asia/Kolkata";

describe("rewriteFilterDates", () => {
  it("returns unchanged when filter has no date references", () => {
    expect(rewriteFilterDates("p1 & @work", PT)).toBe("p1 & @work");
    expect(rewriteFilterDates("today", PT)).toBe("today");
    expect(rewriteFilterDates("", PT)).toBe("");
  });

  it("rewrites bare 'created: <date>' to UTC range covering the local day (PT)", () => {
    expect(rewriteFilterDates("created: 2026-05-05", PT)).toBe(
      "(added after: 2026-05-05 07:00 & added before: 2026-05-06 07:00)",
    );
  });

  it("rewrites bare 'added: <date>' the same as 'created: <date>'", () => {
    expect(rewriteFilterDates("added: 2026-05-05", PT)).toBe(
      "(added after: 2026-05-05 07:00 & added before: 2026-05-06 07:00)",
    );
  });

  it("rewrites 'created before: <date>' to UTC start-of-local-day", () => {
    expect(rewriteFilterDates("created before: 2026-05-05", PT)).toBe(
      "added before: 2026-05-05 07:00",
    );
  });

  it("rewrites 'created after: <date>' to UTC end-of-local-day", () => {
    expect(rewriteFilterDates("created after: 2026-05-05", PT)).toBe(
      "added after: 2026-05-06 07:00",
    );
  });

  it("rewrites all three forms in the same filter", () => {
    const out = rewriteFilterDates(
      "created: 2026-05-05 | created before: 2026-04-01 | created after: 2026-06-01",
      PT,
    );
    expect(out).toBe(
      "(added after: 2026-05-05 07:00 & added before: 2026-05-06 07:00) | added before: 2026-04-01 07:00 | added after: 2026-06-02 07:00",
    );
  });

  it("preserves surrounding boolean operators and other clauses", () => {
    expect(rewriteFilterDates("created: 2026-05-05 & p1", PT)).toBe(
      "(added after: 2026-05-05 07:00 & added before: 2026-05-06 07:00) & p1",
    );
    expect(rewriteFilterDates("(@work | @home) & created: 2026-05-05", PT)).toBe(
      "(@work | @home) & (added after: 2026-05-05 07:00 & added before: 2026-05-06 07:00)",
    );
  });

  it("does not rewrite when a time-of-day is already provided", () => {
    // The user already wrote a precise UTC datetime; respect their intent.
    expect(rewriteFilterDates("added before: 2026-05-05 12:00", PT)).toBe(
      "added before: 2026-05-05 12:00",
    );
    expect(rewriteFilterDates("added after: 2026-05-05 23:30 & p1", PT)).toBe(
      "added after: 2026-05-05 23:30 & p1",
    );
  });

  it("respects the supplied timezone (NZ, UTC+12 in May)", () => {
    // 2026-05-05 00:00 NZ = 2026-05-04 12:00 UTC
    expect(rewriteFilterDates("created: 2026-05-05", NZ)).toBe(
      "(added after: 2026-05-04 12:00 & added before: 2026-05-05 12:00)",
    );
  });

  it("respects half-hour offsets (IST UTC+5:30)", () => {
    // 2026-05-05 00:00 IST = 2026-05-04 18:30 UTC
    expect(rewriteFilterDates("created: 2026-05-05", IST)).toBe(
      "(added after: 2026-05-04 18:30 & added before: 2026-05-05 18:30)",
    );
  });

  it("is case-insensitive on the keyword", () => {
    expect(rewriteFilterDates("Created: 2026-05-05", PT)).toBe(
      "(added after: 2026-05-05 07:00 & added before: 2026-05-06 07:00)",
    );
    expect(rewriteFilterDates("ADDED BEFORE: 2026-05-05", PT)).toBe(
      "added before: 2026-05-05 07:00",
    );
  });

  it("does not match created/added inside other words", () => {
    // 'recreated' should not be touched.
    expect(rewriteFilterDates("recreated: 2026-05-05", PT)).toBe("recreated: 2026-05-05");
  });
});
