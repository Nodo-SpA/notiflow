import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Notiflow - Mensajería Escolar',
  description: 'Sistema de mensajería informativa para colegios',
  icons: {
    icon: '/Naranjo_Degradado.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-light min-h-screen">{children}</body>
    </html>
  );
}
