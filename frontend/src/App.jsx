import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import RoomPage from './pages/Room.jsx';
import ComingSoon from './pages/ComingSoon.jsx';
import Learn from './pages/Learn.jsx';

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
        <Route path="aprender" element={<Learn />} />
        <Route path="aprender/:lessonId" element={<Learn />} />
        <Route path="*" element={<ComingSoon icon="explore_off" title="Página no encontrada" text="Esa dirección no existe." />} />
      </Route>
    </Routes>
  );
}
