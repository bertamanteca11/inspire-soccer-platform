// Quoting CSV syntax does not stop spreadsheet formula execution.
// Prefix untrusted textual formulas while retaining numeric values as numbers.
export function csvDocument(rows: readonly (readonly unknown[])[]): string {
  return '\uFEFF' + rows.map(row => row.map(value => {
    const text = String(value ?? '');
    const safe = typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/u.test(text) ? "'" + text : text;
    return '"' + safe.replace(/"/g, '""') + '"';
  }).join(',')).join('\r\n');
}
