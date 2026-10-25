import Icon from './Icon.jsx';
import { NAME_MAX } from '../lib/name.js';

/** Campo de nombre de sesión con botón de dado (nombre aleatorio). */
export default function NameField({ id, value, onChange, onCommit, onDice, error, disabled, autoFocus }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative flex items-center">
        <input
          id={id}
          type="text"
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          data-autofocus
          maxLength={NAME_MAX + 8}
          autoComplete="off"
          spellCheck={false}
          placeholder="Escribe tu nombre…"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onCommit?.())}
          className={`field pr-14 font-mono-move text-body-md ${error ? 'field-error' : ''}`}
        />
        <button
          type="button"
          title="Sugerir un nombre aleatorio"
          aria-label="Sugerir un nombre aleatorio"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()} // no robar el foco: evita un commit prematuro
          onClick={onDice}
          className="absolute right-1.5 flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container-high text-primary transition-all hover:bg-primary-container hover:text-on-primary-fixed active:scale-95 disabled:opacity-40"
        >
          <Icon name="casino" />
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} className="flex items-center gap-1.5 text-body-sm text-magenta">
          <Icon name="error" className="!text-base" /> {error}
        </p>
      )}
    </div>
  );
}
