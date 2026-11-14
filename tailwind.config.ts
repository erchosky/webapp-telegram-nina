import type { Config } from "tailwindcss";

/**
 * Telegram Mini Apps expose theme colors through CSS variables injected on the
 * <html> element (e.g. --tg-theme-bg-color). We map those onto Tailwind tokens
 * so the UI adapts automatically to the user's Telegram theme (light/dark).
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        tg: {
          bg: "var(--tg-theme-bg-color, #ffffff)",
          secondaryBg: "var(--tg-theme-secondary-bg-color, #f4f4f5)",
          text: "var(--tg-theme-text-color, #0f0f0f)",
          hint: "var(--tg-theme-hint-color, #707579)",
          link: "var(--tg-theme-link-color, #2481cc)",
          button: "var(--tg-theme-button-color, #2481cc)",
          buttonText: "var(--tg-theme-button-text-color, #ffffff)",
          destructive: "var(--tg-theme-destructive-text-color, #df3f40)",
        },
      },
      borderRadius: {
        card: "8px",
      },
    },
  },
  plugins: [],
};

export default config;
