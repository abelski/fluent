const colors = require('tailwindcss/colors');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Design-system accent green (`documentation/design system/` prototypes) re-points the
        // two emerald steps the product actually uses; the rest of the scale is
        // stock so existing emerald-50/500 usages keep working.
        emerald: { ...colors.emerald, 600: '#0f9d68', 700: '#0c7d54' },
        // Neutral lines: card borders, header rules, row separators.
        line: '#d9d9d9',
        'line-strong': '#f1f1f1',
        'line-soft': '#f4f4f4',
        ink: '#16181c',
        muted: '#8a8f98',
        'muted-nav': '#9a9fa6',
        faint: '#b0b4ba',
        destructive: '#c2504a',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
