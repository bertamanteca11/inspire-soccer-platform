const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export function copenhagenToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return get('year') + '-' + get('month') + '-' + get('day');
}
export function calendarDate(value: string): Date {
  if (!datePattern.test(value)) throw new Error('Fecha de calendario inválida.');
  const date = new Date(value + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value) throw new Error('Fecha de calendario inválida.');
  return date;
}
export function addCalendarDays(value: string, days: number): string {
  const date = calendarDate(value); date.setUTCDate(date.getUTCDate()+days); return date.toISOString().slice(0,10);
}
export function mondayOfWeek(value: string): string {
  const date = calendarDate(value); return addCalendarDays(value, -((date.getUTCDay()+6)%7));
}
export function previousCopenhagenWeek(now = new Date()): string { return addCalendarDays(mondayOfWeek(copenhagenToday(now)), -7); }
export function weekBounds(value: string) {
  const from = mondayOfWeek(value); return { from, to: addCalendarDays(from,7) };
}
