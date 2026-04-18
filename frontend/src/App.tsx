import { useCallback, useEffect, useState } from "react";
import { Box, Text } from "@chakra-ui/react";
import WebApp from "@twa-dev/sdk";
import { apiGet, apiPost } from "./lib/api";
import { config } from "./lib/config";
import { AdminDashboardScreen } from "./screens/AdminDashboardScreen";
import { SellerHomeScreen } from "./screens/SellerHomeScreen";
import type { AuthSessionResponse } from "./types/seller";

type DevPanel = "admin" | "seller";

type AppSession = {
  role: "admin" | "seller";
  operatorName: string;
  loading: boolean;
  error: string | null;
};

const TOKEN_KEY = "telegram-retail-token";
const PANEL_KEY = "telegram-retail-dev-panel";

export function App() {
  const [currentPanel, setCurrentPanel] = useState<DevPanel>(() => {
    const storedPanel = window.localStorage.getItem(PANEL_KEY);
    if (storedPanel === "admin" || storedPanel === "seller") {
      return storedPanel;
    }

    return config.devPanel === "admin" ? "admin" : "seller";
  });
  const [session, setSession] = useState<AppSession>({
    role: "seller",
    operatorName: "User",
    loading: true,
    error: null,
  });

  const bootstrap = useCallback(async (desiredPanel: DevPanel, forceRelogin = false) => {
    setSession((current) => ({
      ...current,
      loading: true,
      error: null,
    }));

    try {
      let token = window.localStorage.getItem(TOKEN_KEY);
      const storedPanel = window.localStorage.getItem(PANEL_KEY);

      if (forceRelogin || !token || storedPanel !== desiredPanel) {
        const authSession = await apiPost<AuthSessionResponse>("/auth/dev-login", {
          telegramId:
            desiredPanel === "admin"
              ? config.devAdminTelegramId
              : config.devSellerTelegramId,
        });

        token = authSession.token;
        window.localStorage.setItem(TOKEN_KEY, token);
        window.localStorage.setItem(PANEL_KEY, desiredPanel);

        setSession({
          role: authSession.user.app_role,
          operatorName: authSession.user.full_name,
          loading: false,
          error: null,
        });
        return;
      }

      const me = await apiGet<{
        auth: {
          app_role: "admin" | "seller";
          full_name: string;
        };
      }>("/auth/me", token);

      setSession({
        role: me.auth.app_role,
        operatorName: me.auth.full_name,
        loading: false,
        error: null,
      });
    } catch (error) {
      setSession({
        role: desiredPanel === "admin" ? "admin" : "seller",
        operatorName: "User",
        loading: false,
        error: error instanceof Error ? error.message : "Failed to bootstrap app",
      });
    }
  }, []);

  useEffect(() => {
    try {
      WebApp.ready();
      WebApp.expand();
    } catch {
      // Local browser mode is expected before Telegram integration is wired.
    }
  }, []);

  useEffect(() => {
    void bootstrap(currentPanel);
  }, [bootstrap, currentPanel]);

  const switchPanel = async (nextPanel: DevPanel) => {
    if (nextPanel === currentPanel) {
      return;
    }

    setCurrentPanel(nextPanel);
    await bootstrap(nextPanel, true);
  };

  const impersonateSeller = async (sellerId: string) => {
    const token = window.localStorage.getItem(TOKEN_KEY);

    if (!token) {
      setSession((current) => ({
        ...current,
        error: "Missing auth token",
      }));
      return;
    }

    setSession((current) => ({
      ...current,
      loading: true,
      error: null,
    }));

    try {
      const authSession = await apiPost<AuthSessionResponse>(`/auth/impersonate/${sellerId}`, undefined, token);

      window.localStorage.setItem(TOKEN_KEY, authSession.token);
      window.localStorage.setItem(PANEL_KEY, "seller");
      setCurrentPanel("seller");
      setSession({
        role: authSession.user.app_role,
        operatorName: authSession.user.full_name,
        loading: false,
        error: null,
      });
    } catch (error) {
      setSession((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to impersonate seller",
      }));
    }
  };

  if (session.loading) {
    return null;
  }

  if (session.error) {
    return (
      <Box p={6}>
        <Text>{session.error}</Text>
      </Box>
    );
  }

  return (
    <>
      {session.role === "admin" ? (
        <AdminDashboardScreen
          operatorName={session.operatorName}
          currentPanel={currentPanel}
          onSwitchPanel={switchPanel}
          onViewAsSeller={impersonateSeller}
        />
      ) : (
        <SellerHomeScreen
          currentPanel={currentPanel}
          onSwitchPanel={switchPanel}
        />
      )}
    </>
  );
}
