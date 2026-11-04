import Icon from '../Icon.jsx';
import { msg } from '../../i18n/core.js';
import { useI18n } from '../../i18n/useI18n.js';

const TONES = {
  info: { icon: 'school', ring: 'ring-white/10', text: 'text-on-surface', label: msg('Tutor Trebejos') },
  hint: { icon: 'lightbulb', ring: 'ring-secondary/60 shadow-glow-violet', text: 'text-on-surface', label: msg('Pista del tutor') },
  success: { icon: 'check_circle', ring: 'ring-primary-container/70 shadow-glow-cyan', text: 'text-on-surface', label: msg('¡Correcto!') },
  wrong: { icon: 'error', ring: 'ring-magenta/70 shadow-glow-magenta', text: 'text-on-surface', label: msg('Casi…') },
};
const ICON_TONE = {
  info: 'text-primary-container', hint: 'text-secondary', success: 'text-primary-container', wrong: 'text-magenta',
};

/** Mensaje del tutor: instrucciones, pistas y explicación de aciertos y errores. */
export default function TutorCard({ tone = 'info', children }) {
  const { t } = useI18n();
  const style = TONES[tone] ?? TONES.info;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="tutor"
      data-tone={tone}
      className={`flex items-start gap-3 rounded-xl bg-surface-container p-space-md ring-1 transition-all duration-300 ${style.ring}`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-container-lowest ${ICON_TONE[tone]}`}>
        <Icon name={style.icon} className="!text-2xl" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="font-headline-sm text-label-badge uppercase tracking-[0.08em] text-on-surface-variant">{t(style.label)}</span>
        <p className={`mt-0.5 text-body-md leading-relaxed ${style.text}`} data-testid="tutor-message">{children}</p>
      </div>
    </div>
  );
}
