import { RouterProvider } from 'react-router';
import { router } from './routes';
import { useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { initAndroidBackButton } from './services/androidBackButton';
import { initAppStateSync } from './services/eventBus';

export default function App() {
  useEffect(() => {
    // Set dark mode by default
    document.documentElement.classList.add('dark');

    // Wire native Android back button to React Router
    initAndroidBackButton();

    // Auto-sync data when app returns from background
    initAppStateSync();
  }, []);

  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
