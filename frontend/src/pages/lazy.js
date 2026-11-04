// Pantallas con carga diferida: cada una es un archivo JS aparte que se descarga la primera vez que se visita.
// Tras cargar la primera pantalla, el navegador (cuando está ocioso) baja las demás, así que al navegar ya suelen estar.
import { lazy } from 'react';

const loaders = {
  Home: () => import('./Home.jsx'),
  Lobby: () => import('./Lobby.jsx'),
  RoomPage: () => import('./Room.jsx'),
  Learn: () => import('./Learn.jsx'),
};

export const Home = lazy(loaders.Home);
export const Lobby = lazy(loaders.Lobby);
export const RoomPage = lazy(loaders.RoomPage);
export const Learn = lazy(loaders.Learn);

/** Descarga en segundo plano las pantallas que aún no se han visitado. No hace nada si falla (se pedirán al navegar). */
export function prefetchPages() {
  const run = () => Object.values(loaders).forEach((load) => load().catch(() => {}));
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 2000);
}
