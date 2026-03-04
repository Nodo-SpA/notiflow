import React from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/store';

export const withAuth = <P extends object>(
  Component: React.ComponentType<P>
) => {
  return function AuthenticatedComponent(props: P) {
    const router = useRouter();
    const { user, isAuthenticated, setUser } = useAuthStore();
    const [checking, setChecking] = React.useState(true);

    React.useEffect(() => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
      if (!token) {
        setChecking(false);
        router.replace('/login');
        return;
      }

      if (isAuthenticated && user) {
        setChecking(false);
        return;
      }

      apiClient
        .getAuthMe()
        .then((res) => {
          if (res?.data) {
            setUser(res.data);
          }
        })
        .catch(() => {
          localStorage.removeItem('authToken');
          localStorage.removeItem('refreshToken');
          setUser(null);
          router.replace('/login');
        })
        .finally(() => setChecking(false));
    }, [isAuthenticated, user, router, setUser]);

    if (checking || !isAuthenticated || !user) {
      return (
        <div className="flex items-center justify-center h-screen">
          <p className="text-gray-500">Cargando...</p>
        </div>
      );
    }

    return <Component {...props} />;
  };
};
