/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bgPrimary: "#0b1120",
        bgSecondary: "#151e31",
        accentPositive: "#10b981",
        accentNegative: "#ff6b6b",
        textPrimary: "#ffffff",
        textSecondary: "#94a3b8"
      },
      boxShadow: {
        "glow-emerald": "0 0 24px rgba(16,185,129,0.18)",
        "card": "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.25)"
      }
    }
  },
  plugins: []
};
