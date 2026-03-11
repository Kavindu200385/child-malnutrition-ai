/**
 * Global date / datetime formatting helpers.
 *
 * All raw ISO strings from the backend (e.g. "2026-03-01T10:37:40", "2026-03-01")
 * should be passed through these helpers before display.
 */

/**
 * Format a date-only or datetime string as  "01 Mar 2026"
 * Returns "-" if the value is falsy or unparseable.
 */
export function formatDate(value: string | null | undefined): string {
    if (!value) return '-';
    const d = new Date(value);
    if (isNaN(d.getTime())) return value; // fallback: return as-is
    return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

/**
 * Format a datetime string as  "01 Mar 2026, 10:37 AM"
 * Returns "-" if the value is falsy or unparseable.
 */
export function formatDateTime(value: string | null | undefined): string {
    if (!value) return '-';
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }) + ', ' + d.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}

/**
 * Strips everything after the 'T' and returns plain YYYY-MM-DD.
 * Useful when the backend returns a datetime but you only need the date part.
 */
export function dateOnly(value: string | null | undefined): string {
    if (!value) return '-';
    return value.slice(0, 10);
}
