/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          950: '#121216', // Deepest background / input & card bg
          900: '#1e1e1e', // VSCode background
          850: '#212124', // Intermediate panel
          800: '#252526', // VSCode Sidebar
          750: '#29292c', // Hover panel
          700: '#2d2d30', // VSCode hover/panel
          600: '#3e3e42', // VSCode borders
          500: '#525258'  // Light borders / muted
        },
        primary: {
          DEFAULT: '#007acc', // VSCode active blue
          300: '#66b2ff',
          400: '#3399ff',
          500: '#007acc',
          600: '#005f9e',
          700: '#004c7e',
          800: '#00385e',
          900: '#00253e',
        }
      }
    },
  },
  plugins: [],
}
