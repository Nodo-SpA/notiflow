'use client';

import React, { useEffect, useState } from 'react';
import { Button, Input, Card } from '@/components/ui';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import { FiEye, FiEyeOff, FiCpu, FiLayers, FiSmartphone } from 'react-icons/fi';
import { apiClient } from '@/lib/api-client';
import Image from 'next/image';
import logo from '@/logos/NotiflowV_02.png';
import badge from '@/logos/Naranjo_Degradado.png';

export default function LoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 'credentials' && (!email || !password)) return;
    if (step === 'otp' && code.length < 6) return;
    setLoading(true);
    setError('');
    setInfo('');

    try {
      if (step === 'credentials') {
        await apiClient.login(email, password);
        await apiClient.requestOtp(email);
        setStep('otp');
        setInfo('Te enviamos un código a tu correo. Revisa bandeja y spam.');
        setResendIn(30);
      } else {
        const verifyRes = await apiClient.verifyOtp(email, code);
        const { token, user } = verifyRes.data;
        localStorage.setItem('authToken', token);
        setUser(user);
        router.push('/dashboard');
      }
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Error al iniciar sesión';
      setError(
        status === 401 || status === 403
          ? step === 'otp'
            ? 'Código incorrecto o expirado'
            : 'Correo o contraseña inválidos'
          : msg === 'Forbidden'
          ? 'No tienes acceso a esta aplicación'
          : msg
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0c1b2a] via-[#0e2439] to-[#132f4f] text-white relative overflow-hidden">
      <div className="absolute -left-24 -top-24 w-72 h-72 bg-primary/25 blur-3xl rounded-full" />
      <div className="absolute right-0 bottom-0 w-80 h-80 bg-secondary/25 blur-3xl rounded-full" />
      {/* Fondos en movimiento suaves */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-16 top-6 w-80 h-80 bg-gradient-to-br from-primary/30 to-secondary/15 blur-3xl rounded-full animate-orbit-slow" />
        <div className="absolute right-[-60px] bottom-[-80px] w-96 h-96 bg-gradient-to-tr from-white/10 to-primary/15 blur-3xl rounded-full animate-orbit-slower" />
        <div className="absolute left-1/3 bottom-[-100px] w-64 h-64 bg-gradient-to-tr from-secondary/20 to-primary/10 blur-3xl rounded-full animate-orbit-fast" />
      </div>
      <div className="relative max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 px-4 py-12 items-center min-h-screen">
        {/* Branding */}
        <div className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-3xl p-8 shadow-2xl flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden">
              <Image src={badge} alt="Marca Notiflow" className="w-full h-full object-contain" priority />
            </div>
            <div>
              <p className="text-sm text-white/70">Plataforma escolar</p>
              <h1 className="text-3xl font-bold">Notiflow</h1>
            </div>
          </div>
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <Image src={logo} alt="Notiflow logo principal" className="w-full h-auto object-contain" priority />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Comunicaciones inteligentes para colegios</h2>
            <p className="text-white/80 text-sm leading-relaxed">
              Centraliza avisos, eventos y recordatorios. Llega a apoderados y docentes en sus canales favoritos con la
              misma identidad visual de tu colegio.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-white/90">
            <span className="px-3 py-1 rounded-full bg-[#f97316]/20 border border-[#f97316]/40 text-white inline-flex items-center gap-1.5">
              <FiCpu size={14} />
              IA asistida
            </span>
            <span className="px-3 py-1 rounded-full bg-[#f97316]/20 border border-[#f97316]/40 text-white inline-flex items-center gap-1.5">
              <FiLayers size={14} />
              Multi-tenant
            </span>
            <span className="px-3 py-1 rounded-full bg-[#f97316]/20 border border-[#f97316]/40 text-white inline-flex items-center gap-1.5">
              <FiSmartphone size={14} />
              Web + App
            </span>
          </div>
        </div>

        {/* Form */}
        <div className="w-full">
          <Card className="p-8 shadow-2xl border border-gray-100 text-gray-900">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              {step === 'credentials' ? 'Bienvenido' : 'Verifica tu acceso'}
            </h2>
            <p className="text-gray-600 mb-6">
              {step === 'credentials'
                ? 'Ingresa tus credenciales para acceder al panel.'
                : 'Introduce el código que enviamos a tu correo.'}
            </p>

            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
            {info && !error && (
              <div className="mb-4 p-4 bg-[#1e293b] border border-[#f97316]/40 rounded-lg text-white text-sm font-semibold shadow-md">
                {info}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              {step === 'credentials' && (
                <>
                  <Input
                    label="Correo Electrónico"
                    type="email"
                    placeholder="tu@colegio.cl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200 pr-10 text-gray-900"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((p) => !p)}
                        className="absolute inset-y-0 right-2 flex items-center text-gray-500 hover:text-primary"
                        aria-label="Mostrar contraseña"
                      >
                        {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {step === 'otp' && (
                <>
                  <Input
                    label="Código de verificación"
                    type="text"
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\\D/g, '').slice(0, 6))}
                    required
                  />
                  <p className="text-sm text-gray-600">
                    Enviamos el código a <span className="font-semibold">{email}</span>. Tiene validez breve.
                  </p>
                  <div className="flex flex-col gap-3">
                    <Button type="submit" variant="primary" fullWidth loading={loading} disabled={loading}>
                      Verificar código
                    </Button>
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        fullWidth
                        disabled={resendIn > 0 || loading}
                        onClick={async () => {
                          try {
                            setError('');
                            setInfo('');
                            await apiClient.requestOtp(email);
                            setResendIn(30);
                            setInfo('Código reenviado. Revisa tu correo.');
                          } catch (err: any) {
                            const msg = err?.response?.data?.message || err?.message || 'No se pudo reenviar el código';
                            setError(msg);
                          }
                        }}
                      >
                        {resendIn > 0 ? `Reenviar en ${resendIn}s` : 'Reenviar código'}
                      </Button>
                      <button
                        type="button"
                        className="text-sm text-primary hover:text-primary-dark whitespace-nowrap"
                        onClick={() => {
                          setStep('credentials');
                          setCode('');
                          setInfo('');
                          setError('');
                        }}
                      >
                        Cambiar correo
                      </button>
                    </div>
                  </div>
                </>
              )}

              {step === 'credentials' && (
                <Button type="submit" variant="primary" fullWidth loading={loading} disabled={loading}>
                  Continuar
                </Button>
              )}
            </form>

            {step === 'credentials' && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  className="text-sm text-primary hover:text-primary-dark transition-colors w-full text-center"
                  onClick={() => router.push('/forgot-password')}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            )}
          </Card>

          <div className="text-center mt-6 text-white/80 text-sm">
            <p>
              © 2025 Notiflow. Un producto de{' '}
              <a
                href="https://www.nodospa.cl"
                target="_blank"
                rel="noreferrer"
                className="underline font-semibold"
              >
                Nodo SpA
              </a>
              .
            </p>
          </div>
        </div>
      </div>
      <style jsx global>{`
        @keyframes orbit-slow {
          0% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(90px, -40px, 0) scale(1.08);
          }
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
        }
        @keyframes orbit-slower {
          0% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(-70px, 60px, 0) scale(0.95);
          }
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
        }
        @keyframes orbit-fast {
          0% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(50px, -60px, 0) scale(1.1);
          }
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
        }
        .animate-orbit-slow {
          animation: orbit-slow 12s ease-in-out infinite;
        }
        .animate-orbit-slower {
          animation: orbit-slower 16s ease-in-out infinite;
        }
        .animate-orbit-fast {
          animation: orbit-fast 10s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
