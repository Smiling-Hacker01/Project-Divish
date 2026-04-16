import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-2 border-rose border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect them to the login page, but save the current location they were
    // trying to go to when they were redirected.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  // Optional: check if they need to complete couple logic
  const isSetupIncomplete = !user?.coupleCode;
  
  if (isSetupIncomplete && location.pathname !== '/join' && location.pathname !== '/couple-code') {
    return <Navigate to="/couple-code" replace />;
  }

  return children;
}
