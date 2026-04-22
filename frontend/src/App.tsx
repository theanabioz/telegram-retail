import { useCallback, useEffect, useState } from "react";
import { Box, Button, Text, VStack } from "@chakra-ui/react";
import { ApiError, apiGet, apiPost } from "./lib/api";
import { attachGlobalHaptics } from "./lib/haptics";
import { attachPortraitOrientationLock } from "./lib/orientation";
import { disconnectRealtimeConnection, ensureRealtimeConnection } from "./lib/realtime";
import { triggerImpact, triggerNotification } from "./lib/haptics";
import { useI18n } from "./lib/i18n";
import { bootstrapTelegramSdk, expandTelegramApp, notifyTelegramAppReady } from "./lib/telegramSdk";
import { getTelegramWebApp } from "./lib/telegramWebApp";
import { attachTelegramViewportSafety } from "./lib/telegramViewport";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { AdminDashboardScreen } from "./screens/AdminDashboardScreen";
import { SellerHomeScreen } from "./screens/SellerHomeScreen";
import { useAdminDashboardStore } from "./store/useAdminDashboardStore";
import { useAdminManagementStore } from "./store/useAdminManagementStore";
import type { AuthSessionResponse } from "./types/seller";
import type { AdminStartupResponse } from "./types/admin";

type AppRole = "admin" | "seller";

type AppSession = {
  role: AppRole | null;
  operatorName: string;
  loading: boolean;
  error: string | null;
  blocked: boolean;
};

const TOKEN_KEY = "telegram-retail-token";
const AUTH_ROLE_KEY = "telegram-retail-auth-role";
const ADMIN_STARTUP_CACHE_KEY = "telegram-retail-admin-startup";
const SELLER_STARTUP_CACHE_KEY = "telegram-retail-seller-startup";
const STARTUP_CACHE_TTL_MS = 10 * 60 * 1000;

function isStartupCacheFresh(cachedAt?: number) {
  return cachedAt == null || Date.now() - cachedAt <= STARTUP_CACHE_TTL_MS;
}

function getStoredRole(): AppRole | null {
  const role = window.localStorage.getItem(AUTH_ROLE_KEY);
  return role === "admin" || role === "seller" ? role : null;
}

function setStoredRole(role: AppRole) {
  window.localStorage.setItem(AUTH_ROLE_KEY, role);
}

function clearStoredSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(AUTH_ROLE_KEY);
}

function writeStartupCache(cacheKey: string, startup: unknown) {
  try {
    window.localStorage.setItem(cacheKey, JSON.stringify({ startup, cachedAt: Date.now() }));
  } catch {
    // Startup cache only improves perceived loading.
  }
}

