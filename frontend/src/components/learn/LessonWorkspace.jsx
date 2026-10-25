// Espacio de trabajo de una lección: tablero interactivo, tutor y ejercicios.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chess } from 'chess.js';
import Board from '../game/Board.jsx';
import TutorCard from './TutorCard.jsx';
import Icon from '../Icon.jsx';
import { legalMovesFrom } from '../../lib/board.js';
import { demoArrows, evaluateMove, explainIllegal, hintSquares } from '../../lib/learn.js';
import { nextLesson } from '../../lib/lessons.js';
import { play, playLater, soundForSan } from '../../lib/sound.js';

const WRONG_REVERT_MS = 1700;

/** Una lección: reparte los ejercicios. Cada ejercicio es un componente nuevo (`key`) con su propio estado. */
export default function LessonWorkspace({ lesson }) {
  const [stepIndex, setStepIndex] = useState(0);
  return <Exercise key={`${lesson.id}:${stepIndex}`} lesson={lesson} stepIndex={stepIndex} onStep={setStepIndex} />;
}

function Exercise({ lesson, stepIndex, onStep }) {
  const step = lesson.steps[stepIndex];
  const [fen, setFen] = useState(step.fen);
  const [lastMove, setLastMove] = useState(null);
  const [tutor, setTutor] = useState({ tone: 'info', text: step.prompt });
  const [done, setDone] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [showMoves, setShowMoves] = useState(false);
  const [marks, setMarks] = useState([]);
  const timers = useRef([]);
  const boardWrap = useRef(null);

  const later = (fn, ms) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  // Al cambiar de ejercicio el tablero debe quedar a la vista: el botón "Siguiente" está debajo de él y,
  // con la página desplazada, la parte de arriba quedaría tapada por la cabecera fija.
  useEffect(() => {
    if (stepIndex === 0) return; // al abrir una lección ya se parte de arriba (ScrollToTop)
    const el = boardWrap.current;
    if (!el) return;
    const { top, bottom } = el.getBoundingClientRect();
    if (top < 80 || bottom > window.innerHeight) el.scrollIntoView({ block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const atStart = fen === step.fen;
  const possible = useMemo(() => (step.demo ? legalMovesFrom(step.fen, step.demo).length : null), [step]);
  const arrows = useMemo(() => (showMoves && atStart && step.demo ? demoArrows(step.fen, step.demo) : []), [showMoves, atStart, step]);
  const following = nextLesson(lesson.id);

  function reset() {
    clearTimers();
    setFen(step.fen);
    setLastMove(null);
    setTutor({ tone: 'info', text: step.prompt });
    setDone(false);
    setReverting(false);
    setMarks([]);
  }

  function handleMove(from, to, promotion) {
    const result = evaluateMove(step, fen, { from, to, promotion });
    if (!result.legal) return;
    clearTimers();
    setFen(result.fen);
    setLastMove({ from, to });
    setShowMoves(false);
    let san = '';
    try {
      san = new Chess(fen).move({ from, to, promotion }).san;
    } catch {
      /* jugada ya validada arriba; solo se usa para elegir el sonido */
    }
    play(soundForSan(san));
    if (result.success) {
      timers.current.push(playLater('success', 260));
      setTutor({ tone: 'success', text: result.message });
      setMarks([{ square: to, tone: 'success' }]);
      setDone(true);
    } else {
      // Jugada legal pero no es lo pedido: se explica y el tablero vuelve atrás para intentarlo de nuevo.
      setTutor({ tone: 'wrong', text: result.message });
      setMarks([{ square: to, tone: 'wrong' }]);
      setReverting(true);
      timers.current.push(playLater('error', 260));
      later(() => {
        setFen(step.fen);
        setLastMove(null);
        setMarks([]);
        setReverting(false);
      }, WRONG_REVERT_MS);
    }
  }

  function handleIllegal(from, to) {
    play('error');
    setTutor({ tone: 'wrong', text: explainIllegal(fen, from, to, step.notes) });
    if (to) {
      setMarks([{ square: to, tone: 'wrong' }]);
      later(() => setMarks([]), 900);
    }
  }

  function showHint() {
    setTutor({ tone: 'hint', text: step.hint });
    setMarks(hintSquares(step).map((square) => ({ square, tone: 'hint' })));
  }

  const lastStep = stepIndex === lesson.steps.length - 1;

  return (
    <div className="glass relative flex flex-col gap-space-md overflow-hidden p-space-md shadow-xl lg:p-space-lg" data-testid="workspace">
      <div className="flex flex-wrap items-center justify-between gap-space-sm rounded-lg bg-surface-container px-space-md py-space-sm">
        <div className="flex items-center gap-space-sm">
          <Icon name="grid_view" className="text-primary-container" />
          <span className="font-headline-sm text-label-badge uppercase tracking-wider text-on-surface">Simulador · {lesson.title}</span>
          <span className="badge hidden bg-primary-container/20 text-primary sm:inline-flex">{lesson.tag}</span>
        </div>
        <div className="flex items-center gap-space-xs">
          {possible != null && (
            <span className="rounded bg-surface-container-highest px-space-sm py-0.5 font-mono-move text-body-sm text-primary" data-testid="possible">
              {possible} {possible === 1 ? 'movimiento posible' : 'movimientos posibles'}
            </span>
          )}
          <button type="button" onClick={reset} className="flex items-center gap-1 rounded bg-surface-container-highest px-space-sm py-1 font-mono-move text-body-sm text-on-surface transition-colors hover:bg-surface-bright" data-testid="btn-reset">
            <Icon name="refresh" className="!text-base" /> Reiniciar
          </button>
        </div>
      </div>

      <div ref={boardWrap} className="mx-auto w-full" style={{ maxWidth: 'min(100%, 540px, max(300px, calc(100dvh - 27rem)))' }}>
        <Board
          fen={fen}
          orientation="w"
          lastMove={lastMove}
          interactive={!done && !reverting}
          myColor="w"
          selectable={step.selectable ?? null}
          demoSquare={showMoves && atStart ? step.demo : null}
          arrows={arrows}
          marks={marks}
          onMove={handleMove}
          onIllegal={handleIllegal}
        />
      </div>

      <TutorCard tone={tutor.tone}>{tutor.text}</TutorCard>

      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex flex-wrap items-center gap-space-xs">
          {step.demo && (
            <button type="button" onClick={() => setShowMoves((v) => !v)} aria-pressed={showMoves} data-testid="btn-demo" className="flex items-center gap-2 rounded-lg bg-surface-container px-space-md py-2 text-body-md font-semibold text-primary transition-all hover:bg-surface-bright aria-pressed:bg-primary-container/20 aria-pressed:shadow-glow-cyan">
              <Icon name={showMoves ? 'visibility_off' : 'visibility'} className="!text-base" /> {showMoves ? 'Ocultar movimientos' : 'Ver movimientos'}
            </button>
          )}
          <button type="button" onClick={showHint} data-testid="btn-hint" className="flex items-center gap-2 rounded-lg bg-surface-container px-space-md py-2 text-body-md font-semibold text-secondary transition-all hover:bg-surface-bright">
            <Icon name="lightbulb" className="!text-base" /> Pista
          </button>
        </div>

        <div className="flex items-center gap-space-sm">
          {lesson.steps.length > 1 && (
            <div className="flex items-center gap-1.5" role="group" aria-label="Ejercicios">
              <span className="mr-1 font-mono-move text-body-sm text-on-surface-variant" data-testid="step-counter">Ejercicio {stepIndex + 1} de {lesson.steps.length}</span>
              {lesson.steps.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Ir al ejercicio ${i + 1}`}
                  aria-current={i === stepIndex ? 'step' : undefined}
                  onClick={() => onStep(i)}
                  className={`h-2.5 rounded-full transition-all ${i === stepIndex ? 'w-6 bg-primary-container shadow-[0_0_8px_rgba(0,240,255,0.6)]' : 'w-2.5 bg-surface-container-highest hover:bg-surface-bright'}`}
                />
              ))}
            </div>
          )}
          {!lastStep ? (
            <button type="button" onClick={() => onStep(stepIndex + 1)} data-testid="btn-next-step" className={`btn btn-sm ${done ? 'btn-primary' : 'btn-secondary'}`}>
              Siguiente ejercicio <Icon name="arrow_forward" className="!text-base" />
            </button>
          ) : following ? (
            <Link to={`/aprender/${following.id}`} data-testid="btn-next-lesson" className={`btn btn-sm ${done ? 'btn-primary' : 'btn-secondary'}`}>
              Siguiente lección: {following.title.replace(/^(El|La) /, '')} <Icon name="arrow_forward" className="!text-base" />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
