/** 16px mode icons and the 10 x 12 lock, from mockups/key-home.html. Decorative. */

export function TopicDuelIcon() {
  return (
    <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8" cy="8" r="2" fill="currentColor" />
    </svg>
  );
}

export function SoloPracticeIcon() {
  return (
    <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16">
      <rect x="3" y="2" width="10" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <line x1="5.5" y1="6" x2="10.5" y2="6" stroke="currentColor" strokeWidth="1.4" />
      <line x1="5.5" y1="9" x2="10.5" y2="9" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function BattleRoomIcon() {
  return (
    <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16">
      <circle cx="5" cy="6" r="2.2" fill="currentColor" />
      <circle cx="11" cy="6" r="2.2" fill="currentColor" />
      <path
        d="M1.5 14c0-2.4 1.6-4 3.5-4s3.5 1.6 3.5 4M7.5 14c0-2.4 1.6-4 3.5-4s3.5 1.6 3.5 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg aria-hidden="true" focusable="false" width="10" height="12" viewBox="0 0 10 12">
      <rect x="1" y="5" width="8" height="6.5" rx="1" fill="currentColor" />
      <path d="M3 5V3.5a2 2 0 0 1 4 0V5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
