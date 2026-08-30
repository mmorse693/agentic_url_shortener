import { BrowserRouter, Route, Routes } from 'react-router-dom';

import NotFoundPage from './pages/NotFoundPage';
import ShortenPage from './pages/ShortenPage';
import './styles/app.css';

/**
 * There is deliberately no route for `/r/:code` — short links are resolved by
 * Express, and the CRA dev server proxies `/r` straight through to it.
 */
export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<ShortenPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
