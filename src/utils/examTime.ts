/**
 * Examination timestamp formatting helpers.
 *
 * Examinations store `exam_date` (YYYY-MM-DD) plus `exam_time` / `unlock_time`
 * as time-only strings ("HH:MM"), so calling `new Date(unlock_time)` directly
 * yields "Invalid Date". These helpers combine the two fields properly.
 */

const TIME_ONLY_RE = /^\d{1,2}:\d{2}(:\d{2})?$/;

/** True when the value is a bare "HH:MM[:SS]" string rather than a real date. */
export const isTimeOnly = (value: unknown): boolean =>
  typeof value === 'string' && TIME_ONLY_RE.test(value.trim());

/**
 * Resolve a timestamp for display: full ISO/date-time values parse directly,
 * time-only values are anchored to the exam date (or today when unknown).
 * Returns null when nothing sensible can be shown.
 */
export function resolveExamMoment(
  timeValue: string | null | undefined,
  examDate?: string | null
): Date | null {
  if (isTimeOnly(timeValue)) {
    const parts = String(timeValue)
      .trim()
      .split(':')
      .map((n) => parseInt(n, 10));
    const h = parts[0];
    const m = parts[1];
    const s = parts.length > 2 ? parts[2] : 0;
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    const dateParts = examDate
      ? String(examDate)
          .trim()
          .split('T')[0]
          .split('-')
          .map((n) => parseInt(n, 10))
      : [];
    const y = dateParts[0];
    const mo = dateParts[1];
    const d = dateParts[2];
    if (Number.isFinite(y) && Number.isFinite(mo) && Number.isFinite(d)) {
      return new Date(y, mo - 1, d, h, m, Number.isFinite(s) ? s : 0);
    }
    // No exam date available: anchor to today so the clock time still renders.
    const base = new Date();
    base.setHours(h, m, Number.isFinite(s) ? s : 0, 0);
    return base;
  }
  if (!timeValue) return null;
  const parsed = new Date(timeValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Human label for an unlock/time-lock value. Falls back to the raw time string
 * ("03:45") instead of ever printing "Invalid Date".
 */
export function formatExamUnlock(
  timeValue: string | null | undefined,
  examDate?: string | null
): string {
  const moment = resolveExamMoment(timeValue, examDate);
  if (!moment) return timeValue || '—';
  if (isTimeOnly(timeValue) && !examDate) return moment.toLocaleTimeString();
  return moment.toLocaleString();
}
