/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./public/**/*.html",
  ],
  theme: {
    extend: {
      colors: {
        coral: {
          50:  "#fff5f2",
          100: "#feeee8",
          200: "#fdd9cd",
          300: "#fcbda7",
          400: "#fa8f6e",
          500: "#f95738",
          600: "#ea4323",
          700: "#c43317",
          800: "#9c2a15",
          900: "#7e2615",
        },
        brand: {
          50:  "#f0fdf9",
          100: "#ccfbef",
          200: "#99f6df",
          300: "#5eecc8",
          400: "#2dd9ad",
          500: "#00a47c",
          600: "#008060",
          700: "#006048",
          800: "#004d3a",
          900: "#003d2e",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
