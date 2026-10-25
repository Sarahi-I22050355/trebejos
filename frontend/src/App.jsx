import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import RoomPage from './pages/Room.jsx';
import ComingSoon from './pages/ComingSoon.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="sala/:code" element={<RoomPage />} />
        <Route
          path="salas"
          element={<ComingSoon icon="public" title="Salas públicas" text="El listado completo con filtros y búsqueda llega pronto." />}
        />
        <Route
          path="aprender"
          element={<ComingSoon icon="school" title="Aprende a jugar" text="Las lecciones interactivas llegan pronto." />}
        />
        <Route path="*" element={<ComingSoon icon="explore_off" title="Página no encontrada" text="Esa dirección no existe." />} />
      </Route>
    </Routes>
  );
}
