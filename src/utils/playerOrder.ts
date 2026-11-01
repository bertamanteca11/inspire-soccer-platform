type NumberedPlayer = { shirt_number?: number | string | null; display_name: string };
const names = new Intl.Collator('es', { sensitivity: 'base' });

function jerseyNumber(value: NumberedPlayer['shirt_number']): number {
  if (value == null || String(value).trim() === '') return Infinity;
  const number = Number(value);
  return Number.isFinite(number) ? number : Infinity;
}

export function sortPlayersByJersey<T extends NumberedPlayer>(players: readonly T[]): T[] {
  return [...players].sort((a, b) => {
    const left = jerseyNumber(a.shirt_number), right = jerseyNumber(b.shirt_number);
    if (left !== right) return left < right ? -1 : 1;
    return names.compare(a.display_name, b.display_name);
  });
}
