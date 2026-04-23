import React from "react";
import ReactDOM from "react-dom/client";
import { ChakraProvider } from "@chakra-ui/react";
import { App } from "./App";
import { initializeI18n } from "./lib/i18n";
import { system } from "./theme/theme";
import "./styles.css";

initializeI18n();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ChakraProvider value={system}>
      <App />
    </ChakraProvider>
  </React.StrictMode>
);
