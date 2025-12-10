import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();

  // Show loading while authentication is being checked
  if (loading) {
    return <div>Loading...</div>; // You could use a proper loading component here
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: window.location.pathname }} />;
  }

  return <>{children}</>;
};

export default PrivateRoute;
