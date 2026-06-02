import { AsyncLocalStorage } from "async_hooks";
import { createHash } from "node:crypto";
import { MercadoLibreError } from "./errors.js";
import type { MercadoLibreJsonObject, MercadoLibreJsonValue } from "./listing-types.js";

const BASE_URL = "https://api.mercadolibre.com";
const requestAccessTokenStorage = new AsyncLocalStorage<string | undefined>();
const AUTH_TRACE_ENABLED =
  process.env.MELI_AUTH_TRACE === "1" || process.env.MELI_AUTH_TRACE?.toLowerCase() === "true";

function tokenFingerprint(token: string | undefined): string {
  if (!token) return "none";
  return createHash("sha256").update(token).digest("hex").slice(0, 10);
}

function tokenPrefix(token: string | undefined): string {
  if (!token) return "none";
  return token.startsWith("APP_USR") ? "APP_USR" : "other";
}

function traceAuth(message: string, meta: Record<string, string>): void {
  if (!AUTH_TRACE_ENABLED) return;
  const pairs = Object.entries(meta)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  console.log(`[MELI_AUTH_TRACE] ${message} ${pairs}`);
}

export async function runWithRequestAccessToken<T>(
  accessToken: string | undefined,
  callback: () => Promise<T>
): Promise<T> {
  return requestAccessTokenStorage.run(accessToken, callback);
}

export interface ListingValidationSuccess {
  valid: true;
  status: 204;
}

export interface ListingValidationFailure {
  valid: false;
  status: number;
  errors: MercadoLibreJsonValue;
}

export type ListingValidationResult = ListingValidationSuccess | ListingValidationFailure;

export class MercadoLibreClient {
  private accessToken?: string;

  constructor(accessToken?: string) {
    this.accessToken = accessToken;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const requestAccessToken = requestAccessTokenStorage.getStore();
    const effectiveAccessToken = requestAccessToken ?? this.accessToken;
    traceAuth("effective_token_selected", {
      source: requestAccessToken ? "request" : this.accessToken ? "default" : "none",
      prefix: tokenPrefix(effectiveAccessToken),
      fp: tokenFingerprint(effectiveAccessToken),
    });
    if (effectiveAccessToken) {
      h.Authorization = `Bearer ${effectiveAccessToken}`;
    }
    return h;
  }

  async get<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
    return this.request<T>("GET", path, { params });
  }

  async post<T = unknown>(
    path: string,
    body: Record<string, string | number | boolean | Record<string, unknown>>,
    params?: Record<string, string>
  ): Promise<T> {
    return this.request<T>("POST", path, { body, params });
  }

  async put<T = unknown>(
    path: string,
    body: Record<string, string | number | boolean | null | Record<string, unknown>>
  ): Promise<T> {
    return this.request<T>("PUT", path, { body });
  }

  async postJson<T = unknown>(path: string, body: MercadoLibreJsonObject): Promise<T> {
    return this.request<T>("POST", path, { jsonBody: body });
  }

  async postValidate(path: string, body: MercadoLibreJsonObject): Promise<ListingValidationResult> {
    const requestAccessToken = requestAccessTokenStorage.getStore();
    const effectiveAccessToken = requestAccessToken ?? this.accessToken;
    traceAuth("outbound_post_validate", {
      method: "POST",
      path,
      source: requestAccessToken ? "request" : this.accessToken ? "default" : "none",
      prefix: tokenPrefix(effectiveAccessToken),
      fp: tokenFingerprint(effectiveAccessToken),
    });
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (res.status === 204) {
      return { valid: true, status: 204 };
    }
    const responseBody = await res.text();
    if (!res.ok) {
      let errors: MercadoLibreJsonValue = responseBody;
      try {
        errors = JSON.parse(responseBody) as MercadoLibreJsonValue;
      } catch {
        // keep raw text
      }
      return { valid: false, status: res.status, errors };
    }
    let errors: MercadoLibreJsonValue = responseBody;
    if (responseBody.trim() !== "") {
      try {
        errors = JSON.parse(responseBody) as MercadoLibreJsonValue;
      } catch {
        // keep raw text
      }
    }
    return { valid: false, status: res.status, errors };
  }

  async postMultipart<T = unknown>(path: string, formData: FormData): Promise<T> {
    const headers: Record<string, string> = {};
    const requestAccessToken = requestAccessTokenStorage.getStore();
    const effectiveAccessToken = requestAccessToken ?? this.accessToken;
    traceAuth("outbound_post_multipart", {
      method: "POST",
      path,
      source: requestAccessToken ? "request" : this.accessToken ? "default" : "none",
      prefix: tokenPrefix(effectiveAccessToken),
      fp: tokenFingerprint(effectiveAccessToken),
    });
    if (effectiveAccessToken) {
      headers.Authorization = `Bearer ${effectiveAccessToken}`;
    }
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: formData,
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const responseBody = await res.text();
      throw new MercadoLibreError("POST", path, res.status, responseBody);
    }
    return res.json() as Promise<T>;
  }

  async request<T = unknown>(
    method: "GET" | "POST" | "PUT",
    path: string,
    options?: {
      params?: Record<string, string>;
      body?: Record<string, string | number | boolean | null | Record<string, unknown>>;
      jsonBody?: MercadoLibreJsonObject;
    }
  ): Promise<T> {
    let url = `${BASE_URL}${path}`;
    if (options?.params) {
      const qs = new URLSearchParams(options.params).toString();
      if (qs) url += `?${qs}`;
    }
    const requestAccessToken = requestAccessTokenStorage.getStore();
    const effectiveAccessToken = requestAccessToken ?? this.accessToken;
    traceAuth("outbound_request", {
      method,
      path,
      source: requestAccessToken ? "request" : this.accessToken ? "default" : "none",
      prefix: tokenPrefix(effectiveAccessToken),
      fp: tokenFingerprint(effectiveAccessToken),
    });
    const init: RequestInit = {
      method,
      headers: this.headers(),
      signal: AbortSignal.timeout(30000),
    };
    if ((method === "POST" || method === "PUT") && options?.jsonBody) {
      init.body = JSON.stringify(options.jsonBody);
    } else if ((method === "POST" || method === "PUT") && options?.body) {
      init.body = JSON.stringify(options.body);
    }
    const res = await fetch(url, init);
    if (!res.ok) {
      const responseBody = await res.text();
      throw new MercadoLibreError(method, path, res.status, responseBody);
    }
    return res.json() as Promise<T>;
  }
}
