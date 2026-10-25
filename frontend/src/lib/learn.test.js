import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { GROUPS, LESSONS, getLesson, nextLesson } from './lessons.js';
import { demoArrows, describeMoveEs, evaluateMove, explainIllegal, hintSquares } from './learn.js';
import { kingSquare } from './board.js';

const allSteps = LESSONS.flatMap((l) => l.steps.map((step, i) => ({ lesson: l, step, i })));
const label = ({ lesson, i }) => `${lesson.id} · ejercicio ${i + 1}`;

/** Todas las jugadas legales de las piezas señaladas, con las coronaciones expandidas. */
function candidateMoves(step) {
  const game = new Chess(step.fen);
  return game.moves({ verbose: true }).filter((m) => !step.selectable || step.selectable.includes(m.from));
}

describe('contenido de las lecciones', () => {
  test('ids únicos, grupos válidos y encadenado de siguiente lección', () => {
    const ids = LESSONS.map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length);
    const groups = new Set(GROUPS.map((g) => g.id));
    for (const l of LESSONS) assert.ok(groups.has(l.group), `grupo de ${l.id}`);
    assert.equal(getLesson('caballo').title, 'El caballo');
    assert.equal(getLesson('no-existe'), null);
    assert.equal(nextLesson(ids[0]).id, ids[1]);
    assert.equal(nextLesson(ids.at(-1)), null);
  });

  test('están las 6 piezas y las reglas especiales pedidas', () => {
    const ids = LESSONS.map((l) => l.id);
    for (const id of ['peon', 'torre', 'caballo', 'alfil', 'dama', 'rey', 'enroque', 'al-paso', 'coronacion', 'jaque-mate', 'ahogado', 'practica']) {
      assert.ok(ids.includes(id), `falta la lección ${id}`);
    }
  });

  test('sin progreso, bloqueos ni ELO en ninguna lección', () => {
    const text = JSON.stringify(LESSONS, (key, value) => (typeof value === 'function' ? value({ promotion: 'q' }) : value));
    for (const banned of [/\belo\b/i, /bloquead/i, /desbloque/i, /\brango\b/i, /\bnivel aprendiz/i, /torneo/i, /puntos de entrenamiento/i]) {
      assert.doesNotMatch(text, banned);
    }
    for (const l of LESSONS) assert.ok(!('locked' in l) && !('unlockAt' in l) && !('progress' in l));
  });

  test('cada lección tiene explicación, datos y consejo', () => {
    for (const l of LESSONS) {
      assert.ok(l.intro.length >= 1 && l.intro.every((p) => p.length > 30), l.id);
      assert.ok(l.facts.length >= 3, l.id);
      assert.ok(l.tip.length > 20, l.id);
      assert.ok(l.piece || l.icon, `${l.id} necesita un ícono`);
    }
  });
});

