import { createSystem, defaultConfig } from "@chakra-ui/react";

export const system = createSystem(defaultConfig, {
  globalCss: {
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

  theme: {
    tokens: {
      fonts: {
        heading: {
          value: "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        },
        body: {
          value: "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        },
      },

      colors: {
        brand: {
          50: {
            value: "#eef5ff",
          },
          100: {
            value: "#d9e8ff",
          },
          200: {
            value: "#b4d1ff",
          },
          300: {
            value: "#86b2ff",
          },
          400: {
            value: "#5a91fb",
          },
          500: {
            value: "#4a84f4",
          },
          600: {
            value: "#366dd6",
          },
          700: {
            value: "#2955a7",
          },
          800: {
            value: "#223f78",
          },
          900: {
            value: "#1d345d",
          }
        },
        surface: {
          50: {
            value: "#ffffff",
          },
          100: {
            value: "#faf9f7",
          },
          200: {
            value: "#f0efec",
          },
          300: {
            value: "#dfddd8",
          },
          400: {
            value: "#bdb9b1",
          },
          500: {
            value: "#8f8a82",
          },
          600: {
            value: "#66615a",
          },
          700: {
            value: "#4d4841",
          },
          800: {
            value: "#39342f",
          },
          900: {
            value: "#26221f",
          }
        }
      },

      radii: {
        card: {
          value: "24px",
        },
        pill: {
          value: "18px",
        },
      },
    },
  },
});
