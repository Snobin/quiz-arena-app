/** Absolute times for the lobby and the recent list, in IST (the exam audience is in Kerala). */

const IST = 'Asia/Kolkata';

const istDay = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);

/** "7:30 pm" in IST. */
export function istClock(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(ms);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('hour')}:${get('minute')} ${get('dayPeriod').toLowerCase()}`;
}

/** When a lobby expires: the IST clock time, and whether that is on a later IST day than `now` ("expires tomorrow 7:30 pm"). */
export function expiryLabel(expiresAt: string, now: number = Date.now()): { time: string; tomorrow: boolean } {
  const at = Date.parse(expiresAt);
  return { time: istClock(at), tomorrow: istDay(at) > istDay(now) };
}

/** "11 Nov" in IST, in the UI language's locale. */
export function shortDate(iso: string, language: 'ml' | 'en'): string {
  return new Intl.DateTimeFormat(language === 'ml' ? 'ml-IN' : 'en-IN', { timeZone: IST, day: 'numeric', month: 'short' }).format(Date.parse(iso));
}
