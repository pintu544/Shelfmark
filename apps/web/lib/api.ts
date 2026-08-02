import type {
  Book,
  BookInput,
  BookStatus,
  BookUpdate,
  DashboardSummary,
  FieldErrors,
  User,
} from "@/lib/types";

export const SESSION_EXPIRED_EVENT = "thumbstack:session-expired";

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    fields?: FieldErrors;
  };
}

interface RequestOptions extends RequestInit {
  handleUnauthorized?: boolean;
  timeoutMs?: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: FieldErrors;

  constructor(
    message: string,
    options: { status?: number; code?: string; fields?: FieldErrors } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status ?? 0;
    this.code = options.code ?? "UNKNOWN_ERROR";
    this.fields = options.fields;
  }
}

let redirectingToLogin = false;

function expireBrowserSession() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  if (
    !redirectingToLogin &&
    window.location.pathname !== "/login" &&
    window.location.pathname !== "/signup"
  ) {
    redirectingToLogin = true;
    window.location.assign("/login?reason=session-expired");
  }
}

function createTimedSignal(externalSignal: AbortSignal | null, timeoutMs?: number) {
  if (!timeoutMs && !externalSignal) {
    return { signal: undefined, cleanup: () => undefined };
  }

  const controller = new AbortController();
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) {
    abortFromExternal();
  } else {
    externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  }

  const timer = timeoutMs
    ? window.setTimeout(() => controller.abort("request-timeout"), timeoutMs)
    : undefined;

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timer !== undefined) window.clearTimeout(timer);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    },
  };
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    handleUnauthorized = true,
    timeoutMs,
    headers: suppliedHeaders,
    signal: externalSignal,
    ...init
  } = options;
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(suppliedHeaders);
  headers.set("Accept", "application/json");

  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers.set("X-Thumbstack-Client", "web");
  }

  const { signal, cleanup } = createTimedSignal(externalSignal ?? null, timeoutMs);

  try {
    const response = await fetch(path, {
      ...init,
      method,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });

    if (response.status === 204) return undefined as T;

    const payload = (await response.json().catch(() => null)) as
      | (T & ErrorEnvelope)
      | null;

    if (!response.ok) {
      const details = payload?.error;
      const error = new ApiError(
        details?.message ?? "The request could not be completed.",
        {
          status: response.status,
          code: details?.code ?? "REQUEST_FAILED",
          fields: details?.fields,
        },
      );

      if (response.status === 401 && handleUnauthorized) expireBrowserSession();
      throw error;
    }

    if (payload === null) {
      throw new ApiError("The server returned an invalid response.", {
        status: response.status,
        code: "INVALID_RESPONSE",
      });
    }

    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (externalSignal?.aborted) {
      throw new ApiError("The request was cancelled.", {
        code: "REQUEST_ABORTED",
      });
    }
    throw new ApiError("We could not reach the library service.", {
      code: "NETWORK_ERROR",
    });
  } finally {
    cleanup();
  }
}

export const api = {
  health(signal?: AbortSignal) {
    return request<{ status: "ok" }>("/api/health", {
      signal,
      timeoutMs: 5_000,
      handleUnauthorized: false,
    });
  },

  signup(input: { name: string; email: string; password: string }) {
    return request<{ user: User }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(input),
      handleUnauthorized: false,
    });
  },

  login(input: { email: string; password: string }) {
    return request<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
      handleUnauthorized: false,
    });
  },

  me(signal?: AbortSignal) {
    return request<{ user: User }>("/api/auth/me", { signal });
  },

  logout() {
    return request<void>("/api/auth/logout", {
      method: "POST",
      handleUnauthorized: false,
    });
  },

  listBooks(
    filters: { status?: BookStatus; tag?: string } = {},
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams();
    if (filters.status) query.set("status", filters.status);
    if (filters.tag) query.set("tag", filters.tag);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return request<{ books: Book[] }>(`/api/books${suffix}`, { signal });
  },

  createBook(input: BookInput) {
    return request<{ book: Book }>("/api/books", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateBook(id: string, input: BookUpdate) {
    return request<{ book: Book }>(`/api/books/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  deleteBook(id: string) {
    return request<void>(`/api/books/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  dashboard(signal?: AbortSignal) {
    return request<{ summary: DashboardSummary }>("/api/dashboard", { signal });
  },
};

export function isWakeableError(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.status === 0 || [502, 503, 504].includes(error.status)) &&
    error.code !== "REQUEST_ABORTED"
  );
}

function delay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    };
    const timer = window.setTimeout(finish, milliseconds);
    const cancel = () => {
      window.clearTimeout(timer);
      reject(
        new ApiError("The request was cancelled.", {
          code: "REQUEST_ABORTED",
        }),
      );
    };
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
  });
}

export async function wakeApi(signal?: AbortSignal) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (signal?.aborted) {
      throw new ApiError("The request was cancelled.", {
        code: "REQUEST_ABORTED",
      });
    }

    try {
      await api.health(signal);
      return;
    } catch (error) {
      lastError = error;
      if (!isWakeableError(error)) throw error;
    }

    await delay(2_000, signal);
  }

  throw (
    lastError ??
    new ApiError("The library service is taking longer than expected to wake.", {
      code: "SERVICE_UNAVAILABLE",
      status: 503,
    })
  );
}

export function messageFromError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
) {
  return error instanceof ApiError ? error.message : fallback;
}
