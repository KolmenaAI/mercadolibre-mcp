export class MercadoLibreError extends Error {
  readonly status: number;
  readonly method: string;
  readonly path: string;
  readonly body: string;
  readonly responseHeaders?: Record<string, string>;

  constructor(
    method: string,
    path: string,
    status: number,
    body: string,
    responseHeaders?: Record<string, string>
  ) {
    super(`${method} ${path} failed (${status}): ${body}`);
    this.name = "MercadoLibreError";
    this.method = method;
    this.path = path;
    this.status = status;
    this.body = body;
    this.responseHeaders = responseHeaders;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}
