import { config } from "./config";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiGet<T>(path: string, token?: string) {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
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
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
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
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
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
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
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
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
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
