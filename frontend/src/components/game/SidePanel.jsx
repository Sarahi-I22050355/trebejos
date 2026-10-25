import { useEffect, useState } from 'react';
import Icon from '../Icon.jsx';
import MoveList from './MoveList.jsx';
import ChatPanel from './ChatPanel.jsx';
import { useSession } from '../../context/SessionContext.jsx';
import { isMine } from '../../lib/chat.js';

function Tab({ id, active, onSelect, icon, children, badge }) {
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={active}
      aria-controls={`panel-${id}`}
      onClick={() => onSelect(id)}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 font-headline-sm text-label-badge uppercase tracking-wider transition-all ${
        active ? 'bg-surface-container-high text-primary shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
      }`}
    >
      <Icon name={icon} className="!text-base" />
      {children}
      {badge > 0 && (
        <span data-testid="chat-unread" className="min-w-[1.25rem] rounded-full bg-secondary px-1.5 text-center text-[10px] font-bold text-on-secondary-fixed">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

/** Panel lateral con pestañas: Movimientos y Chat (con contador de mensajes sin leer). */
export default function SidePanel({ room, viewPly, onView }) {
  const { name } = useSession();
  const [tab, setTab] = useState('moves');
  // Lo que ya había al entrar (historial) cuenta como leído.
  const [seenId, setSeenId] = useState(() => room.chat.at(-1)?.id ?? 0);

  const lastId = room.chat.at(-1)?.id ?? 0;
  useEffect(() => {
    if (tab === 'chat') setSeenId(lastId);
  }, [tab, lastId]);

  const unread = tab === 'chat' ? 0 : room.chat.filter((m) => m.id > seenId && !isMine(m, room, name)).length;

  return (
    <section className="glass flex min-h-0 flex-1 flex-col overflow-hidden" aria-label="Movimientos y chat">
      <div role="tablist" className="flex items-center gap-1 bg-surface-container-lowest/70 p-1.5">
        <Tab id="moves" active={tab === 'moves'} onSelect={setTab} icon="format_list_numbered">Movimientos</Tab>
        <Tab id="chat" active={tab === 'chat'} onSelect={setTab} icon="forum" badge={unread}>Chat</Tab>
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="flex min-h-0 flex-1 flex-col">
        {tab === 'moves' ? <MoveList moves={room.moves} viewPly={viewPly} onView={onView} /> : <ChatPanel room={room} />}
      </div>
    </section>
  );
}
