const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

const RELATIVE_REGEX =
  /^(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|mos|month|months|y|yr|yrs|year|years)\s*ago$/i;

export function normalizeIsoDate(
  rawDate?: unknown,
  referenceTimeMs: number = Date.now()
): string | undefined {
  if (rawDate === undefined || rawDate === null) return undefined;

  // Handle number or numeric string (Unix epoch)
  if (typeof rawDate === 'number') {
    if (!Number.isFinite(rawDate) || rawDate <= 0) return undefined;
    // Seconds vs milliseconds heuristic: 10 digits is seconds (up to Nov 2286)
    const ms = rawDate < 10000000000 ? rawDate * 1000 : rawDate;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  if (typeof rawDate !== 'string') return undefined;

  const trimmed = rawDate.trim();
  if (!trimmed) return undefined;

  // Numeric string (e.g. "1740000000")
  if (/^\d{9,13}$/.test(trimmed)) {
    const num = Number(trimmed);
    const ms = num < 10000000000 ? num * 1000 : num;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  const lower = trimmed.toLowerCase();

  // Natural relative words
  if (lower === 'just now' || lower === 'today') {
    return new Date(referenceTimeMs).toISOString();
  }
  if (lower === 'yesterday') {
    return new Date(referenceTimeMs - DAY_MS).toISOString();
  }

  // Regex matching relative offsets like "2 hours ago", "3d ago", "1 month ago"
  const relMatch = lower.match(RELATIVE_REGEX);
  if (relMatch) {
    const count = Number.parseInt(relMatch[1], 10);
    const unit = relMatch[2];

    let offsetMs = 0;
    if (unit.startsWith('s')) offsetMs = count * SECOND_MS;
    else if (unit.startsWith('m') && !unit.startsWith('mo')) offsetMs = count * MINUTE_MS;
    else if (unit.startsWith('h')) offsetMs = count * HOUR_MS;
    else if (unit.startsWith('d')) offsetMs = count * DAY_MS;
    else if (unit.startsWith('w')) offsetMs = count * WEEK_MS;
    else if (unit.startsWith('mo')) offsetMs = count * MONTH_MS;
    else if (unit.startsWith('y')) offsetMs = count * YEAR_MS;

    return new Date(referenceTimeMs - offsetMs).toISOString();
  }

  // Standard date parsing (ISO 8601, RFC 2822, etc.)
  const parsedMs = Date.parse(trimmed);
  if (!Number.isNaN(parsedMs)) {
    return new Date(parsedMs).toISOString();
  }

  return undefined;
}
