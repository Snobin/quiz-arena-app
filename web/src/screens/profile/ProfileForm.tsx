import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../design/Button.tsx';
import i18n, { uiLanguage, type Language, type MessageKey } from '../../i18n/index.ts';
import { DISTRICT_CODES, EXAM_LEVELS, districtKey, examLevelKey } from '../../profile/districts.ts';
import { validateName } from '../../profile/nameRule.ts';
import { saveProfile, type FieldErrors, type ProfileForm as Values } from '../../profile/profileStore.ts';
import { announce } from '../../shell/announce.ts';

type Props = {
  initial: Values;
  /** Called after a successful save (the profile is stored and the token refreshed). */
  onSaved: () => void;
  /** Edit only: Back without saving. The form also reverts a language preview. */
  onCancel?: () => void;
};

const ORDER = ['displayName', 'district', 'examLevel', 'language'] as const;
type Field = (typeof ORDER)[number];

function clientErrors(values: Values): FieldErrors {
  const errors: FieldErrors = {};
  const name = validateName(values.displayName);
  if (!name.ok) errors.displayName = name.code;
  if (!DISTRICT_CODES.some((code) => code === values.district)) errors.district = 'district';
  if (!EXAM_LEVELS.some((level) => level === values.examLevel)) errors.examLevel = 'examLevel';
  return errors;
}

/**
 * The profile form, used for first-time setup and for editing (FR6): visible labels, native selects,
 * one primary Save. Changing the language previews the whole UI at once, keeps focus on the field and
 * announces it in the new language; nothing is stored until Save. A failed validation shows ⚠ plus
 * text under each field (linked with aria-describedby, aria-invalid) and focuses the first invalid one.
 */
export function ProfileForm({ initial, onSaved, onCancel }: Props) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [general, setGeneral] = useState(false);
  const original = useRef<Language>(uiLanguage());
  const saved = useRef(false);
  const refs = useRef<Partial<Record<Field, HTMLElement | null>>>({});
  const ids = { displayName: useId(), district: useId(), examLevel: useId(), language: useId() };

  // Leaving without saving discards a language preview.
  useEffect(
    () => () => {
      if (!saved.current && uiLanguage() !== original.current) void i18n.changeLanguage(original.current);
    },
    [],
  );

  const set = (field: Field, value: string) => setValues((current) => ({ ...current, [field]: value }));

  const changeLanguage = (value: string) => {
    const next: Language = value === 'en' ? 'en' : 'ml';
    set('language', next);
    // The UI switches at once (strings, <html lang>, document.title); the select keeps focus.
    void i18n.changeLanguage(next).then(() => announce(i18n.getFixedT(next)('profile.languageChanged')));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setGeneral(false);
    const local = clientErrors(values);
    if (Object.keys(local).length > 0) {
      setErrors(local);
      refs.current[ORDER.find((f) => local[f]) as Field]?.focus();
      return;
    }
    setSaving(true);
    const result = await saveProfile(values);
    setSaving(false);
    if (result.ok) {
      saved.current = true;
      setErrors({});
      onSaved();
      return;
    }
    setErrors(result.fieldErrors);
    setGeneral(result.general);
    const first = ORDER.find((f) => result.fieldErrors[f]);
    if (first) refs.current[first]?.focus();
  };

  const errorText = (field: Field): string | null => {
    const code = errors[field];
    if (!code) return null;
    return t((field === 'displayName' ? `profile.error.${code}` : `profile.error.${field}`) as MessageKey);
  };

  const fieldClass =
    'min-h-target-min w-full rounded-md border-[1.5px] border-ink bg-card px-3 py-2 text-body aria-[invalid=true]:border-brick';

  const field = (name: Field, label: MessageKey, control: (props: Record<string, unknown>) => React.ReactNode) => {
    const text = errorText(name);
    const errorId = `${ids[name]}-error`;
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={ids[name]} className="text-body font-semibold">
          {t(label)}
        </label>
        {control({
          id: ids[name],
          'aria-invalid': text ? 'true' : undefined,
          'aria-describedby': text ? errorId : undefined,
          className: fieldClass,
          ref: (el: HTMLElement | null) => {
            refs.current[name] = el;
          },
        })}
        {text ? (
          <p id={errorId} className="text-caption font-semibold text-brick">
            <span aria-hidden="true">⚠ </span>
            {text}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
      {field('displayName', 'profile.field.name', (props) => (
        <input
          {...props}
          type="text"
          autoComplete="nickname"
          value={values.displayName}
          onChange={(event) => set('displayName', event.target.value)}
        />
      ))}
      {field('district', 'profile.field.district', (props) => (
        <select {...props} value={values.district} onChange={(event) => set('district', event.target.value)}>
          <option value="">{t('profile.choose')}</option>
          {DISTRICT_CODES.map((code) => (
            <option key={code} value={code}>
              {t(districtKey(code))}
            </option>
          ))}
        </select>
      ))}
      {field('examLevel', 'profile.field.level', (props) => (
        <select {...props} value={values.examLevel} onChange={(event) => set('examLevel', event.target.value)}>
          <option value="">{t('profile.choose')}</option>
          {EXAM_LEVELS.map((level) => (
            <option key={level} value={level}>
              {t(examLevelKey(level))}
            </option>
          ))}
        </select>
      ))}
      {field('language', 'profile.field.language', (props) => (
        <select {...props} value={values.language} onChange={(event) => changeLanguage(event.target.value)}>
          <option value="ml">{t('profile.language.ml')}</option>
          <option value="en">{t('profile.language.en')}</option>
        </select>
      ))}
      {general ? (
        <p role="alert" className="text-caption font-semibold text-brick">
          <span aria-hidden="true">⚠ </span>
          {t('profile.error.save')}
        </p>
      ) : null}
      {saving ? (
        <Button type="submit" className="w-full" disabled disabledReason={t('profile.saving')}>
          {t('profile.save')}
        </Button>
      ) : (
        <Button type="submit" className="w-full">
          {t('profile.save')}
        </Button>
      )}
      {onCancel ? (
        <Button variant="secondary" className="w-full" onClick={onCancel}>
          {t('common.back')}
        </Button>
      ) : null}
    </form>
  );
}
