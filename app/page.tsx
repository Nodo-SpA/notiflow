'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import squareLogo from '@/logos/Naranjo_Degradado.png';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-secondary flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center space-y-4 bg-white/80 rounded-lg p-6 shadow-2xl">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-2xl shadow-lg mx-auto overflow-hidden border border-primary/20">
          <Image src={squareLogo} alt="Notiflow" className="w-full h-full object-contain" priority />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Notiflow</h1>
          <p className="text-sm text-gray-600">Redirigiendo al login...</p>
        </div>
        <Link
          href="/login"
          className="inline-flex items-center justify-center gap-2 bg-primary text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-dark transition-colors"
        >
          Ir al login
        </Link>
      </div>
    </div>
  );
}
