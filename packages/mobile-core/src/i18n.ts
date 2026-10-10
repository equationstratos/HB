import { getLocales } from 'expo-localization';
import i18next, { type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Traductions : le français est la langue de référence, les autres langues viendront
 * compléter les ressources sans toucher au code des écrans.
 */
export function initI18n(resources: Resource): typeof i18next {
  if (i18next.isInitialized) return i18next;
  const device = getLocales()[0]?.languageCode ?? 'fr';
  void i18next.use(initReactI18next).init({
    resources,
    lng: device in resources ? device : 'fr',
    fallbackLng: 'fr',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return i18next;
}
