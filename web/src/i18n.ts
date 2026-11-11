import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Placeholder catalogue; the bilingual Voice & Tone catalogue replaces it in Story 1.3.
const resources = {
  ml: { translation: { shell: { tagline: 'സ്കാഫോൾഡ് പ്രവർത്തിക്കുന്നു' } } },
  en: { translation: { shell: { tagline: 'Scaffold is running' } } },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: 'ml',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
