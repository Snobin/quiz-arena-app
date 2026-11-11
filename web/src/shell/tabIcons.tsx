import type { ReactNode } from 'react';

/** 20px line icons for the tab bar. Decorative: the tab label is the accessible name. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** Play: the Minnal bolt. */
export function PlayIcon() {
  return (
    <Icon>
      <path d="M11.5 2 4.5 11h5l-1 7 7-9h-5l1-7Z" />
    </Icon>
  );
}

/** Rooms: a group of players. */
export function RoomsIcon() {
  return (
    <Icon>
      <circle cx="7.5" cy="7" r="2.5" />
      <circle cx="13.5" cy="7.5" r="2" />
      <path d="M3 16c0-2.5 2-4.5 4.5-4.5S12 13.5 12 16" />
      <path d="M13 11.5c2.2 0 4 1.8 4 4" />
    </Icon>
  );
}

/** Ranks: a podium. */
export function RanksIcon() {
  return (
    <Icon>
      <path d="M7.5 17V7.5h5V17" />
      <path d="M2.5 17v-5.5h5" />
      <path d="M12.5 10h5v7" />
      <path d="M2 17h16" />
    </Icon>
  );
}

/** Me: a person. */
export function MeIcon() {
  return (
    <Icon>
      <circle cx="10" cy="6.5" r="3" />
      <path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    </Icon>
  );
}
