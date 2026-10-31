/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        botanical: {
          50: '#f4f7f4',
          100: '#e5ece5',
          200: '#ccdacc',
          300: '#a7c0a8',
          400: '#7fa181',
          500: '#5e8460',
          600: '#48684a',
          700: '#3a533c',
          800: '#2f4331',
          900: '#273729',
          950: '#131e15',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
