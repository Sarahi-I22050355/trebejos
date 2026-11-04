import { useI18n } from '../i18n/useI18n.js';
import { loadEnglish } from '../i18n/core.js';

// Los nombres de los idiomas se muestran siempre en su propio idioma: quien no entiende la interfaz debe poder encontrarlos.
const OPTIONS = [
  { code: 'es', short: 'ES', name: 'Español' },
  { code: 'en', short: 'EN', name: 'English' },
];

/** Selector de idioma de la interfaz (preferencia de este navegador; no se comparte con la sala ni con el rival). */
export default function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="group" aria-label={t('Idioma')} data-testid="lang-switch" className="hairline flex shrink-0 rounded-full bg-surface-container-low/60 p-0.5">
      {OPTIONS.map((option) => {
        const active = lang === option.code;
        return (
          <button
            key={option.code}
            type="button"
            lang={option.code}
            aria-pressed={active}
            aria-label={option.name}
            title={option.name}
            data-testid={`lang-${option.code}`}
            onPointerEnter={option.code === 'en' ? loadEnglish : undefined}
            onFocus={option.code === 'en' ? loadEnglish : undefined}
            onClick={async () => {
              if (option.code === 'en') await loadEnglish(); // casi siempre ya está: se precarga al acercar el cursor
              setLang(option.code);
            }}
            className={`rounded-full px-2.5 py-1 font-mono-move text-label-badge font-bold transition-colors ${
              active ? 'bg-primary-container text-on-primary-fixed' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {option.short}
          </button>
        );
      })}
    </div>
  );
}
