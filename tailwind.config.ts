import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        gold: "#f6c85f",
        goldDark: "#c3984a",
        ink: "#151622",
        panel: "#242537"
      },
      boxShadow: {
        soft: "0 18px 50px rgba(0,0,0,.25)"
      }
    }
  },
  plugins: []
};

export default config;
