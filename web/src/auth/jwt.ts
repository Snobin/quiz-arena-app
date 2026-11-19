/** A claim of a JWT payload (UTF-8 aware, so Malayalam names survive), or undefined. Never verifies. */
export function tokenClaim(accessToken: string, claim: string): unknown {
  try {
    const payload = accessToken.split('.')[1] ?? '';
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return (claims as Record<string, unknown> | null)?.[claim];
  } catch {
    return undefined;
  }
}
