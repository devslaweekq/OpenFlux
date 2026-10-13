/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B0E11",
        panel: "#12161B",
        line: "#232A31",
        ash: "#D8E1E8",
        signal: "#4DD4C2",
        key: "#E8A33D",
        fault: "#E5576B",
      },
      fontFamily: {
        display: ['"Space Grotesk"', "sans-serif"],
        sans: ["Inter", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      keyframes: {
        pulseline: {
          "0%, 100%": { opacity: "0.35", transform: "scaleX(0.92)" },
          "50%": { opacity: "1", transform: "scaleX(1)" },
        },
      },
      animation: {
        pulseline: "pulseline 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
