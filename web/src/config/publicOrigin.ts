import { withBase } from '../shell/router.ts';

/**
 * The origin shared links point at (`<origin>/r/<code>`): the build-time `VITE_PUBLIC_APP_ORIGIN`, because the public
 * domain is still TBD and is never hard-coded. When it is unset, the origin the app is opened from stands in.
 */
const configured: string = (import.meta.env as Record<string, string | undefined>).VITE_PUBLIC_APP_ORIGIN ?? '';

export function publicOrigin(base: string = configured, fallback: string = typeof window === 'undefined' ? '' : window.location.origin): string {
  return (base.trim() || fallback).replace(/\/+$/, '');
}

/** The join link for a room code in its canonical form, e.g. `https://host/r/K7M-Q2X`. */
export function roomLink(displayCode: string, origin: string = publicOrigin()): string {
  return `${origin}${withBase(`/r/${displayCode}`)}`;
}
