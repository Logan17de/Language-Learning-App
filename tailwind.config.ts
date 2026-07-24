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
        ink: "#24352f",
        moss: {
          50: "#f2f7f4",
          100: "#e2eee7",
          200: "#c5ddcf",
          500: "#4f8068",
          600: "#3e6955",
          700: "#335545",
          900: "#20382e"
        },
        persimmon: {
          50: "#fff5ee",
          100: "#ffe8d8",
          400: "#ef8d60",
          500: "#e57748",
          600: "#cb5d32"
        },
        paper: "#fbfaf6",
        sand: "#eee9df"
      },
      boxShadow: {
        card: "0 18px 50px -28px rgba(36,53,47,.34)",
        float: "0 22px 60px -24px rgba(36,53,47,.45)"
      },
      borderRadius: {
        "4xl": "2rem"
      },
      animation: {
        "float-slow": "float 6s ease-in-out infinite",
        "fade-up": "fadeUp .55s ease-out both"
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" }
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        }
      }
    }
  },
  plugins: []
};

export default config;
