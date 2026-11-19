import { create } from 'zustand';
import { apiFetch } from '../auth/apiFetch.ts';
import { session } from '../auth/session.ts';
import { apiUrl } from '../config/apiBase.ts';
import i18n, { uiLanguage, type Language } from '../i18n/index.ts';
import type { DistrictCode, ExamLevel } from './districts.ts';

export const PROFILE_PATH = '/api/core/v1/me/profile';

export type Profile = {
  displayName: string | null;
  district: DistrictCode | null;
  examLevel: ExamLevel | null;
  language: Language | null;
  profileComplete: boolean;
};

export type ProfileForm = { displayName: string; district: string; examLevel: string; language: Language };
export type FieldErrors = Partial<Record<keyof ProfileForm, string>>;

export type SaveResult = { ok: true } | { ok: false; fieldErrors: FieldErrors; general: boolean };

type ProfileState = { status: 'idle' | 'loading' | 'ready' | 'error'; profile: Profile | null };

export const useProfile = create<ProfileState>(() => ({ status: 'idle', profile: null }));

let inflight: Promise<void> | null = null;
/** Bumped on reset, so a response that was in flight for a previous account is ignored. */
let generation = 0;

/** Loads the signed-in player's profile once (single-flight) and applies her saved language. */
export function ensureProfileLoaded(): Promise<void> {
  const { status } = useProfile.getState();
  if (status === 'ready') return Promise.resolve();
  if (inflight) return inflight;
  useProfile.setState({ status: 'loading' });
  const mine = generation;
  inflight = (async () => {
    try {
      const response = await apiFetch(apiUrl(PROFILE_PATH), { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`profile ${response.status}`);
      const profile = (await response.json()) as Profile;
      if (mine !== generation) return;
      useProfile.setState({ status: 'ready', profile });
      // Minnal speaks her language: once she has saved one, it is the UI language.
      if (profile.profileComplete && profile.language && profile.language !== uiLanguage()) {
        await i18n.changeLanguage(profile.language);
      }
    } catch {
      if (mine === generation) useProfile.setState({ status: 'error' });
    } finally {
      if (mine === generation) inflight = null;
    }
  })();
  return inflight;
}

export function resetProfile(): void {
  generation += 1;
  inflight = null;
  useProfile.setState({ status: 'idle', profile: null });
}

/** `PUT /me/profile`; on success refreshes the access token so `name` and `lang` are current. */
export async function saveProfile(form: ProfileForm): Promise<SaveResult> {
  let response: Response;
  try {
    response = await apiFetch(apiUrl(PROFILE_PATH), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(form),
    });
  } catch {
    return { ok: false, fieldErrors: {}, general: true };
  }
  if (response.status === 400) {
    const problem = (await response.json().catch(() => null)) as { errors?: { field: string; code: string }[] } | null;
    const fieldErrors: FieldErrors = {};
    for (const error of problem?.errors ?? []) fieldErrors[error.field as keyof ProfileForm] = error.code;
    return { ok: false, fieldErrors, general: Object.keys(fieldErrors).length === 0 };
  }
  if (!response.ok) return { ok: false, fieldErrors: {}, general: true };
  const profile = (await response.json()) as Profile;
  useProfile.setState({ status: 'ready', profile });
  await session.refreshNow();
  return { ok: true };
}
