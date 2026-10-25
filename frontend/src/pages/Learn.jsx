import { Link, Navigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import LessonList from '../components/learn/LessonList.jsx';
import LessonWorkspace from '../components/learn/LessonWorkspace.jsx';
import PracticeStart from '../components/learn/PracticeStart.jsx';
import { LESSONS, getLesson, nextLesson } from '../lib/lessons.js';

export default function Learn() {
  const { lessonId } = useParams();
  const lesson = lessonId ? getLesson(lessonId) : LESSONS[0];
  if (!lesson) return <Navigate to="/aprender" replace />;
  const following = nextLesson(lesson.id);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-space-lg px-4 py-space-lg md:px-margin">
      <section className="glass relative overflow-hidden px-space-lg py-space-md shadow-xl">
        <div className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-primary-container/10 blur-3xl" />
        <div className="relative flex flex-col gap-1">
          <span className="badge w-fit bg-surface-container-highest text-primary-container">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-container" /> Módulo de entrenamiento
          </span>
          <h1 className="font-headline-lg text-headline-lg tracking-tight text-on-surface md:text-headline-xl">Aprende a jugar</h1>
          <p className="max-w-3xl text-body-md text-on-surface-variant">
            Mueve las piezas sobre el tablero: el tutor te dirá si el movimiento es válido y por qué.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-space-lg lg:grid-cols-12">
        <div className="flex flex-col gap-space-md lg:col-span-4">
          <LessonList activeId={lesson.id} />
          <div className="flex items-start gap-space-sm rounded-lg bg-surface-container p-space-md">
            <Icon name="lock_open" className="text-primary-container" />
            <div>
              <div className="font-headline-sm text-label-badge uppercase tracking-wider text-on-surface">Todo abierto</div>
              <p className="text-body-sm text-on-surface-variant">Sin cuentas ni bloqueos: elige la lección que quieras y avanza a tu ritmo.</p>
            </div>
          </div>
        </div>

        <section className="flex flex-col gap-space-lg lg:col-span-8" aria-label={lesson.title}>
          {lesson.practice && (
            <h2 className="flex flex-wrap items-center gap-2 font-headline-lg text-headline-lg text-on-surface">
              {lesson.title} <span className="badge bg-primary-container/20 text-primary">{lesson.tag}</span>
            </h2>
          )}

          {lesson.practice ? <PracticeStart /> : <LessonWorkspace key={lesson.id} lesson={lesson} />}

          <div className="grid grid-cols-1 gap-space-md md:grid-cols-2">
            <article className="glass flex flex-col gap-space-sm p-space-md shadow-md">
              <div className="flex items-center gap-space-sm">
                <span className="rounded-lg bg-primary-container/20 p-2 text-primary-container"><Icon name="menu_book" /></span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">{lesson.practice ? 'Cómo funciona' : 'Cómo funciona esta regla'}</h3>
              </div>
              {lesson.intro.map((p) => (
                <p key={p.slice(0, 24)} className="text-body-md leading-relaxed text-on-surface-variant">{p}</p>
              ))}
              <dl className="mt-auto grid gap-1 pt-space-xs font-mono-move text-body-sm">
                {lesson.facts.map(([k, v]) => (
                  <div key={k} className="flex flex-wrap justify-between gap-x-3 border-t border-white/5 pt-1">
                    <dt className="text-secondary-fixed-dim">{k}</dt>
                    <dd className="text-right text-on-surface-variant">{v}</dd>
                  </div>
                ))}
              </dl>
            </article>
            <article className="glass flex flex-col gap-space-sm p-space-md shadow-md">
              <div className="flex items-center gap-space-sm">
                <span className="rounded-lg bg-secondary-container/40 p-2 text-secondary"><Icon name="lightbulb" /></span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Consejo</h3>
              </div>
              <p className="text-body-md leading-relaxed text-on-surface-variant">{lesson.tip}</p>
            </article>
          </div>

          {!lesson.practice && (
            <div className="flex flex-col items-center justify-between gap-space-md rounded-xl bg-gradient-to-r from-surface-container via-surface-container-high to-surface-container p-space-lg shadow-xl sm:flex-row">
              <div className="flex items-center gap-space-md">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-container text-on-primary-fixed shadow-glow-cyan">
                  <Icon name="sports_esports" className="!text-3xl" />
                </span>
                <div className="flex flex-col">
                  <span className="font-headline-sm text-headline-sm text-on-surface">¿Listo para jugar de verdad?</span>
                  <span className="text-body-md text-on-surface-variant">Practica una partida contra el bot fácil, con pistas del tutor.</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap justify-center gap-space-sm sm:flex-nowrap [&>a]:whitespace-nowrap">
                {following && following.id !== 'practica' && (
                  <Link to={`/aprender/${following.id}`} className="btn btn-secondary btn-sm">Siguiente lección</Link>
                )}
                <Link to="/aprender/practica" className="btn btn-primary btn-sm">Partida guiada</Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
