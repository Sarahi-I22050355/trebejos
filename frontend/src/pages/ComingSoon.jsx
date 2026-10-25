import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';

export default function ComingSoon({ icon, title, text }) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-space-xl">
      <div className="glass-raised flex w-full flex-col items-center gap-space-md p-space-xl text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-lowest text-primary-container shadow-glow-cyan">
          <Icon name={icon} className="!text-4xl" />
        </span>
        <h1 className="font-headline-lg text-headline-lg text-on-surface">{title}</h1>
        <p className="text-body-md text-on-surface-variant">{text}</p>
        <Link to="/" className="btn btn-secondary btn-sm mt-2">
          <Icon name="home" className="!text-lg" /> Volver al inicio
        </Link>
      </div>
    </div>
  );
}
