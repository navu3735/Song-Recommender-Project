import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f7ff",
          500: "#2d6df6",
          700: "#1848c9"
        }
      }
    }
  },
  plugins: []
};

export default config;
