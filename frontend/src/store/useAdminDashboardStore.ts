import { create } from "zustand";
import { apiGet } from "../lib/api";
import type { AdminDashboardResponse } from "../types/admin";

const TOKEN_KEY = "telegram-retail-token";

function getStoredToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

type AdminDashboardState = {
  loading: boolean;
  error: string | null;
  data: AdminDashboardResponse | null;
  hydrate: (data: AdminDashboardResponse) => void;
  load: () => Promise<void>;
};

export const useAdminDashboardStore = create<AdminDashboardState>((set) => ({
  loading: false,
  error: null,
  data: null,
  hydrate: (data) => {
    set({ loading: false, error: null, data });
  },
  load: async () => {
    const token = getStoredToken();

    if (!token) {
      set({
        loading: false,
        error: "Missing auth token",
        data: null,
      });
      return;
    }

    set({ loading: true, error: null });

    try {
      const data = await apiGet<AdminDashboardResponse>("/admin/dashboard", token);
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
