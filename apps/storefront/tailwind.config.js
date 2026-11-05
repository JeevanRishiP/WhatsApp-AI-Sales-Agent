/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        obsidian: '#0C0C0C',
        alabaster: '#FDFCF9',
        calico: '#F6F4EE',
        stone: {
          50: '#FDFCF9',
          100: '#F6F4EE',
          200: '#EFECE3',
          300: '#E2DFD6',
          400: '#8A8983',
          500: '#5C5B57',
        },
        brass: {
          DEFAULT: '#C5A880',
          hover: '#B2956D',
          subtle: 'rgba(197, 168, 128, 0.15)',
        },
      },
      fontFamily: {
        serif: ['Cormorant Garamond', 'Georgia', 'serif'],
        sans: ['Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['Geist Mono', 'SF Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        xs: '2px',
        sm: '4px',
        md: '6px',
        lg: '10px',
      },
    },
  },
  plugins: [],
};

