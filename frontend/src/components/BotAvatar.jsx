import Icon from './Icon.jsx';

/** Avatar del bot: robot sobre degradado violeta → cian (sin imágenes). */
export default function BotAvatar({ size = 44, className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-lg text-surface-container-lowest ${className}`}
      style={{ width: size, height: size, backgroundImage: 'linear-gradient(135deg, #A855F7, #00F0FF)' }}
    >
      <Icon name="smart_toy" className="" />
    </span>
  );
}
