import { useCallback, useEffect, useState } from "react";
import { Box, Button, Text, VStack } from "@chakra-ui/react";
import WebApp from "@twa-dev/sdk";
import { apiGet, apiPost } from "./lib/api";
import { config } from "./lib/config";
import { attachGlobalHaptics } from "./lib/haptics";
import { triggerImpact, triggerNotification, triggerSelection } from "./lib/haptics";
import { attachTelegramViewportSafety } from "./lib/telegramViewport";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
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

function AppBootState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Box minH="var(--app-viewport-height, 100vh)" px={5} pt="var(--app-screen-pt)" display="grid" placeItems="center">
      <VStack spacing={4} textAlign="center" bg="rgba(255,255,255,0.86)" borderRadius="28px" px={6} py={7} boxShadow="0 18px 36px rgba(18, 18, 18, 0.06)">
        <Box w="42px" h="42px" borderRadius="16px" bg="brand.500" color="white" display="grid" placeItems="center" fontWeight="900">
          CS
        </Box>
        <VStack spacing={1}>
          <Text fontSize="xl" fontWeight="900" letterSpacing="-0.03em">
            {title}
          </Text>
          <Text color="surface.500" fontSize="sm" fontWeight="700" maxW="260px">
            {description}
          </Text>
        </VStack>
        {actionLabel && onAction ? (
          <Button borderRadius="18px" bg="surface.900" color="white" _hover={{ bg: "surface.800" }} onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null}
      </VStack>
    </Box>
  );
}

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

  useEffect(() => attachTelegramViewportSafety(), []);

  useEffect(() => attachGlobalHaptics(), []);

  useEffect(() => {
    void bootstrap(currentPanel);
  }, [bootstrap, currentPanel]);

  const switchPanel = async (nextPanel: DevPanel) => {
    if (nextPanel === currentPanel) {
      triggerSelection();
      return;
    }

    setCurrentPanel(nextPanel);
    try {
      await bootstrap(nextPanel, true);
      triggerImpact("medium");
    } catch {
      triggerNotification("error");
    }
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
      triggerImpact("medium");
      setSession({
        role: authSession.user.app_role,
        operatorName: authSession.user.full_name,
        loading: false,
        error: null,
      });
    } catch (error) {
      triggerNotification("error");
      setSession((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to impersonate seller",
      }));
    }
  };

  if (session.loading) {
    return (
      <AppBootState
        title="Opening retail app"
        description="Preparing your Telegram session and live workspace."
      />
    );
  }

  if (session.error) {
    return (
      <AppBootState
        title="Could not open app"
        description={session.error}
        actionLabel="Try again"
        onAction={() => void bootstrap(currentPanel, true)}
      />
    );
  }

  return (
    <AppErrorBoundary>
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
    </AppErrorBoundary>
  );
}
