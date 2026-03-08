import { describe, it, expect, vi, beforeEach } from "vitest";
import { MercadoLibreClient } from "../src/client.js";
import { MercadoLibreError } from "../src/errors.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("MercadoLibreClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("sends GET request without auth when no token", async () => {
    const client = new MercadoLibreClient();
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "MLA123" }));

    await client.get("/items/MLA123");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.mercadolibre.com/items/MLA123",
      expect.objectContaining({
        method: "GET",
        headers: expect.not.objectContaining({ Authorization: expect.any(String) }),
      })
    );
  });

  it("sends GET request with Bearer token when token provided", async () => {
    const client = new MercadoLibreClient("TEST_TOKEN");
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "MLA123" }));

    await client.get("/items/MLA123");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.mercadolibre.com/items/MLA123",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer TEST_TOKEN" }),
      })
    );
  });

  it("appends query params to URL", async () => {
    const client = new MercadoLibreClient();
    mockFetch.mockResolvedValueOnce(jsonResponse({ results: [] }));

    await client.get("/sites/MLA/search", { q: "iphone", limit: "10" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.mercadolibre.com/sites/MLA/search?q=iphone&limit=10",
      expect.any(Object)
    );
  });

  it("throws MercadoLibreError on non-OK response", async () => {
    const client = new MercadoLibreClient();
    mockFetch.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

    await expect(client.get("/items/INVALID")).rejects.toThrow(MercadoLibreError);
  });

  it("error has correct properties", async () => {
    const client = new MercadoLibreClient();
    mockFetch.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

    try {
      await client.get("/users/me");
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as MercadoLibreError;
      expect(err.status).toBe(401);
      expect(err.isUnauthorized).toBe(true);
      expect(err.isNotFound).toBe(false);
      expect(err.method).toBe("GET");
      expect(err.path).toBe("/users/me");
    }
  });

  it("returns parsed JSON response", async () => {
    const client = new MercadoLibreClient();
    const data = { id: "MLA999", title: "Test Item" };
    mockFetch.mockResolvedValueOnce(jsonResponse(data));

    const result = await client.get("/items/MLA999");
    expect(result).toEqual(data);
  });
});
