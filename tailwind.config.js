export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        glow: '0 0 0 1px rgba(96, 165, 250, 0.12), 0 20px 50px -20px rgba(15, 23, 42, 0.5)',
      },
      backgroundImage: {
        'grid-dark': 'radial-gradient(circle at top, rgba(96, 165, 250, 0.14), transparent 30%), radial-gradient(circle at bottom, rgba(248, 113, 113, 0.08), transparent 20%)',
      },
    },
  },
  plugins: [],
};
