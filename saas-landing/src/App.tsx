import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import LandingPage from './pages/LandingPage';
import RegisterClub from './pages/RegisterClub';

function App() {
  return (
    <BrowserRouter>
      {/* Toast notifications positioned beautifully */}
      <Toaster position="top-center" richColors />

      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/register" element={<RegisterClub />} />
        {/* Redirect generic login requests to the main platform app */}
        <Route path="/login" element={<Navigate to="https://app.tudominio.com/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
