import { extendTheme } from "@chakra-ui/react";

export const theme = extendTheme({
  config: {
    initialColorMode: "light",
    useSystemColorMode: false,
  },
  fonts: {
    heading: "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    body: "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  colors: {
    brand: {
      50: "#eef5ff",
      100: "#d9e8ff",
      200: "#b4d1ff",
      300: "#86b2ff",
      400: "#5a91fb",
      500: "#4a84f4",
      600: "#366dd6",
      700: "#2955a7",
      800: "#223f78",
      900: "#1d345d"
    },
    surface: {
      50: "#ffffff",
      100: "#faf9f7",
      200: "#f0efec",
      300: "#dfddd8",
      400: "#bdb9b1",
      500: "#8f8a82",
      600: "#66615a",
      700: "#4d4841",
      800: "#39342f",
      900: "#26221f"
    }
  },
  radii: {
    card: "24px",
    pill: "18px",
  },
  styles: {
    global: {
      ":root": {
        "--app-bg": "#f8f7f4",
        "--app-surface": "#ffffff",
        "--app-card": "#f1f0ec",
        "--app-border": "#e2e0da",
        "--app-text": "#171717",
        "--app-muted": "#8d8a83",
        "--app-accent": "#4a84f4",
        "--app-success": "#77c255",
      },
      "html, body, #root": {
        minHeight: "100%",
      },
      body: {
        background:
          "radial-gradient(circle at top, rgba(255,255,255,0.95) 0%, rgba(248,247,244,1) 58%, rgba(240,238,233,1) 100%)",
        color: "var(--app-text)",
      },
    },
  },
});
