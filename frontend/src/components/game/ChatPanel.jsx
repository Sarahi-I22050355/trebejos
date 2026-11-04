import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import { useSession } from '../../context/SessionContext.jsx';
import { CHAT_MAX, formatTime, isMine } from '../../lib/chat.js';
import { errorText } from '../../i18n/errors.js';
import { useI18n } from '../../i18n/useI18n.js';

const NEAR_BOTTOM_PX = 80;

/** Etiqueta de rol del que escribe: color de piezas o espectador. */
function RoleChip({ role }) {
  const { t } = useI18n();
  if (role === 'spectator') {
    return (
      <span className="flex items-center gap-1 rounded bg-secondary-container/40 px-1 font-headline-sm text-[9px] font-bold uppercase tracking-wider text-secondary-fixed">
        <Icon name="visibility" className="!text-[11px]" /> {t('Espectador')}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded bg-surface-container-highest px-1 font-headline-sm text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">
      <span className={`h-2 w-2 rounded-full ${role === 'w' ? 'bg-white' : 'bg-surface-container-lowest ring-1 ring-white/50'}`} />
      {role === 'w' ? t('Blancas') : t('Negras')}
    </span>
  );
}

function Message({ message, mine }) {
  const { t } = useI18n();
  const nameTone = mine ? 'text-primary' : message.role === 'spectator' ? 'text-secondary' : 'text-magenta';
  return (
    <li className={`flex flex-col rounded-lg text-body-sm leading-snug ${mine ? 'bg-primary-container/10 p-1.5' : 'px-1.5'}`} data-testid="chat-message">
      <div className="flex flex-wrap items-center gap-1.5">
        <RoleChip role={message.role} />
        <span className={`font-headline-sm font-bold ${nameTone}`}>{message.name}</span>
        {mine && <span className="rounded bg-primary-container px-1 font-headline-sm text-[9px] font-bold uppercase text-on-primary-fixed">{t('Tú')}</span>}
        <span className="font-mono-move text-[10px] text-outline">{formatTime(message.ts)}</span>
      </div>
      {/* Texto plano: React lo escapa, así que ningún mensaje puede inyectar HTML. */}
      <p className="mt-0.5 break-words pl-1 text-on-surface">{message.text}</p>
    </li>
  );
}

export default function ChatPanel({ room }) {
  const { t } = useI18n();
  const { status, name, sendChat } = useSession();
  const listRef = useRef(null);
  const stuck = useRef(true); // el usuario está al final de la lista
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null); // el error del servidor, para mostrarlo en el idioma actual
  const [newBelow, setNewBelow] = useState(false);
  const messages = room.chat;
  const offline = status !== 'online';

  // Sigue el final de la conversación, salvo que el usuario esté leyendo mensajes anteriores.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const last = messages.at(-1);
    if (stuck.current || (last && isMine(last, room, name))) {
      el.scrollTop = el.scrollHeight;
      stuck.current = true;
      setNewBelow(false);
    } else if (last) {
      setNewBelow(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  function onScroll() {
    const el = listRef.current;
    stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (stuck.current) setNewBelow(false);
  }

  async function submit(e) {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || sending || offline) return;
    setSending(true);
    const res = await sendChat(clean);
    setSending(false);
    if (res.ok) {
      setText('');
      setError(null);
    } else {
      setError(res.error); // el texto se conserva para poder reenviarlo
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="chat-panel">
      <div className="relative min-h-0 flex-1">
        <ul ref={listRef} onScroll={onScroll} role="log" aria-live="polite" aria-label={t('Mensajes del chat')} className="flex h-full flex-col gap-2 overflow-y-auto p-3">
          {messages.length === 0 ? (
            <li className="m-auto max-w-[16rem] text-center text-body-sm text-outline">
              <Icon name="forum" className="mb-1 !text-3xl text-outline-variant" />
              <br />
              {room.you.color ? t('Aún no hay mensajes. ¡Saluda a tu rival!') : t('Aún no hay mensajes. ¡Saluda a los jugadores!')}
            </li>
          ) : (
            messages.map((m) => <Message key={m.id} message={m} mine={isMine(m, room, name)} />)
          )}
        </ul>
        {newBelow && (
          <button
            type="button"
            onClick={() => {
              listRef.current.scrollTop = listRef.current.scrollHeight;
              stuck.current = true;
              setNewBelow(false);
            }}
            className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-secondary-container px-3 py-1 text-body-sm font-semibold text-on-secondary-container shadow-glow-violet"
          >
            <Icon name="arrow_downward" className="!text-base" /> {t('Mensajes nuevos')}
          </button>
        )}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-1 border-t border-white/5 p-2">
        {error && (
          <p className="flex items-center gap-1.5 px-1 text-body-sm text-magenta" role="alert" data-testid="chat-error">
            <Icon name="error" className="!text-base" /> {errorText(error)}
          </p>
        )}
        <div className="flex items-center gap-1.5 rounded-xl bg-surface-container-lowest p-1.5 shadow-inner focus-within:ring-1 focus-within:ring-primary-container">
          <input
            value={text}
            onChange={(e) => (setText(e.target.value), setError(null))}
            maxLength={CHAT_MAX}
            disabled={offline}
            autoComplete="off"
            placeholder={offline ? t('Sin conexión…') : t('Escribe un mensaje…')}
            aria-label={t('Mensaje de chat')}
            className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-body-sm text-on-surface placeholder:text-outline focus:outline-none disabled:opacity-50"
          />
          {text.length > CHAT_MAX - 60 && (
            <span className={`font-mono-move text-[10px] ${text.length >= CHAT_MAX ? 'text-magenta' : 'text-outline'}`}>
              {text.length}/{CHAT_MAX}
            </span>
          )}
          <button
            type="submit"
            aria-label={t('Enviar mensaje')}
            disabled={!text.trim() || sending || offline}
            className="flex items-center justify-center rounded-lg bg-primary-container p-1.5 text-on-primary-fixed transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Icon name={sending ? 'progress_activity' : 'send'} className={`!text-base ${sending ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </form>
    </div>
  );
}
