import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { showAccountDeleted } from '../auth/accountNotice.ts';
import { session, useSession } from '../auth/session.ts';
import { Button } from '../design/Button.tsx';
import { PageColumn } from '../design/PageColumn.tsx';
import i18n, { storeLanguage, uiLanguage, type Language } from '../i18n/index.ts';
import { useDocumentTitle } from '../i18n/useDocumentTitle.ts';
import { REDUCE_EFFECTS_SETTINGS, useReduceEffectsStore, type ReduceEffectsSetting } from '../motion/reduceEffects.ts';
import { ensureProfileLoaded, resetProfile, saveProfile, useProfile } from '../profile/profileStore.ts';
import { closeRealtime } from '../realtime/connection.ts';
import { announce } from '../shell/announce.ts';
import { navigate } from '../shell/router.ts';
import { DeleteAccountDialog } from './DeleteAccountDialog.tsx';
import { clearRecentRooms } from './rooms/recentRooms.ts';

/**
 * Settings (Story 2.8): Language, Reduce effects, and for a registered player Sign out and Delete account.
 * A guest sees only Language and Reduce effects, both kept on this device. A registered player's language is
 * saved to her profile (publishing profileUpdated) and the access token is refreshed so `lang` is current.
 */
export function SettingsScreen() {
  const { t } = useTranslation();
  useDocumentTitle(t('settings.title'));
  const status = useSession((s) => s.status);
  const registered = status === 'registered';
  const profile = useProfile((s) => s.profile);
  const reduce = useReduceEffectsStore((s) => s.setting);
  const setReduce = useReduceEffectsStore((s) => s.setSetting);
  const [language, setLanguage] = useState<Language>(uiLanguage());
  const [languageError, setLanguageError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const deletingRef = useRef(false);

  useEffect(() => {
    if (registered) void ensureProfileLoaded();
  }, [registered]);

  // Android back closes the confirm step (it means Cancel).
  useEffect(() => {
    if (!confirming) return undefined;
    const pathAtOpen = window.location.pathname;
    const onPop = () => {
      if (!deletingRef.current) setConfirming(false);
    };
    let poppedByBack = false;
    const onPopState = () => {
      poppedByBack = true;
      onPop();
    };
    window.history.pushState(window.history.state, '');
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      // Closed by a button or Esc: drop the entry the dialog added.
      if (!poppedByBack && window.location.pathname === pathAtOpen) window.history.back();
    };
  }, [confirming]);

  const chooseLanguage = async (next: Language) => {
    const previous = uiLanguage();
    if (next === previous) return;
    setLanguage(next);
    setLanguageError(false);
    await i18n.changeLanguage(next);
    announce(i18n.getFixedT(next)('profile.languageChanged'));
    if (registered && profile?.profileComplete && profile.displayName && profile.district && profile.examLevel) {
      const saved = await saveProfile({
        displayName: profile.displayName,
        district: profile.district,
        examLevel: profile.examLevel,
        language: next,
      });
      if (!saved.ok) {
        setLanguageError(true);
        setLanguage(previous);
        await i18n.changeLanguage(previous);
      }
    } else {
      // A guest's choice lives on this device.
      storeLanguage(next);
    }
  };

  const signOut = async () => {
    await session.signOut();
    closeRealtime();
    resetProfile();
    announce(t('settings.signedOut'));
    navigate('/');
  };

  const deleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    deletingRef.current = true;
    setDeleteError(false);
    const userId = session.userId();
    const ok = await session.deleteAccount();
    setDeleting(false);
    deletingRef.current = false;
    if (!ok) {
      setDeleteError(true);
      return;
    }
    setConfirming(false);
    if (userId) clearRecentRooms(userId);
    closeRealtime();
    resetProfile();
    showAccountDeleted();
    announce(i18n.t('settings.deleted'));
    navigate('/');
  };

  return (
    <PageColumn className="py-4">
      <main className="flex flex-col gap-4">
        <h1 tabIndex={-1} className="font-title text-title">
          {t('settings.title')}
        </h1>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-body font-bold">{t('settings.language')}</legend>
          <div className="flex flex-wrap gap-4">
            {(['ml', 'en'] as const).map((code) => (
              <label key={code} className="hit-target inline-flex items-center gap-2">
                <input type="radio" name="language" value={code} checked={language === code} onChange={() => void chooseLanguage(code)} />
                {t(`profile.language.${code}`)}
              </label>
            ))}
          </div>
          {languageError ? (
            <p role="alert" className="text-caption text-brick">
              <span aria-hidden="true">⚠ </span>
              {t('settings.languageSaveFailed')}
            </p>
          ) : null}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-body font-bold">{t('settings.reduceEffects')}</legend>
          <div className="flex flex-wrap gap-4">
            {REDUCE_EFFECTS_SETTINGS.map((setting: ReduceEffectsSetting) => (
              <label key={setting} className="hit-target inline-flex items-center gap-2">
                <input type="radio" name="reduce-effects" value={setting} checked={reduce === setting} onChange={() => setReduce(setting)} />
                {t(`settings.reduce.${setting}`)}
              </label>
            ))}
          </div>
          <p className="text-caption text-muted">{t('settings.reduceHint')}</p>
        </fieldset>

        {registered ? (
          <div className="flex flex-col items-start gap-2">
            <Button variant="secondary" onClick={() => void signOut()}>
              {t('settings.signOut')}
            </Button>
            <Button variant="danger-text" onClick={() => setConfirming(true)}>
              {t('settings.deleteAccount')}
            </Button>
            {deleteError ? (
              <p role="alert" className="text-caption text-brick">
                <span aria-hidden="true">⚠ </span>
                {t('settings.deleteFailed')}
              </p>
            ) : null}
          </div>
        ) : null}
      </main>
      {confirming ? <DeleteAccountDialog busy={deleting} onCancel={() => !deleting && setConfirming(false)} onDelete={() => void deleteAccount()} /> : null}
    </PageColumn>
  );
}
