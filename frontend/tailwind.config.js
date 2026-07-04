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
          900: '#1e1e1e', // VSCode background
          800: '#252526', // VSCode Sidebar
          700: '#2d2d30', // VSCode hover/panel
          600: '#3e3e42'  // VSCode borders
        },
        primary: '#007acc' // VSCode active blue
      }
    },
  },
  plugins: [],
}