describe('cada ejercicio es válido y tiene solución', () => {
  for (const entry of allSteps) {
    const { step } = entry;
    test(label(entry), () => {
      const game = new Chess(step.fen); // lanza si el FEN es inválido
      assert.equal(game.turn(), 'w', 'los ejercicios los resuelven las blancas');
      // El rey rival no puede estar ya en jaque (posición imposible).
      const enemyKing = kingSquare(step.fen, 'b');
      assert.equal(game.isAttacked(enemyKing, 'w'), false, 'el rey negro ya está en jaque al empezar');
      assert.ok(!game.isCheckmate() && !game.isStalemate(), 'la posición no puede estar ya en mate o ahogado');
      assert.ok(step.prompt.length > 10 && step.hint.length > 5 && step.success, 'faltan textos');

      for (const sq of step.selectable ?? []) {
        const piece = game.get(sq);
        assert.ok(piece && piece.color === 'w', `${sq} debe tener una pieza blanca`);
      }
      if (step.demo) assert.ok(game.moves({ square: step.demo }).length > 0, 'la demostración no tiene movimientos');

      const moves = candidateMoves(step);
      assert.ok(moves.length > 0, 'las piezas señaladas no tienen jugadas');
      const winners = moves.filter((m) => evaluateMove(step, step.fen, { from: m.from, to: m.to, promotion: m.promotion }).success);
      assert.ok(winners.length > 0, 'el ejercicio no tiene solución');
      if (step.goal.type === 'moves') {
        for (const uci of step.goal.moves) assert.ok(moves.some((m) => m.from + m.to === uci), `${uci} no es legal`);
      }
      // Las casillas de la pista existen en el tablero.
      for (const sq of hintSquares(step)) assert.match(sq, /^[a-h][1-8]$/);
    });
  }

  test('cifras concretas de las demostraciones', () => {
    const count = (id, i) => new Chess(getLesson(id).steps[i].fen).moves({ square: getLesson(id).steps[i].demo }).length;
    assert.equal(count('caballo', 0), 8); // rodeado de peones y aun así 8 saltos
    assert.equal(count('rey', 0), 8);
    assert.equal(count('rey', 1), 5); // la torre negra le quita 3 casillas
    assert.equal(count('torre', 0), 14);
    assert.equal(count('peon', 0), 2);
  });

  test('la captura al paso tiene una única solución y en el ahogado Df7 no vale', () => {
    const ep = getLesson('al-paso').steps[0];
    assert.equal(candidateMoves(ep).filter((m) => evaluateMove(ep, ep.fen, m).success).length, 1);
    const mate = getLesson('ahogado').steps[0];
    const solutions = candidateMoves(mate).filter((m) => evaluateMove(mate, mate.fen, m).success).map((m) => m.from + m.to);
    assert.ok(solutions.includes('b7g7'), 'Dg7 es mate');
    assert.ok(!solutions.includes('b7f7'), 'Df7 es ahogado y no debe contar como solución');
  });
});

