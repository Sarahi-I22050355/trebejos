import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { useI18n } from '../i18n/useI18n.js';

export default function ComingSoon({ icon, title, text }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-space-xl">
      <div className="glass-raised flex w-full flex-col items-center gap-space-md p-space-xl text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-lowest text-primary-container shadow-glow-cyan">
          <Icon name={icon} className="!text-4xl" />
        </span>
        <h1 className="font-headline-lg text-headline-lg text-on-surface">{t(title)}</h1>
        <p className="text-body-md text-on-surface-variant">{t(text)}</p>
        <Link to="/" className="btn btn-secondary btn-sm mt-2">
          <Icon name="home" className="!text-lg" /> {t('Volver al inicio')}
        </Link>
      </div>
    </div>
  );
}
