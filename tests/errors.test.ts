import { describe, it, expect } from "vitest";
import { MercadoLibreError } from "../src/errors.js";

describe("MercadoLibreError", () => {
  it("has correct properties", () => {
    const err = new MercadoLibreError("GET", "/items/123", 404, "Not Found");
    expect(err.method).toBe("GET");
    expect(err.path).toBe("/items/123");
    expect(err.status).toBe(404);
    expect(err.body).toBe("Not Found");
    expect(err.name).toBe("MercadoLibreError");
    expect(err.message).toBe("GET /items/123 failed (404): Not Found");
  });

  it("isUnauthorized returns true for 401", () => {
    const err = new MercadoLibreError("GET", "/", 401, "Unauthorized");
    expect(err.isUnauthorized).toBe(true);
    expect(err.isNotFound).toBe(false);
    expect(err.isRateLimited).toBe(false);
  });

  it("isNotFound returns true for 404", () => {
    const err = new MercadoLibreError("GET", "/", 404, "Not Found");
    expect(err.isNotFound).toBe(true);
    expect(err.isUnauthorized).toBe(false);
    expect(err.isRateLimited).toBe(false);
  });

  it("isRateLimited returns true for 429", () => {
    const err = new MercadoLibreError("GET", "/", 429, "Too Many Requests");
    expect(err.isRateLimited).toBe(true);
    expect(err.isUnauthorized).toBe(false);
    expect(err.isNotFound).toBe(false);
  });
});
