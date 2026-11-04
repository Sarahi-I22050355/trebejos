import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ComingSoon from './pages/ComingSoon.jsx';
import { Home, Learn, Lobby, RoomPage } from './pages/lazy.js';
import { msg } from './i18n/core.js';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="sala/:code" element={<RoomPage />} />
        <Route path="salas" element={<Lobby />} />
        <Route path="aprender" element={<Learn />} />
        <Route path="aprender/:lessonId" element={<Learn />} />
        <Route path="*" element={<ComingSoon icon="explore_off" title={msg('Página no encontrada')} text={msg('Esa dirección no existe.')} />} />
      </Route>
    </Routes>
  );
}
