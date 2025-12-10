'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import { Layout } from '@/components/layout';
import { MessageComposer } from '@/components/messages/MessageComposer';

export default function NewMessagePage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (!user) {
      router.push('/login');
    }
  }, [user, router]);

  if (!user) {
    return null;
  }

  const handleSend = (data: any) => {
    console.log('Mensaje enviado:', data);
    alert('¡Mensaje enviado correctamente!');
    router.push('/messages');
  };

  const handleSchedule = (data: any) => {
    console.log('Mensaje programado:', data);
    alert('¡Mensaje programado correctamente!');
    router.push('/messages');
  };

  return (
    <Layout>
      <div className="max-w-3xl">
        <MessageComposer onSend={handleSend} onSchedule={handleSchedule} />
      </div>
    </Layout>
  );
}
