import { parseDate, toCalendarDateTime, toTimeZone, toZoned } from "@internationalized/date";

// Todoist's filter language interprets `created: <date>` and `added: <date>`
// against UTC dates, but the Todoist app evaluates the same expression in the
// user's local timezone. Identical filter strings therefore yield different
// results between the app and the API.
//
// To present a seamless experience matching the Todoist app, this module
// rewrites filters that mention a literal calendar date (YYYY-MM-DD) into an
// equivalent UTC datetime range covering the user's local day. Rewrites are
// scoped to: `(created|added)[ before:| after:]: <date>`. Filters that
// already include a time-of-day are left alone, as are higher-level
// expressions like `today` (Todoist evaluates these server-side; rewriting
// them would mean reimplementing relative-date semantics).

const PAD_TARGET = 2;

const pad = (n: number): string => n.toString().padStart(PAD_TARGET, "0");

const formatTodoistUtc = (zoned: ReturnType<typeof toZoned>): string => {
  // Caller passes a ZonedDateTime in UTC; produce `YYYY-MM-DD HH:MM`,
  // which is the form Todoist's filter language accepts (verified live).
  return `${zoned.year}-${pad(zoned.month)}-${pad(zoned.day)} ${pad(zoned.hour)}:${pad(zoned.minute)}`;
};

const localDayBounds = (date: string, tz: string): { start: string; end: string } => {
  const calDate = parseDate(date);
  const startLocal = toCalendarDateTime(calDate);
  const startZoned = toZoned(startLocal, tz);
  const endZoned = startZoned.add({ days: 1 });
  return {
    start: formatTodoistUtc(toTimeZone(startZoned, "UTC")),
    end: formatTodoistUtc(toTimeZone(endZoned, "UTC")),
  };
};

// `\b` ensures we match `created:`/`added:` as whole words, not e.g. `discreated:`.
// `(?!\s+\d{1,2}:\d{2})` skips dates that are already qualified with a
// time-of-day — those are user-supplied UTC ranges and shouldn't be rewritten.
const ON_DATE_PATTERN = /\b(?:created|added):\s*(\d{4}-\d{2}-\d{2})\b(?!\s+\d{1,2}:\d{2})/gi;
const BEFORE_DATE_PATTERN =
  /\b(?:created|added)\s+before:\s*(\d{4}-\d{2}-\d{2})\b(?!\s+\d{1,2}:\d{2})/gi;
const AFTER_DATE_PATTERN =
  /\b(?:created|added)\s+after:\s*(\d{4}-\d{2}-\d{2})\b(?!\s+\d{1,2}:\d{2})/gi;

export const rewriteFilterDates = (filter: string, tz: string): string => {
  return filter
    .replace(BEFORE_DATE_PATTERN, (_match, date: string) => {
      const { start } = localDayBounds(date, tz);
      return `added before: ${start}`;
    })
    .replace(AFTER_DATE_PATTERN, (_match, date: string) => {
      const { end } = localDayBounds(date, tz);
      return `added after: ${end}`;
    })
    .replace(ON_DATE_PATTERN, (_match, date: string) => {
      const { start, end } = localDayBounds(date, tz);
      return `(added after: ${start} & added before: ${end})`;
    });
};
