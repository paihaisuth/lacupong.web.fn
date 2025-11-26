/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.{html,js}", "./js/**/*.js"], // บอกให้ Tailwind สแกนไฟล์ HTML และ JS ทั้งหมด
  theme: {
    extend: {
      colors: {
        gold: {
          100: '#F9F1D8',
          400: '#D4AF37',
          500: '#C5A028',
          600: '#997B1F',
        },
        dark: '#1A1A1A',
      },
      fontFamily: {
        sans: ['Kanit', 'sans-serif'],
      },
      boxShadow: {
        'soft': '0 10px 40px -10px rgba(0,0,0,0.15)',
        'glow': '0 0 20px rgba(212, 175, 55, 0.3)'
      }
    },
  },
  plugins: [],
}