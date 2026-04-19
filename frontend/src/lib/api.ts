import { config } from "./config";

const API_TIMEOUT_MS = 15000;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function requestWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(408, "Connection timed out. Please try again.");
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function apiGet<T>(path: string, token?: string) {
  const response = await requestWithTimeout(`${config.apiBaseUrl}${path}`, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, body?.error ?? "Request failed");
  }

  return (await response.json()) as T;
}

export async function apiPost<T>(path: string, body?: unknown, token?: string) {
  const response = await requestWithTimeout(`${config.apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, payload?.error ?? "Request failed");
  }

  return (await response.json()) as T;
}

export async function apiPatch<T>(path: string, body: unknown, token?: string) {
  const response = await requestWithTimeout(`${config.apiBaseUrl}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, payload?.error ?? "Request failed");
  }

  return (await response.json()) as T;
}

export async function apiDelete<T>(path: string, token?: string) {
  const response = await requestWithTimeout(`${config.apiBaseUrl}${path}`, {
    method: "DELETE",
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, payload?.error ?? "Request failed");
  }

  return (await response.json()) as T;
}

export async function apiDeleteWithBody<T>(path: string, body: unknown, token?: string) {
  const response = await requestWithTimeout(`${config.apiBaseUrl}${path}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...(token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, payload?.error ?? "Request failed");
  }

  return (await response.json()) as T;
}
