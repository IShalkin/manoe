import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage';

// TODO: Re-enable authentication when Google OAuth is configured in Supabase
// import { useAuth } from './hooks/useAuth';
// import { LoginPage } from './pages/LoginPage';

const BYPASS_AUTH = true; // Set to false to enable authentication

function App() {
  // Skip auth check when bypassed
  if (BYPASS_AUTH) {
    return (
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    );
  }

  // Original auth-protected routes (currently disabled)
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App
