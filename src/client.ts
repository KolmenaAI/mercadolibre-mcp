import { AsyncLocalStorage } from "async_hooks";
import { createHash } from "node:crypto";
import { MercadoLibreError } from "./errors.js";
import type { MercadoLibreJsonObject, MercadoLibreJsonValue } from "./listing-types.js";

const BASE_URL = "https://api.mercadolibre.com";

/**
 * Redacted view of the inbound `Authorization: Bearer` header for the
 * current request. Used by error logs so operators can tell whether a
 * failed MercadoLibre call carried an end-user OAuth token forwarded by
 * the gateway (`source: "request"`) or fell back to the service-account
 * env-var token (`source: "none"`).
 *
 * Never carries the raw token — only a sha256[:10] fingerprint and the
 * APP_USR / other / none prefix bucket.
 */
export type InboundAuthContext = {
  source: "request" | "none";
  prefix: "APP_USR" | "other" | "none";
  fp: string;
};

export type RedactedInboundHeaders = Record<string, string | string[]>;

type RequestAuthContext = {
  accessToken?: string;
  inbound: InboundAuthContext;
  inboundHeaders?: RedactedInboundHeaders;
};

const requestAccessTokenStorage = new AsyncLocalStorage<RequestAuthContext>();

function tokenFingerprint(token: string | undefined): string {
  if (!token) return "none";
  return createHash("sha256").update(token).digest("hex").slice(0, 10);
}

function tokenPrefix(token: string | undefined): "APP_USR" | "other" | "none" {
  if (!token) return "none";
  return token.startsWith("APP_USR") ? "APP_USR" : "other";
}

/** Convert a fetch Headers object to a plain {name: value} record for log emission. */
export function headersToObject(headers: Headers): Record<string, string> {
  const obj: Record<string, string> = {};
  headers.forEach((value, key) => {
    obj[key] = value;
  });
  return obj;
}

export async function runWithRequestAccessToken<T>(
  accessToken: string | undefined,
  callback: () => Promise<T>,
  inboundHeaders?: RedactedInboundHeaders
): Promise<T> {
  return requestAccessTokenStorage.run(
    {
      accessToken,
      inbound: {
        source: accessToken ? "request" : "none",
        prefix: tokenPrefix(accessToken),
        fp: tokenFingerprint(accessToken),
      },
      inboundHeaders,
    },
    callback
  );
}

export function getInboundAuthContext(): InboundAuthContext {
  return (
    requestAccessTokenStorage.getStore()?.inbound ?? {
      source: "none",
      prefix: "none",
      fp: "none",
    }
  );
}

export function getRequestInboundHeaders(): RedactedInboundHeaders | undefined {
  return requestAccessTokenStorage.getStore()?.inboundHeaders;
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
    const requestAccessToken = requestAccessTokenStorage.getStore()?.accessToken;
    const effectiveAccessToken = requestAccessToken ?? this.accessToken;
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
    const requestAccessToken = requestAccessTokenStorage.getStore()?.accessToken;
    const effectiveAccessToken = requestAccessToken ?? this.accessToken;
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
      throw new MercadoLibreError(
        "POST",
        path,
        res.status,
        responseBody,
        headersToObject(res.headers)
      );
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
      throw new MercadoLibreError(
        method,
        path,
        res.status,
        responseBody,
        headersToObject(res.headers)
      );
    }
    return res.json() as Promise<T>;
  }
}