describe('evaluar jugadas', () => {
  test('captura al paso, coronación y mate', () => {
    const ep = getLesson('al-paso').steps[0];
    const r = evaluateMove(ep, ep.fen, { from: 'e5', to: 'd6' });
    assert.equal(r.success, true);
    assert.match(r.message, /capturó al paso/);
    assert.doesNotMatch(r.fen.split(' ')[0], /3p4/); // el peón negro de d5 ya no está

    const promo = getLesson('coronacion').steps[0];
    const p = evaluateMove(promo, promo.fen, { from: 'e7', to: 'e8', promotion: 'n' });
    assert.equal(p.success, true);
    assert.match(p.message, /se coronó a caballo/);
    assert.match(p.message, /el caballo nueva|el caballo nuevo|nueva/);

    const mate = getLesson('jaque-mate').steps[1];
    assert.equal(evaluateMove(mate, mate.fen, { from: 'a1', to: 'a8' }).success, true);
  });

  test('una jugada legal que no cumple el objetivo explica qué se pedía', () => {
    const step = getLesson('peon').steps[1];
    const r = evaluateMove(step, step.fen, { from: 'a1', to: 'a2' }); // mueve el rey: legal pero no es lo pedido
    assert.equal(r.legal, true);
    assert.equal(r.success, false);
    assert.match(r.message, /no es lo que pide/);
    assert.match(r.message, /d5/);
  });

  test('ahogado y jaque que no es mate se distinguen', () => {
    const step = getLesson('ahogado').steps[0];
    const stalemate = evaluateMove(step, step.fen, { from: 'b7', to: 'f7' });
    assert.equal(stalemate.success, false);
    assert.match(stalemate.message, /ahogado/i);

    const m = getLesson('jaque-mate').steps[1];
    const checkOnly = { ...m, fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1' };
    const r = evaluateMove(checkOnly, checkOnly.fen, { from: 'a1', to: 'a8' });
    assert.equal(r.success, false);
    assert.match(r.message, /Es jaque, pero/);
  });

  test('jugada imposible: legal=false', () => {
    const step = getLesson('torre').steps[0];
    assert.equal(evaluateMove(step, step.fen, { from: 'd4', to: 'e6' }).legal, false);
  });

  test('textos de jugadas', () => {
    const g = new Chess();
    assert.equal(describeMoveEs(g.move('Nf3')), 'El caballo saltó de g1 a f3.');
    const c = new Chess('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    assert.match(describeMoveEs(c.move('O-O')), /enrocó corto/);
  });
});

describe('explicar por qué una jugada es ilegal', () => {
  const START = new Chess().fen();
  const why = (fen, from, to, notes) => explainIllegal(fen, from, to, notes);

  test('cada pieza recuerda su regla', () => {
    assert.match(why(START, 'b1', 'b3'), /caballo.*en L/);
    assert.match(why(START, 'c1', 'c3'), /alfil.*diagonal/i); // c3 está ocupada por un peón propio?
  });

  test('piezas propias y pieza ajena', () => {
    assert.match(why(START, 'a1', 'a2'), /propias piezas/);
    assert.match(why(START, 'a8', 'a6'), /no es tuya/);
    assert.match(why(START, 'e4', 'e5'), /Selecciona primero/);
    assert.match(why(START, 'e2', null), /señalada/);
  });

  test('piezas deslizantes bloqueadas', () => {
    assert.match(why(START, 'a1', 'a5'), /Hay una pieza en el camino \(a2\).*la torre/);
    assert.match(why(START, 'd1', 'd5'), /camino \(d2\).*la dama/);
    assert.match(why('7k/8/8/8/8/8/1P6/B6K w - - 0 1', 'a1', 'c3'), /camino \(b2\)/);
  });

  test('peones', () => {
    const fen = '7k/8/8/3pp3/4P3/8/8/K7 w - - 0 1';
    assert.match(why(fen, 'e4', 'e5'), /no captura de frente/);
    assert.match(why(fen, 'e4', 'f5'), /solo se mueve en diagonal para capturar/);
    assert.match(why(fen, 'e4', 'e3'), /nunca retroceden/);
    assert.match(why(fen, 'e4', 'e6'), /dos casillas en su primer movimiento|Hay una pieza/);
    assert.match(why(START, 'e2', 'e5'), /como máximo dos casillas/);
    assert.match(why('7k/8/8/8/8/4p3/4P3/K7 w - - 0 1', 'e2', 'e4'), /camino|bloque/i);
  });

  test('el rey no puede ir a una casilla atacada', () => {
    const step = getLesson('rey').steps[1];
    assert.match(why(step.fen, 'e4', 'e5'), /atacada por una pieza rival/);
    assert.match(why(step.fen, 'e4', 'e6'), /una casilla/);
  });

  test('una pieza clavada o que deja al rey en jaque', () => {
    // Torre blanca en e2 clavada por la torre negra de e8 contra el rey de e1.
    assert.match(why('4r2k/8/8/8/8/8/4R3/4K3 w - - 0 1', 'e2', 'a2'), /dejaría a tu rey en jaque/);
  });

  test('notas a medida del ejercicio', () => {
    const step = getLesson('enroque').steps[2];
    assert.match(why(step.fen, 'e1', 'g1', step.notes), /f1, que está atacada/);
    // y sin la nota, el motor también sabe que es ilegal
    assert.equal(new Chess(step.fen).moves({ square: 'e1', verbose: true }).some((m) => m.to === 'g1'), false);
  });
});

describe('demostraciones', () => {
  test('flechas solo para el caballo (8 en L)', () => {
    const k = getLesson('caballo').steps[0];
    assert.equal(demoArrows(k.fen, 'd4').length, 8);
    const r = getLesson('torre').steps[0];
    assert.deepEqual(demoArrows(r.fen, 'd4'), []);
  });
});
