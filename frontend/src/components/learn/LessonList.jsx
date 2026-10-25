import { Link } from 'react-router-dom';
import Icon from '../Icon.jsx';
import Piece from '../game/Piece.jsx';
import { GROUPS, LESSONS } from '../../lib/lessons.js';

function LessonIcon({ lesson, active }) {
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container ${active ? 'text-primary-container' : 'text-on-surface-variant'}`}>
      {lesson.piece ? <Piece type={lesson.piece} color="w" glow={false} className="h-7 w-7" /> : <Icon name={lesson.icon} className="!text-2xl" />}
    </span>
  );
}

/** Lista de lecciones: en escritorio una columna agrupada; en móvil, una fila de pastillas desplazable. */
export default function LessonList({ activeId }) {
  return (
    <>
      <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden" aria-label="Lecciones">
        {LESSONS.map((l) => (
          <Link
            key={l.id}
            to={`/aprender/${l.id}`}
            aria-current={l.id === activeId ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 font-headline-sm text-body-sm transition-colors ${
              l.id === activeId ? 'bg-primary-container text-on-primary-fixed' : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {l.piece && <Piece type={l.piece} color={l.id === activeId ? 'b' : 'w'} glow={false} className="h-5 w-5" />}
            {l.title}
          </Link>
        ))}
      </nav>

      <aside className="hidden flex-col gap-space-md lg:flex" aria-label="Lecciones">
        {GROUPS.map((group) => (
          <div key={group.id} className="flex flex-col gap-space-sm">
            <div className="px-space-xs font-headline-sm text-label-badge uppercase tracking-widest text-on-surface-variant">{group.label}</div>
            <ul className="flex flex-col gap-space-xs">
              {LESSONS.filter((l) => l.group === group.id).map((l) => {
                const active = l.id === activeId;
                return (
                  <li key={l.id}>
                    <Link
                      to={`/aprender/${l.id}`}
                      aria-current={active ? 'page' : undefined}
                      data-testid={`lesson-${l.id}`}
                      className={`group relative flex items-center justify-between gap-space-sm rounded-lg p-space-sm pl-space-md transition-all ${
                        active ? 'bg-surface-container-high shadow-glow-cyan' : 'bg-surface-container-low hover:bg-surface-container'
                      }`}
                    >
                      {active && <span className="absolute inset-y-0 left-0 w-1.5 rounded-l-lg bg-gradient-to-b from-primary-container to-secondary" />}
                      <span className="flex min-w-0 items-center gap-space-sm">
                        <LessonIcon lesson={l} active={active} />
                        <span className="flex min-w-0 flex-col">
                          <span className="flex flex-wrap items-center gap-x-2">
                            <span className={`font-headline-sm text-headline-sm ${active ? 'text-primary' : 'text-on-surface'}`}>{l.title}</span>
                            <span className={`badge ${active ? 'bg-primary-container/20 text-primary' : 'bg-surface-container-highest text-on-surface-variant'}`}>{l.tag}</span>
                          </span>
                          <span className="line-clamp-1 text-body-sm text-on-surface-variant">{l.blurb}</span>
                        </span>
                      </span>
                      <Icon name="arrow_forward_ios" className={`!text-base ${active ? 'text-primary-container' : 'text-outline-variant group-hover:text-primary'}`} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </aside>
    </>
  );
}
