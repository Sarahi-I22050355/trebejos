// Contenido de "Aprende a jugar". Todas las lecciones están abiertas desde el inicio: no hay
// progreso, bloqueos ni puntuación. Cada ejercicio es una posición (FEN) con un objetivo.
//
// goal:  { type: 'any' }                       cualquier jugada legal de la pieza señalada
//        { type: 'targets', squares: [...] }   llegar a una de esas casillas (p. ej. capturar)
//        { type: 'moves', moves: ['e1g1'] }    una jugada concreta (enroque, captura al paso)
//        { type: 'promote' } | { type: 'check' } | { type: 'mate' }
// selectable: casillas de las piezas que se pueden coger · demo: pieza cuyos movimientos se muestran
// notes: explicaciones a medida para intentos concretos { e1g1: '…' }

import { pieceEs } from './learn.js';

export const GROUPS = [
  { id: 'piezas', label: 'Las piezas' },
  { id: 'reglas', label: 'Reglas especiales' },
  { id: 'practica', label: 'A jugar' },
];

export const LESSONS = [
  {
    id: 'peon', group: 'piezas', piece: 'p', title: 'El peón', tag: 'Avanza y corona',
    blurb: 'Avanza de frente, captura en diagonal',
    intro: [
      'El peón es la pieza más humilde, pero la más numerosa: cada jugador tiene ocho. Avanza siempre de frente, una casilla (o dos la primera vez que se mueve), pero captura en diagonal.',
      'Nunca retrocede. Si llega al otro extremo del tablero se corona: se convierte en una pieza más fuerte.',
    ],
    facts: [['Valor', '1 punto'], ['Avanza', '1 casilla (2 la primera vez)'], ['Captura', '1 casilla en diagonal']],
    tip: 'Los peones del centro (las columnas d y e) ayudan a controlar el tablero desde la apertura.',
    steps: [
      {
        fen: '7k/8/8/8/8/8/4P3/K7 w - - 0 1', selectable: ['e2'], demo: 'e2', goal: { type: 'any' },
        prompt: 'Mueve el peón. Como aún no se ha movido, puede avanzar una o dos casillas.',
        hint: 'Prueba con e3 o con e4: son los puntos azules.',
        success: '¡Así avanza el peón! Solo va hacia adelante.',
      },
      {
        fen: '7k/8/8/3pp3/4P3/8/8/K7 w - - 0 1', selectable: ['e4'], goal: { type: 'targets', squares: ['d5'] },
        prompt: 'El peón captura en diagonal. Captura el peón negro de d5.',
        hint: 'Con el peón de e4, captura hacia la diagonal de la izquierda: d5.',
        success: 'El peón de e5 le bloqueaba el paso, pero en diagonal sí puede comer.',
      },
    ],
  },
  {
    id: 'torre', group: 'piezas', piece: 'r', title: 'La torre', tag: 'Líneas rectas',
    blurb: 'Filas y columnas, sin saltar',
    intro: [
      'La torre se mueve en línea recta, en horizontal o en vertical, todas las casillas que quiera mientras no haya piezas en el camino. No puede saltar.',
      'Gana mucho valor en las columnas abiertas (sin peones) y cuando dos torres se protegen entre sí.',
    ],
    facts: [['Valor', '5 puntos'], ['Movimiento', 'Filas y columnas'], ['Salta', 'No']],
    tip: 'Coloca las torres en columnas abiertas: desde ahí atacan hasta el fondo del tablero.',
    steps: [
      {
        fen: '7k/8/8/8/3R4/8/8/K7 w - - 0 1', selectable: ['d4'], demo: 'd4', goal: { type: 'any' },
        prompt: 'Mueve la torre en línea recta, hacia donde quieras.',
        hint: 'Prueba arriba, abajo, a la izquierda o a la derecha.',
        success: 'La torre recorre filas y columnas enteras.',
      },
      {
        fen: '6k1/3p4/8/8/3R4/8/8/K7 w - - 0 1', selectable: ['d4'], goal: { type: 'targets', squares: ['d7'] },
        prompt: 'Captura el peón negro de d7 con la torre.',
        hint: 'La torre sube por la columna d hasta d7.',
        success: '¡Capturado! La torre llega hasta la pieza rival y la toma.',
      },
    ],
  },
  {
    id: 'caballo', group: 'piezas', piece: 'n', title: 'El caballo', tag: 'Saltador',
    blurb: "Salto en 'L', esquiva barreras",
    intro: [
      'El caballo se mueve en forma de L: dos casillas en una dirección y una en perpendicular. Es la única pieza que puede saltar por encima de otras, propias o rivales.',
      'Cada salto lo lleva a una casilla de color distinto al de la que sale.',
    ],
    facts: [['Valor', '3 puntos'], ['Movimiento', "Salto en 'L'"], ['Salta', 'Sí, la única']],
    tip: 'Un caballo en el centro controla hasta 8 casillas; en el borde, 4 como máximo, y en la esquina solo 2. ¡Centraliza tus caballos!',
    steps: [
      {
        fen: '7k/8/8/2PPP3/2PNP3/2PPP3/8/K7 w - - 0 1', selectable: ['d4'], demo: 'd4', goal: { type: 'any' },
        prompt: 'El caballo está rodeado por sus propios peones, pero puede saltar. Muévelo en L.',
        hint: 'Dos casillas en una dirección y una al lado: por ejemplo f5 o b3.',
        success: 'Los peones no le estorban: el caballo salta por encima.',
      },
      {
        fen: '7k/8/4p3/8/3N4/8/8/K7 w - - 0 1', selectable: ['d4'], goal: { type: 'targets', squares: ['e6'] },
        prompt: 'Captura el peón negro de e6 con un salto en L.',
        hint: 'Desde d4: una casilla a la derecha y dos hacia arriba.',
        success: 'El caballo captura en la casilla donde aterriza.',
      },
    ],
  },
  {
    id: 'alfil', group: 'piezas', piece: 'b', title: 'El alfil', tag: 'Diagonales',
    blurb: 'Diagonales largas, siempre del mismo color',
    intro: [
      'El alfil se mueve en diagonal todas las casillas que quiera, sin saltar sobre otras piezas.',
      'Por eso cada alfil se queda siempre en casillas del mismo color: uno recorre las claras y el otro las oscuras.',
    ],
    facts: [['Valor', '3 puntos'], ['Movimiento', 'Diagonales'], ['Salta', 'No']],
    tip: 'La pareja de alfiles cubre las casillas de los dos colores y es muy fuerte en posiciones abiertas.',
    steps: [
      {
        fen: '8/7k/8/8/3B4/8/8/K7 w - - 0 1', selectable: ['d4'], demo: 'd4', goal: { type: 'any' },
        prompt: 'Mueve el alfil en diagonal.',
        hint: 'Elige cualquier punto azul: todos están en diagonal.',
        success: 'El alfil solo viaja en diagonal, así que nunca cambia de color de casilla.',
      },
      {
        fen: '8/7k/1p6/8/3B4/8/8/K7 w - - 0 1', selectable: ['d4'], goal: { type: 'targets', squares: ['b6'] },
        prompt: 'Captura el peón negro de b6 con el alfil.',
        hint: 'Sube por la diagonal hacia la izquierda: c5 y luego b6.',
        success: '¡Capturado por la diagonal!',
      },
    ],
  },
  {
    id: 'dama', group: 'piezas', piece: 'q', title: 'La dama', tag: 'La más poderosa',
    blurb: 'Torre y alfil en una sola pieza',
    intro: [
      'La dama combina la torre y el alfil: se mueve en línea recta o en diagonal, cuantas casillas quiera, sin saltar. Es la pieza más poderosa del tablero.',
    ],
    facts: [['Valor', '9 puntos'], ['Movimiento', 'Rectas y diagonales'], ['Salta', 'No']],
    tip: 'No saques la dama demasiado pronto: las piezas rivales pueden atacarla y perderás tiempo escapando.',
    steps: [
      {
        fen: '8/8/7k/8/3Q4/8/8/K7 w - - 0 1', selectable: ['d4'], demo: 'd4', goal: { type: 'any' },
        prompt: 'Mueve la dama como quieras: en línea recta o en diagonal.',
        hint: 'Cualquier punto azul vale.',
        success: 'La dama cubre filas, columnas y diagonales a la vez.',
      },
      {
        fen: 'k7/8/5p2/8/3Q4/8/8/7K w - - 0 1', selectable: ['d4'], goal: { type: 'targets', squares: ['f6'] },
        prompt: 'Captura el peón negro de f6 con la dama.',
        hint: 'Está en la diagonal que sube hacia la derecha: e5 y luego f6.',
        success: '¡Capturado! La dama llegó por la diagonal.',
      },
    ],
  },
  {
    id: 'rey', group: 'piezas', piece: 'k', title: 'El rey', tag: 'Hay que protegerlo',
    blurb: 'Una casilla, y nunca a una casilla atacada',
    intro: [
      'El rey se mueve una sola casilla en cualquier dirección. Es la pieza más importante: si lo atacan y no puede escapar, pierdes la partida (jaque mate).',
      'Un rey nunca puede moverse a una casilla atacada por una pieza rival.',
    ],
    facts: [['Valor', 'Imprescindible'], ['Movimiento', '1 casilla, en cualquier dirección'], ['Regla', 'No puede ir a casillas atacadas']],
    tip: 'En la apertura el rey está más seguro tras enrocar; en el final, en cambio, se vuelve una pieza activa.',
    steps: [
      {
        fen: '7k/8/8/4K3/8/8/8/8 w - - 0 1', selectable: ['e5'], demo: 'e5', goal: { type: 'any' },
        prompt: 'Mueve el rey una casilla en cualquier dirección.',
        hint: 'Cualquiera de las ocho casillas que lo rodean.',
        success: 'El rey avanza despacio, pero en todas las direcciones.',
      },
      {
        fen: '7k/8/8/r7/4K3/8/8/8 w - - 0 1', selectable: ['e4'], demo: 'e4', goal: { type: 'any' },
        prompt: 'La torre negra vigila toda la fila 5. Intenta subir el rey a la fila 5 y mira qué pasa; luego muévelo a una casilla segura.',
        hint: 'Las casillas seguras están en las filas 3 y 4.',
        success: 'El rey solo puede ir a casillas donde nadie lo ataque.',
      },
    ],
  },

  {
    id: 'enroque', group: 'reglas', icon: 'swap_horiz', title: 'El enroque', tag: 'Rey a salvo',
    blurb: 'Rey y torre se mueven a la vez',
    intro: [
      'El enroque es el único movimiento en el que se mueven dos piezas a la vez: el rey avanza dos casillas hacia una torre y esa torre salta al otro lado del rey. Pone al rey a salvo y activa la torre.',
      'Solo se puede enrocar si el rey y esa torre no se han movido antes, si no hay piezas entre ellos, y si el rey no está en jaque, no pasa por una casilla atacada ni termina en una.',
    ],
    facts: [['Corto', 'Rey e1→g1, torre h1→f1'], ['Largo', 'Rey e1→c1, torre a1→d1'], ['Se mueve', 'El rey (arrastra a la torre)']],
    tip: 'Se enroca con el rey: muévelo dos casillas y la torre se coloca sola.',
    steps: [
      {
        fen: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', selectable: ['e1'], goal: { type: 'moves', moves: ['e1g1'] },
        prompt: 'Enroca corto: mueve el rey dos casillas hacia la torre de h1.',
        hint: 'Lleva el rey de e1 a g1.',
        success: 'El rey queda protegido en el flanco y la torre entra en juego.',
        wrong: 'Para enrocar corto, mueve el rey de e1 a g1.',
      },
      {
        fen: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', selectable: ['e1'], goal: { type: 'moves', moves: ['e1c1'] },
        prompt: 'Ahora enroca largo, hacia la torre de a1.',
        hint: 'Lleva el rey de e1 a c1 (dos casillas hacia la izquierda).',
        success: 'El enroque largo coloca la torre en d1, junto al rey.',
        wrong: 'Para enrocar largo, mueve el rey de e1 a c1.',
      },
      {
        fen: '4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1', selectable: ['e1'], goal: { type: 'moves', moves: ['e1c1'] },
        prompt: 'La torre negra ataca la casilla f1. Intenta enrocar corto y mira qué te dice el tutor; después enroca largo.',
        hint: 'Con f1 atacada, el rey no puede pasar por ella. El enroque largo sí es posible: e1 a c1.',
        notes: { e1g1: 'No puedes enrocar corto: el rey tendría que pasar por f1, que está atacada por la torre negra. El enroque largo sí está permitido.' },
        success: 'Del lado largo ninguna casilla por la que pasa el rey está atacada.',
        wrong: 'Aquí la jugada pedida es el enroque largo (e1 a c1).',
      },
    ],
  },
  {
    id: 'al-paso', group: 'reglas', icon: 'call_missed_outgoing', title: 'Captura al paso', tag: 'Solo en el momento',
    blurb: 'Un peón captura a otro que pasó de largo',
    intro: [
      'Cuando un peón avanza dos casillas desde su posición inicial y queda justo al lado de un peón rival, ese rival puede capturarlo "al paso": como si el peón solo hubiera avanzado una casilla.',
      'Esta captura solo se puede hacer en el turno inmediato; si no la haces en ese momento, pierdes la oportunidad.',
    ],
    facts: [['Cuándo', 'Justo después de un avance de 2 casillas'], ['Cómo', 'Capturas en diagonal a la casilla que cruzó'], ['Plazo', 'Solo en esa jugada']],
    tip: 'Es la regla que más se olvida. Si un peón rival pasa de largo al lado de tu peón, ¡revisa si puedes capturarlo al paso!',
    steps: [
      {
        fen: '7k/8/8/3pP3/8/8/8/K7 w - d6 0 1', selectable: ['e5'], goal: { type: 'moves', moves: ['e5d6'] },
        prompt: 'Las negras acaban de jugar d7 a d5, pasando junto a tu peón de e5. Captúralo al paso.',
        hint: 'Mueve tu peón de e5 a d6: la casilla por la que pasó el peón negro.',
        success: 'El peón negro de d5 desaparece, aunque tu peón no cayó sobre su casilla.',
        wrong: 'Aquí tienes que capturar al paso: tu peón de e5 va a d6.',
      },
    ],
  },
  {
    id: 'coronacion', group: 'reglas', icon: 'workspace_premium', title: 'Coronación', tag: 'El peón se transforma',
    blurb: 'Al llegar al final, ¡nueva pieza!',
    intro: [
      'Cuando un peón llega a la última fila, se corona: se convierte en dama, torre, alfil o caballo, a tu elección.',
      'Casi siempre conviene elegir dama, pero a veces otra pieza es mejor (por ejemplo, un caballo que da jaque, o para evitar un ahogado).',
    ],
    facts: [['Cuándo', 'Al llegar a la última fila'], ['Opciones', 'Dama, torre, alfil o caballo'], ['Lo habitual', 'Dama']],
    tip: 'Coronar una dama puede cambiar una partida entera. Por eso los peones pasados (sin rivales delante) son tan peligrosos.',
    steps: [
      {
        fen: '7k/4P3/8/8/8/8/8/K7 w - - 0 1', selectable: ['e7'], goal: { type: 'promote' },
        prompt: 'Tu peón está a un paso de coronar. Avánzalo a la última fila y elige tu nueva pieza.',
        hint: 'Mueve el peón de e7 a e8 y luego escoge una pieza en el selector.',
        success: (move) => `Ahora tienes ${pieceEs(move.promotion)} nueva en e8.`,
      },
    ],
  },
  {
    id: 'jaque-mate', group: 'reglas', icon: 'crisis_alert', title: 'Jaque y jaque mate', tag: 'El objetivo',
    blurb: 'Atacar al rey y no dejarle salida',
    intro: [
      'Jaque: el rey está atacado. Quien lo recibe debe salir del jaque de inmediato: moviendo el rey, capturando a la pieza que ataca o interponiendo una pieza (menos contra un caballo).',
      'Jaque mate: el rey está en jaque y no hay ninguna forma de evitarlo. La partida termina y gana quien dio el mate.',
    ],
    facts: [['Jaque', 'El rey está atacado'], ['Jaque mate', 'Jaque sin escapatoria'], ['Se sale del jaque', 'Mover, capturar o interponer']],
    tip: 'Un jaque no es un mate: antes de dar mate, comprueba que el rey no pueda escapar, capturar ni bloquear.',
    steps: [
      {
        fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', selectable: ['a1'], goal: { type: 'check' },
        prompt: 'Da jaque al rey negro: ataca al rey con la torre.',
        hint: 'Sube la torre a la fila 8: desde a8 ataca al rey de e8.',
        success: 'Es jaque, pero el rey aún puede escapar: todavía no es mate.',
        wrong: 'Tu jugada debe atacar al rey negro.',
      },
      {
        fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', selectable: ['a1'], goal: { type: 'mate' },
        prompt: 'Da jaque mate en una jugada. El rey negro está encerrado por sus propios peones.',
        hint: 'Sube la torre a la última fila: a8. Los peones le tapan al rey la salida.',
        success: '¡Jaque mate! El rey no puede escapar, capturar ni bloquear: se acabó la partida.',
      },
      {
        fen: '7k/8/6K1/8/8/8/8/3Q4 w - - 0 1', selectable: ['d1'], goal: { type: 'mate' },
        prompt: 'Otro mate en una: tu rey ya le quita al rey negro las casillas g7 y h7. Falta atacarlo por la última fila.',
        hint: 'Sube la dama a d8: da jaque y el rey negro no tiene ninguna casilla libre.',
        success: '¡Mate! Tu rey y tu dama trabajan juntos: el rey negro no puede escapar.',
      },
    ],
  },
  {
    id: 'ahogado', group: 'reglas', icon: 'balance', title: 'Ahogado y tablas', tag: 'No todo es ganar',
    blurb: 'Cuando la partida termina en empate',
    intro: [
      'Ahogado: el jugador que tiene el turno no está en jaque pero no tiene ninguna jugada legal. La partida termina en tablas (empate). Es un error clásico cuando ya vas ganando.',
      'Además hay tablas por acuerdo, por triple repetición de la misma posición, por la regla de los 50 movimientos sin capturas ni movimientos de peón, y por material insuficiente para dar mate.',
    ],
    facts: [['Ahogado', 'Sin jugadas y sin jaque: tablas'], ['Otras tablas', 'Acuerdo, repetición, 50 movimientos'], ['Material', 'Rey solo, o rey + alfil/caballo']],
    tip: 'Si vas ganando de mucho, antes de cada jugada comprueba que el rey rival conserve al menos una jugada, a menos que sea mate.',
    steps: [
      {
        fen: '7k/1Q6/6K1/8/8/8/8/8 w - - 0 1', selectable: ['b7'], goal: { type: 'mate' },
        prompt: 'Vas ganando con dama y rey, pero ¡cuidado con el ahogado! Da jaque mate sin dejar al rey negro sin jugadas.',
        hint: 'Qg7 es mate (tu rey la protege). Qf7, en cambio, dejaría al rey negro sin jugadas: ahogado.',
        stalemate: '¡Eso es ahogado! El rey negro no está en jaque pero no tiene ninguna jugada legal: tablas. Prueba de nuevo y busca el mate.',
        success: '¡Mate, y sin ahogar! Esa es la diferencia entre ganar y empatar.',
      },
    ],
  },

  {
    id: 'practica', group: 'practica', icon: 'sports_esports', title: 'Partida guiada', tag: 'Contra el bot fácil',
    blurb: 'Juega una partida con pistas del tutor',
    practice: true,
    intro: [
      'Pon en práctica todo lo aprendido contra el bot de nivel Principiante. Juegas con blancas, sin reloj y sin prisa.',
      'Si te atascas, pide una pista: el tutor te dice cuál es la mejor jugada y por qué.',
    ],
    facts: [['Rival', 'Bot Principiante'], ['Reloj', 'Sin reloj'], ['Ayuda', 'Pistas ilimitadas']],
    tip: 'Las pistas son para aprender: intenta primero buscar tu propia jugada y usa la pista para comprobarla.',
    steps: [],
  },
];

export const getLesson = (id) => LESSONS.find((l) => l.id === id) ?? null;
export const nextLesson = (id) => {
  const i = LESSONS.findIndex((l) => l.id === id);
  return i >= 0 && i < LESSONS.length - 1 ? LESSONS[i + 1] : null;
};
