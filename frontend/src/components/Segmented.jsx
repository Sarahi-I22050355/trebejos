import Icon from './Icon.jsx';

/**
 * Selector de una opción entre varias (radiogroup accesible).
 * options: [{ value, label, icon?, description? }]
 */
export default function Segmented({ label, options, value, onChange, columns = options.length, compact = false }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`flex flex-col items-center justify-center gap-1 rounded-lg border text-center transition-all ${
              compact ? 'px-2 py-2' : 'px-3 py-3'
            } ${
              active
                ? 'border-primary-container bg-primary-container/10 text-primary shadow-glow-cyan'
                : 'border-white/10 bg-surface-container-lowest text-on-surface-variant hover:border-white/25 hover:text-on-surface'
            }`}
          >
            {opt.icon && <Icon name={opt.icon} className={active ? 'text-primary-container' : ''} />}
            <span className={`font-headline-sm ${compact ? 'text-body-sm' : 'text-body-md'} font-semibold`}>{opt.label}</span>
            {opt.description && <span className="text-body-sm text-outline">{opt.description}</span>}
          </button>
        );
      })}
    </div>
  );
}
