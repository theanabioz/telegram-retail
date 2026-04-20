import { create } from "zustand";
import { apiGet } from "../lib/api";
import type { AdminDashboardResponse, AdminStartupResponse } from "../types/admin";

const TOKEN_KEY = "telegram-retail-token";
const ADMIN_STARTUP_CACHE_KEY = "telegram-retail-admin-startup";

function getStoredToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

function readCachedDashboard() {
  try {
    const token = getStoredToken();
    const raw = window.localStorage.getItem(ADMIN_STARTUP_CACHE_KEY);
    if (!token || !raw) {
      return null;
    }

    const cached = JSON.parse(raw) as { token: string; startup: AdminStartupResponse };
    return cached.token === token ? cached.startup.dashboard : null;
  } catch {
    return null;
  }
}

function writeCachedDashboard(data: AdminDashboardResponse) {
  try {
    const token = getStoredToken();
    const raw = window.localStorage.getItem(ADMIN_STARTUP_CACHE_KEY);

    if (!token || !raw) {
      return;
    }

    const cached = JSON.parse(raw) as { token: string; startup: AdminStartupResponse };

    if (cached.token !== token) {
      return;
    }

    window.localStorage.setItem(
      ADMIN_STARTUP_CACHE_KEY,
      JSON.stringify({
        token,
        startup: {
          ...cached.startup,
          dashboard: data,
        },
      })
    );
  } catch {
    // Dashboard cache is only for perceived speed.
  }
}

type AdminDashboardState = {
  loading: boolean;
  error: string | null;
  data: AdminDashboardResponse | null;
  hydrate: (data: AdminDashboardResponse) => void;
  load: (options?: { silent?: boolean }) => Promise<void>;
};

const cachedDashboard = readCachedDashboard();

export const useAdminDashboardStore = create<AdminDashboardState>((set) => ({
  loading: false,
  error: null,
  data: cachedDashboard,
  hydrate: (data) => {
    writeCachedDashboard(data);
    set({ loading: false, error: null, data });
  },
  load: async (options) => {
    const token = getStoredToken();

    if (!token) {
      set({
        loading: false,
        error: "Missing auth token",
        data: null,
      });
      return;
    }

    if (!options?.silent) {
      set({ loading: true, error: null });
    } else {
      set({ error: null });
    }

    try {
      const data = await apiGet<AdminDashboardResponse>("/admin/dashboard", token);
      writeCachedDashboard(data);
      set({
        loading: false,
        error: null,
        data,
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Failed to load admin dashboard",
        data: null,
      });
    }
  },
}));

export function patchAdminDashboardSnapshot(
  updater: (data: AdminDashboardResponse) => AdminDashboardResponse
) {
  const current = useAdminDashboardStore.getState().data ?? readCachedDashboard();

  if (!current) {
    return;
  }

  const next = updater(current);
  writeCachedDashboard(next);
  useAdminDashboardStore.setState({
    data: next,
    error: null,
  });
}
