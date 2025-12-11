export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-secondary flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-full shadow-lg mb-4">
            <span className="text-3xl font-bold text-primary">N</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Notiflow</h1>
          <p className="text-green-100">Sistema de Mensajería Escolar</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow p-8 shadow-2xl">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Iniciar Sesión
          </h2>

          <div className="space-y-4">
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Correo Electrónico<span className="text-red-500 ml-1">*</span>
              </label>
              <input
                type="email"
                placeholder="tu@escuela.com"
                className="w-full px-4 py-2.5 border rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200 bg-white hover:border-gray-300"
              />
            </div>

            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contraseña<span className="text-red-500 ml-1">*</span>
              </label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full px-4 py-2.5 border rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200 bg-white hover:border-gray-300"
              />
            </div>

            <a
              href="./login"
              className="font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2 bg-primary text-white hover:bg-green-700 disabled:bg-gray-400 px-4 py-2.5 text-base w-full block"
            >
              Ir al login
            </a>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-600 text-center">
              Demo: usa cualquier correo y contraseña para entrar
            </p>
          </div>
        </div>

        <div className="text-center mt-8 text-white text-sm">
          <p>© 2025 Notiflow. Todos los derechos reservados.</p>
        </div>
      </div>
    </div>
  );
}
