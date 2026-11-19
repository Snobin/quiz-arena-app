import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../auth/session.ts';
import { Button } from '../design/Button.tsx';
import { PageColumn } from '../design/PageColumn.tsx';
import { Lang } from '../i18n/Lang.tsx';
import { uiLanguage } from '../i18n/index.ts';
import { useDocumentTitle } from '../i18n/useDocumentTitle.ts';
import { districtKey, examLevelKey, type DistrictCode, type ExamLevel } from '../profile/districts.ts';
import { ensureProfileLoaded, useProfile } from '../profile/profileStore.ts';
import { MatchHistory } from '../ratings/MatchHistory.tsx';
import { RatingTrio } from '../ratings/RatingTrio.tsx';
import { navigate } from '../shell/router.ts';
import { SignInNudge } from './home/SignInNudge.tsx';
import { ProfileForm } from './profile/ProfileForm.tsx';

/**
 * The Me tab. A guest sees exactly one Sign-in nudge and no profile. A registered player sees her
 * Profile section (name, district, exam level, language) with an Edit action that opens the same form
 * prefilled; Back without saving discards the changes and any language preview.
 */
export function MeScreen() {
  const { t } = useTranslation();
  useDocumentTitle(t('tab.me'));
  const status = useSession((s) => s.status);
  const profileStatus = useProfile((s) => s.status);
  const profile = useProfile((s) => s.profile);
  const [editing, setEditing] = useState(false);

  return (
    <PageColumn className="py-4">
      <main className="flex flex-col gap-3">
        <h1 tabIndex={-1} className="font-title text-title">
          {t('tab.me')}
        </h1>
        <Button variant="secondary" className="self-start" onClick={() => navigate('/settings')}>
          {t('settings.link')}
        </Button>
        {status !== 'registered' ? (
          <SignInNudge />
        ) : profileStatus === 'error' ? (
          <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-brick bg-card p-4">
            <p className="text-body">{t('profile.error.load')}</p>
            <Button variant="secondary" onClick={() => void ensureProfileLoaded()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : !profile ? (
          <p className="text-muted">{t('common.loading')}</p>
        ) : editing ? (
          <ProfileForm
            initial={{
              displayName: profile.displayName ?? '',
              district: profile.district ?? '',
              examLevel: profile.examLevel ?? '',
              language: profile.language ?? uiLanguage(),
            }}
            onSaved={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
          <RatingTrio />
          <section aria-labelledby="profile-heading" data-testid="profile-section" className="flex flex-col gap-2 rounded-lg border border-hairline bg-card p-4">
            <h2 id="profile-heading" className="text-body font-bold">
              {t('profile.section')}
            </h2>
            <dl className="flex flex-col gap-1">
              <Row label={t('profile.field.name')}>
                <Lang>{profile.displayName ?? ''}</Lang>
              </Row>
              <Row label={t('profile.field.district')}>{profile.district ? t(districtKey(profile.district as DistrictCode)) : ''}</Row>
              <Row label={t('profile.field.level')}>{profile.examLevel ? t(examLevelKey(profile.examLevel as ExamLevel)) : ''}</Row>
              <Row label={t('profile.field.language')}>{profile.language ? t(`profile.language.${profile.language}`) : ''}</Row>
            </dl>
            <Button variant="secondary" className="self-start" onClick={() => setEditing(true)}>
              {t('profile.edit')}
            </Button>
          </section>
          <MatchHistory />
          </>
        )}
      </main>
    </PageColumn>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="text-caption text-muted">{label}</dt>
      <dd className="text-body">{children}</dd>
    </div>
  );
}
