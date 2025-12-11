module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Paleta cálida y suave para evitar fatiga visual
          primary: '#8EA6A1',
          secondary: '#C8B6A6',
          accent: '#EDE3D6',
          light: '#FBFAF7',
      },
      fontFamily: {
        sans: ['system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
