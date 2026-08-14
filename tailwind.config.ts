import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--aiko-ink) / <alpha-value>)",
        paper: "rgb(var(--aiko-paper) / <alpha-value>)",
        surface: "rgb(var(--aiko-surface) / <alpha-value>)",
        "surface-muted": "rgb(var(--aiko-surface-muted) / <alpha-value>)",
        muted: "rgb(var(--aiko-muted) / <alpha-value>)",
        border: "rgb(var(--aiko-border) / <alpha-value>)",
        moss: {
          50: "#f3f4ed",
          100: "#e1e6d5",
          200: "#c5cfb0",
          300: "#a1b38a",
          400: "#7e9769",
          500: "#617b50",
          600: "#4b6340",
          700: "#3d5035",
          800: "#31412d",
          900: "#253325",
        },
        persimmon: {
          50: "#fbf5e9",
          100: "#f4e6c6",
          200: "#ead093",
          300: "#ddb660",
          400: "#cf993b",
          500: "#b97c2b",
          600: "#996124",
          700: "#784a22",
        },
        sand: "rgb(var(--aiko-sand) / <alpha-value>)",
      },
      fontFamily: {
        sans: [
          "var(--font-aiko-sans)",
          "Noto Sans JP",
          "Hiragino Kaku Gothic ProN",
          "Yu Gothic",
          "Meiryo",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        serif: [
          "var(--font-aiko-display)",
          "Yu Mincho",
          "Hiragino Mincho ProN",
          "Noto Serif JP",
          "ui-serif",
          "Georgia",
          "serif",
        ],
      },
      boxShadow: {
        soft: "0 10px 32px -24px rgba(36,53,47,.28)",
        card: "0 18px 50px -30px rgba(36,53,47,.34)",
        float: "0 24px 64px -30px rgba(36,53,47,.44)",
        nav: "0 -16px 40px -30px rgba(36,53,47,.42)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      transitionDuration: {
        180: "180ms",
        280: "280ms",
      },
      animation: {
        "float-slow": "float 6s ease-in-out infinite",
        "fade-up": "fadeUp .55s ease-out both",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
