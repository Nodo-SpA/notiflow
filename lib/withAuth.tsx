import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';

export const withAuth = <P extends object>(
  Component: React.ComponentType<P>
) => {
  return function AuthenticatedComponent(props: P) {
    const router = useRouter();
    const user = useAuthStore((state) => state.user);
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

    React.useEffect(() => {
      if (!isAuthenticated || !user) {
        router.push('/login');
      }
    }, [isAuthenticated, user, router]);

    if (!isAuthenticated || !user) {
      return (
        <div className="flex items-center justify-center h-screen">
          <p className="text-gray-500">Cargando...</p>
        </div>
      );
    }

    return <Component {...props} />;
  };
};