function readCachedOperator(role: AppRole | null) {
  if (!role) {
    return null;
  }

  try {
    const cacheKey = role === "admin" ? ADMIN_STARTUP_CACHE_KEY : SELLER_STARTUP_CACHE_KEY;
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) {
      return null;
    }

    const cached = JSON.parse(raw) as {
      cachedAt?: number;
      startup?: {
        me?: {
          user?: {
            full_name?: string;
          };
        };
      };
    };

    if (!isStartupCacheFresh(cached.cachedAt)) {
      return null;
    }

    return cached.startup?.me?.user?.full_name ?? null;
  } catch {
    return null;
  }
}

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
      <VStack
        spacing={4}
        textAlign="center"
        bg="rgba(255,255,255,0.86)"
        borderRadius="28px"
        px={6}
        py={7}
        boxShadow="0 18px 36px rgba(18, 18, 18, 0.06)"
      >
        <Box
          w="42px"
          h="42px"
          borderRadius="16px"
          bg="brand.500"
          color="white"
          display="grid"
          placeItems="center"
          fontWeight="900"
        >
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
  const { t } = useI18n();
  const [session, setSession] = useState<AppSession>(() => {
    const role = getStoredRole();
    const cachedOperator = readCachedOperator(role);

    return {
      role,
      operatorName: cachedOperator ?? "User",
      loading: role == null || cachedOperator == null,
      error: null,
      blocked: false,
    };
  });

  const bootstrap = useCallback(async (forceRelogin = false) => {
    const webApp = getTelegramWebApp();
    const initData = webApp?.initData?.trim() ?? "";
    const cachedRole = getStoredRole();
    const cachedOperator = readCachedOperator(cachedRole);

    if (!webApp || !initData) {
      clearStoredSession();
      setSession({
        role: null,
        operatorName: "",
        loading: false,
        error: null,
        blocked: true,
      });
      return;
    }

    setSession((current) => ({
      ...current,
      role: current.role ?? cachedRole,
      operatorName: cachedOperator ?? current.operatorName,
      loading: forceRelogin || (!cachedRole && !cachedOperator),
      error: null,
      blocked: false,
    }));

    let token = forceRelogin ? null : window.localStorage.getItem(TOKEN_KEY);

    if (token) {
      try {
        const me = await apiGet<{
          auth: {
            app_role: AppRole;
            full_name: string;
          };
        }>("/auth/me", token);

        setStoredRole(me.auth.app_role);

        if (me.auth.app_role === "admin") {
          const startup = await apiGet<AdminStartupResponse>("/admin/startup", token);
          writeStartupCache(ADMIN_STARTUP_CACHE_KEY, startup);
          useAdminDashboardStore.getState().hydrate(startup.dashboard);
          useAdminManagementStore.getState().hydrateStartup(startup);
        }

        setSession({
          role: me.auth.app_role,
          operatorName: me.auth.full_name,
          loading: false,
          error: null,
          blocked: false,
        });
        return;
      } catch (error) {
        if (!(error instanceof ApiError) || (error.status !== 401 && error.status !== 403)) {
          setSession((current) => ({
            ...current,
            loading: false,
            error: error instanceof Error ? error.message : "Failed to restore session",
          }));
          return;
        }

        clearStoredSession();
        token = null;
      }
    }

    try {
      const authSession = await apiPost<AuthSessionResponse>("/auth/telegram", {
        initData,
      });

      token = authSession.token;
      window.localStorage.setItem(TOKEN_KEY, token);
      setStoredRole(authSession.user.app_role);

      if (authSession.user.app_role === "admin") {
        const startup = await apiGet<AdminStartupResponse>("/admin/startup", token);
        writeStartupCache(ADMIN_STARTUP_CACHE_KEY, startup);
        useAdminDashboardStore.getState().hydrate(startup.dashboard);
        useAdminManagementStore.getState().hydrateStartup(startup);
      }

      setSession({
        role: authSession.user.app_role,
        operatorName: authSession.user.full_name,
        loading: false,
        error: null,
        blocked: false,
      });
    } catch (error) {
      clearStoredSession();

      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setSession({
          role: null,
          operatorName: "",
          loading: false,
          error: null,
          blocked: true,
        });
        return;
      }

      setSession({
        role: null,
        operatorName: "",
        loading: false,
        error: error instanceof Error ? error.message : "Failed to authenticate session",
        blocked: false,
      });
    }
  }, []);

  useEffect(() => {
    const cleanupTelegramSdk = bootstrapTelegramSdk();
    notifyTelegramAppReady();
    expandTelegramApp();
    const cleanupOrientation = attachPortraitOrientationLock();

    return () => {
      cleanupOrientation();
      cleanupTelegramSdk();
    };
  }, []);

  useEffect(() => attachTelegramViewportSafety(), []);

  useEffect(() => attachGlobalHaptics(), []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_KEY);

    if (session.loading || !token) {
      disconnectRealtimeConnection();
      return;
    }

    ensureRealtimeConnection(token);

    return () => {
      disconnectRealtimeConnection();
    };
  }, [session.loading, session.operatorName, session.role]);

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
      setStoredRole(authSession.user.app_role);
      triggerImpact("medium");
      setSession({
        role: authSession.user.app_role,
        operatorName: authSession.user.full_name,
        loading: false,
        error: null,
        blocked: false,
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
    return <AppBootState title={t("app.boot.openingTitle")} description={t("app.boot.openingDescription")} />;
  }

  if (session.blocked) {
    return <AppBootState title={t("app.blocked.title")} description={t("app.blocked.description")} />;
  }

  if (session.error) {
    return (
      <AppBootState
        title={t("app.boot.errorTitle")}
        description={session.error}
        actionLabel={t("app.boot.tryAgain")}
        onAction={() => void bootstrap(true)}
      />
    );
  }

  if (!session.role) {
    return <AppBootState title={t("app.boot.openingTitle")} description={t("app.boot.openingDescription")} />;
  }

  return (
    <AppErrorBoundary>
      {session.role === "admin" ? (
        <AdminDashboardScreen
          operatorName={session.operatorName}
          currentPanel={session.role}
          onSwitchPanel={async () => {}}
          onViewAsSeller={impersonateSeller}
        />
      ) : (
        <SellerHomeScreen currentPanel={session.role} onSwitchPanel={async () => {}} />
      )}
    </AppErrorBoundary>
  );
}
