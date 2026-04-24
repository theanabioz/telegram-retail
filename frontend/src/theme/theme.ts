import { createSystem, defaultConfig, defineConfig, defineTextStyles, defineLayerStyles } from "@chakra-ui/react";

// ─── Text Styles ──────────────────────────────────────────────────────────────
const textStyles = defineTextStyles({
  "pos-label": {
    description: "Uppercase micro-label for metadata & section headers",
    value: {
      fontFamily: "'Inter', -apple-system, sans-serif",
      fontWeight: "600",
      fontSize: "0.625rem",
      lineHeight: "1.25",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
    },
  },
  "pos-data": {
    description: "Monospaced-feel numeric data value",
    value: {
      fontFamily: "'Manrope', -apple-system, sans-serif",
      fontWeight: "700",
      fontSize: "1.25rem",
      lineHeight: "1.25",
      letterSpacing: "-0.02em",
    },
  },
  "pos-caption": {
    description: "Small secondary caption text",
    value: {
      fontFamily: "'Inter', -apple-system, sans-serif",
      fontWeight: "500",
      fontSize: "0.75rem",
      lineHeight: "1.5",
      letterSpacing: "0em",
    },
  },
  "pos-body": {
    description: "Standard body text",
    value: {
      fontFamily: "'Inter', -apple-system, sans-serif",
      fontWeight: "400",
      fontSize: "0.875rem",
      lineHeight: "1.5",
    },
  },
  "pos-heading": {
    description: "Section / screen headings",
    value: {
      fontFamily: "'Inter', -apple-system, sans-serif",
      fontWeight: "700",
      fontSize: "1.125rem",
      lineHeight: "1.3",
      letterSpacing: "-0.02em",
    },
  },
});

// ─── Layer Styles ─────────────────────────────────────────────────────────────
const layerStyles = defineLayerStyles({
  "pos-card": {
    description: "Standard POS card surface",
    value: {
      bg: "var(--app-surface)",
      borderRadius: "10px",
      border: "1px solid var(--app-border)",
      boxShadow: "0 1px 4px rgba(0,40,100,0.06), 0 4px 16px rgba(0,40,100,0.04)",
    },
  },
  "pos-card-raised": {
    description: "Raised POS card — for KPI / stat blocks",
    value: {
      bg: "var(--app-surface)",
      borderRadius: "10px",
      border: "1px solid var(--app-border)",
      boxShadow: "0 2px 8px rgba(0,40,100,0.08), 0 8px 24px rgba(0,40,100,0.06)",
    },
  },
  "pos-panel": {
    description: "Full-width panel / section container",
    value: {
      bg: "var(--app-surface)",
      borderRadius: "12px",
      border: "1px solid var(--app-border)",
      boxShadow: "0 1px 3px rgba(0,40,100,0.05), 0 6px 20px rgba(0,40,100,0.04)",
    },
  },
  "pos-nav": {
    description: "Bottom / top navigation bar",
    value: {
      bg: "rgba(255,255,255,0.96)",
      backdropFilter: "blur(16px) saturate(180%)",
      borderTop: "1px solid var(--app-border)",
      boxShadow: "0 -2px 12px rgba(0,40,100,0.08)",
    },
  },
  "pos-input": {
    description: "Form input container styling",
    value: {
      bg: "#F8FAFD",
      borderRadius: "8px",
      border: "1px solid var(--app-border)",
      boxShadow: "inset 0 1px 2px rgba(0,40,100,0.04)",
    },
  },
});

// ─── Config ───────────────────────────────────────────────────────────────────
const config = defineConfig({
  globalCss: {
    ":root": {
      // Core palette
      "--app-bg": "#F2F6FC",
      "--app-surface": "#FFFFFF",
      "--app-card": "#EBF1FA",
      "--app-border": "#C8D6EC",
      "--app-text": "#0D1B35",
      "--app-muted": "#5B7299",
      // Status
      "--app-accent": "#0047AB",
      "--app-success": "#15803D",
      "--app-warning": "#B45309",
      "--app-danger": "#B91C1C",
      "--app-success-bg": "#DCFCE7",
      "--app-warning-bg": "#FEF3C7",
      "--app-danger-bg": "#FEE2E2",
    },
    "html, body, #root": {
      minHeight: "100%",
    },
    body: {
      background: "var(--app-bg)",
      color: "var(--app-text)",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    },
  },

  theme: {
    tokens: {
      fonts: {
        heading: {
          value: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        },
        body: {
          value: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        },
        mono: {
          value: "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        },
      },

      colors: {
        // ── Cobalt Blue brand scale ─────────────────────────────────────────
        brand: {
          50: { value: "#EBF2FF" },
          100: { value: "#C7DEFF" },
          200: { value: "#8FBEFF" },
          300: { value: "#579DFF" },
          400: { value: "#1F7CFF" },
          500: { value: "#0060E6" },
          600: { value: "#0047AB" },
          700: { value: "#003C91" },
          800: { value: "#003074" },
          900: { value: "#001D6F" },
          950: { value: "#000C2C" },
        },

        // ── Cool blue-gray surface scale ────────────────────────────────────
        surface: {
          50: { value: "#FFFFFF" },
          100: { value: "#F4F8FD" },
          200: { value: "#EBF1FA" },
          300: { value: "#C8D6EC" },
          400: { value: "#94AACF" },
          500: { value: "#5B7299" },
          600: { value: "#3D5578" },
          700: { value: "#2A3D5C" },
          800: { value: "#1A2A45" },
          900: { value: "#0D1B35" },
        },

        // ── Semantic status colors ──────────────────────────────────────────
        posSuccess: {
          50: { value: "#DCFCE7" },
          500: { value: "#16A34A" },
          700: { value: "#15803D" },
        },
        posWarning: {
          50: { value: "#FEF3C7" },
          500: { value: "#D97706" },
          700: { value: "#B45309" },
        },
        posDanger: {
          50: { value: "#FEE2E2" },
          500: { value: "#DC2626" },
          700: { value: "#B91C1C" },
        },
      },

      // ── Border radii — tighter for business/enterprise feel ─────────────
      radii: {
        card: { value: "10px" },
        pill: { value: "8px" },
        badge: { value: "5px" },
        input: { value: "8px" },
        button: { value: "8px" },
      },

      shadows: {
        "pos-card": { value: "0 1px 4px rgba(0,40,100,0.06), 0 4px 16px rgba(0,40,100,0.04)" },
        "pos-raised": { value: "0 2px 8px rgba(0,40,100,0.08), 0 8px 24px rgba(0,40,100,0.06)" },
        "pos-nav": { value: "0 -2px 12px rgba(0,40,100,0.08)" },
        "pos-focus": { value: "0 0 0 3px rgba(0,96,230,0.25)" },
        "pos-input": { value: "inset 0 1px 2px rgba(0,40,100,0.04)" },
      },
    },

    textStyles,
    layerStyles,
  },
});

export const system = createSystem(defaultConfig, config);
