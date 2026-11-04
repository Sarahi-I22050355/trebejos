import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
// Fuentes alojadas en el servidor (ver fonts.css)
import './fonts.css';
import './index.css';
import App from './App.jsx';
import { ToastProvider } from './components/Toasts.jsx';
import { SessionProvider } from './context/SessionContext.jsx';
import { getLang, loadEnglish } from './i18n/core.js';

// Si el idioma guardado es el inglés, su diccionario debe estar antes del primer dibujo (si no, se vería un instante en español).
if (getLang() === 'en') await loadEnglish();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
