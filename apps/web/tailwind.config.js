/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        appbg: '#f8f4ec',
        accent: '#0f766e',
        accent2: '#1e293b',
      },
    },
  },
  plugins: [],
};
