/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'terminal-bg': '#1e1e1e',
        'terminal-fg': '#d4d4d4',
        'terminal-green': '#4ec9b0',
        'terminal-yellow': '#dcdcaa',
        'terminal-blue': '#569cd6',
        'terminal-red': '#f14c4c',
        'sidebar-bg': '#252526',
        'sidebar-hover': '#2a2d2e',
        'sidebar-active': '#37373d',
        'border-color': '#3c3c3c'
      }
    }
  },
  plugins: []
}
