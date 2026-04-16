import { RouterProvider } from 'react-router';
import { router } from './routes';
import { useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';

export default function App() {
  useEffect(() => {
    // Set dark mode by default
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
