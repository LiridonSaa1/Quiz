import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en';
import sq from './locales/sq';
import fr from './locales/fr';
import de from './locales/de';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      sq: { translation: sq },
      fr: { translation: fr },
      de: { translation: de },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'sq', 'fr', 'de'],
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'quizmaster_lang',
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
