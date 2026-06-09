import { describe, it, expect, vi, beforeEach } from "vitest";
import { MercadoLibreClient } from "../src/client.js";
import { MercadoLibreError } from "../src/errors.js";
import {
  sellerGetMe,
  sellerListMyItems,
  sellerGetMyItem,
  sellerGetMyItemsBulk,
  sellerSearchOrders,
  sellerGetOrder,
  sellerAnswerQuestion,
  sellerGetStoreSnapshot,
  sellerGetListingHealth,
  sellerAddListingPictures,
  sellerInventoryReport,
  sellerUpdateMyItem,
  sellerUploadListingPicture,
  sellerGetListingRequirements,
  sellerValidateListing,
  sellerCreateListing,
  sellerCreatePromotionDraft,
} from "../src/seller-actions.js";
import { normalizePromotionLocalDate } from "../src/seller-helpers.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function noContentResponse(): Response {
  return {
    status: 204,
    ok: true,
    text: async () => "",
  } as Response;
}

describe("seller-actions", () => {
  let client: MercadoLibreClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new MercadoLibreClient("SELLER_TOKEN");
  });

  describe("sellerGetMe", () => {
    it("returns seller profile from /users/me", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: 12345,
          nickname: "mi_tienda",
          site_id: "MLA",
          seller_reputation: { level_id: "5_green" },
        })
      );

      const result = await sellerGetMe(client);
      expect(result).toMatchObject({
        seller_id: 12345,
        nickname: "mi_tienda",
        site_id: "MLA",
      });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/users/me");
    });
  });

  describe("sellerListMyItems", () => {
    it("searches seller items", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 99 }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          results: ["MLA111", "MLA222"],
          paging: { total: 2, limit: 50, offset: 0 },
        })
      );

      const result = await sellerListMyItems(client, { status: "active" });
      expect(result).toMatchObject({
        seller_id: 99,
        item_ids: ["MLA111", "MLA222"],
      });
    });
  });

  describe("sellerGetMyItem", () => {
    it("returns item when seller owns it", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: "MLA999",
          title: "Producto",
          seller_id: 10,
          available_quantity: 5,
        })
      );

      const result = await sellerGetMyItem(client, { item_id: "MLA999" });
      expect((result as { item: { id: string } }).item.id).toBe("MLA999");
    });

    it("rejects item owned by another seller", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: "MLA999",
          seller_id: 99999,
        })
      );

      await expect(sellerGetMyItem(client, { item_id: "MLA999" })).rejects.toBeInstanceOf(
        MercadoLibreError
      );
    });
  });

  describe("sellerGetMyItemsBulk", () => {
    it("filters to owned items only", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse([
          { code: 200, body: { id: "MLA1", seller_id: 10 } },
          { code: 200, body: { id: "MLA2", seller_id: 88 } },
        ])
      );

      const result = await sellerGetMyItemsBulk(client, {
        item_ids: ["MLA1", "MLA2"],
      });
      const items = (result as { items: Array<{ id: string }> }).items;
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe("MLA1");
    });
  });

  describe("sellerSearchOrders", () => {
    it("uses seller query param", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 55 }));
      mockFetch.mockResolvedValueOnce(jsonResponse({ results: [], paging: { total: 0 } }));

      await sellerSearchOrders(client, { limit: 5 });
      const url = mockFetch.mock.calls[1][0] as string;
      expect(url).toContain("seller=55");
    });
  });

  describe("sellerGetOrder", () => {
    it("rejects order from another seller", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: 20001,
          seller: { id: 999 },
        })
      );

      await expect(sellerGetOrder(client, { order_id: 20001 })).rejects.toBeInstanceOf(
        MercadoLibreError
      );
    });
  });

  describe("sellerAnswerQuestion", () => {
    it("posts answer", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, status: "answered" }));

      await sellerAnswerQuestion(client, {
        question_id: 123,
        text: "Sí, tenemos stock.",
      });

      const init = mockFetch.mock.calls[0][1] as RequestInit;
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toMatchObject({
        question_id: 123,
        text: "Sí, tenemos stock.",
      });
    });
  });

  describe("sellerUpdateMyItem", () => {
    it("puts price update on root when item has no variations", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ id: "MLA1", seller_id: 10, variations: [] })
      );
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "MLA1", price: 1999 }));

      const result = await sellerUpdateMyItem(client, {
        item_id: "MLA1",
        price: 1999,
      });
      expect(result).toMatchObject({
        updated_fields: ["price"],
        update_mode: "item",
      });
      const putInit = mockFetch.mock.calls[2][1] as RequestInit;
      expect(JSON.parse(putInit.body as string)).toEqual({ price: 1999 });
    });

    it("routes price and stock through the only variation", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: "MLA1",
          seller_id: 10,
          variations: [{ id: 99, user_product_id: "MLAU1", available_quantity: 1 }],
        })
      );
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ id: "MLA1", variations: [{ id: 99, available_quantity: 5 }] })
      );

      const result = await sellerUpdateMyItem(client, {
        item_id: "MLA1",
        price: 1999,
        available_quantity: 5,
      });
      expect(result).toMatchObject({
        update_mode: "variation",
        variation_id: 99,
      });
      const putInit = mockFetch.mock.calls[2][1] as RequestInit;
      expect(JSON.parse(putInit.body as string)).toEqual({
        variations: [{ id: 99, price: 1999, available_quantity: 5 }],
      });
    });
  });

  describe("listing creation", () => {
    it("seller_upload_listing_picture downloads and multipart uploads", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "Content-Type": "image/jpeg" },
        })
      );
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: "MLA123-456",
          status: "ACTIVE",
          variations: [{ secure_url: "https://http2.mlstatic.com/pic.jpg" }],
        })
      );

      const result = await sellerUploadListingPicture(client, {
        image_url: "https://example.com/phone.jpg",
      });
      expect(result).toMatchObject({
        picture_id: "MLA123-456",
        api: "POST /pictures/items/upload",
      });
      const uploadUrl = mockFetch.mock.calls[1][0] as string;
      expect(uploadUrl).toContain("/pictures/items/upload");
    });

    it("seller_get_listing_requirements summarizes required attributes", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse([
          { id: "BRAND", name: "Marca", tags: { required: true }, values: [] },
          { id: "MODEL", name: "Modelo", tags: { required: true }, values: [] },
        ])
      );

      const result = await sellerGetListingRequirements(client, { category_id: "MLA1055" });
      expect(result).toMatchObject({
        category_id: "MLA1055",
      });
      const required = (result as { required_for_listing: Array<{ id: string }> })
        .required_for_listing;
      expect(required.map((a) => a.id)).toEqual(["BRAND", "MODEL"]);
    });

    it("seller_validate_listing calls POST /items/validate", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(noContentResponse());

      const result = await sellerValidateListing(client, {
        title: "iPhone 15",
        category_id: "MLA1055",
        price: 1000,
        currency_id: "USD",
        picture_sources: ["https://example.com/pic.jpg"],
      });
      const validation = (result as { validation: { valid: boolean } }).validation;
      expect(validation.valid).toBe(true);
      const validateUrl = mockFetch.mock.calls[1][0] as string;
      expect(validateUrl).toContain("/items/validate");
    });

    it("seller_create_listing posts item and optional description", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: "MLA999",
          permalink: "https://articulo.mercadolibre.com.ar/MLA999",
          status: "active",
        })
      );
      mockFetch.mockResolvedValueOnce(jsonResponse({ plain_text: "ok" }));

      const result = await sellerCreateListing(client, {
        title: "iPhone 15",
        category_id: "MLA1055",
        price: 1000,
        currency_id: "USD",
        plain_text_description: "Nuevo en caja",
        attributes: [{ id: "BRAND", value_name: "Apple" }],
      });
      expect(result).toMatchObject({
        item_id: "MLA999",
        seller_id: 10,
      });
      const createUrl = mockFetch.mock.calls[1][0] as string;
      expect(createUrl).toContain("/items");
      expect(createUrl).not.toContain("/validate");
    });
  });

  describe("sellerGetListingHealth", () => {
    it("reads quality from /item/{id}/performance (not the discontinued /health)", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "MLA999", seller_id: 10 }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          entity_type: "ITEM",
          entity_id: "MLA999",
          score: 69,
          level: "Good",
          level_wording: "Profesional",
          buckets: [],
        })
      );

      const result = await sellerGetListingHealth(client, { item_id: "MLA999" });
      expect(result).toMatchObject({
        api: "GET /item/{id}/performance",
        item_id: "MLA999",
        performance: { score: 69, level_wording: "Profesional" },
      });
      const perfUrl = mockFetch.mock.calls[2][0] as string;
      expect(perfUrl).toContain("/item/MLA999/performance");
      expect(perfUrl).not.toContain("/items/MLA999/health");
    });
  });

  describe("sellerAddListingPictures", () => {
    it("PUTs merged existing + new picture ids (not seller_update_my_item)", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: "MLA999",
          seller_id: 10,
          pictures: [{ id: "existing-pic" }],
        })
      );
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "MLA999", pictures: [] }));

      const result = await sellerAddListingPictures(client, {
        item_id: "MLA999",
        picture_ids: ["625657-MLA112981342193_062026"],
      });
      expect(result).toMatchObject({
        api: "PUT /items/{id} (pictures)",
        mode: "add",
        added_picture_ids: ["625657-MLA112981342193_062026"],
      });
      const putInit = mockFetch.mock.calls[2][1] as RequestInit;
      expect(JSON.parse(putInit.body as string)).toEqual({
        pictures: [{ id: "existing-pic" }, { id: "625657-MLA112981342193_062026" }],
      });
    });
  });

  describe("composites", () => {
    it("seller_get_store_snapshot aggregates data", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10, nickname: "shop" }));
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10, nickname: "shop" }));
      mockFetch.mockResolvedValueOnce(jsonResponse({ results: [], paging: { total: 0 } }));
      mockFetch.mockResolvedValueOnce(jsonResponse({ total: 2, questions: [{ id: 1 }] }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ results: ["MLA1"], paging: { total: 1 } })
      );
      mockFetch.mockResolvedValueOnce(
        jsonResponse([{ code: 200, body: { id: "MLA1", seller_id: 10, available_quantity: 1 } }])
      );

      const snapshot = await sellerGetStoreSnapshot(client, {});
      expect(snapshot).toMatchObject({
        seller_id: 10,
        unanswered_questions_count: 2,
      });
    });

    it("normalizePromotionLocalDate converts date-only and strips Z", () => {
      expect(normalizePromotionLocalDate("2026-05-28", "start_date")).toBe(
        "2026-05-28T00:00:00"
      );
      expect(normalizePromotionLocalDate("2026-06-03", "finish_date")).toBe(
        "2026-06-03T23:59:59"
      );
      expect(normalizePromotionLocalDate("28-05-2026", "start_date")).toBe(
        "2026-05-28T00:00:00"
      );
      expect(normalizePromotionLocalDate("03/06/2026", "finish_date")).toBe(
        "2026-06-03T23:59:59"
      );
      expect(normalizePromotionLocalDate("2026-05-28T00:00:00Z", "start_date")).toBe(
        "2026-05-28T00:00:00"
      );
    });

    it("sellerCreatePromotionDraft sends local dates and version=test for test users", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: 3428594508,
          nickname: "TESTUSER",
          site_id: "MLA",
          tags: ["test_user"],
        })
      );
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: "C-MLA1",
          type: "SELLER_CAMPAIGN",
          status: "pending",
        })
      );

      await sellerCreatePromotionDraft(client, {
        name: "camp-test",
        start_date: "2026-05-28",
        finish_date: "2026-06-03",
      });

      const postCall = mockFetch.mock.calls[1];
      const url = postCall[0] as string;
      const init = postCall[1] as RequestInit;
      expect(url).toContain("version=test");
      expect(url).toContain("app_version=v2");
      const body = JSON.parse(init.body as string) as Record<string, string>;
      expect(body.start_date).toBe("2026-05-28T00:00:00");
      expect(body.finish_date).toBe("2026-06-03T23:59:59");
    });

    it("seller_inventory_report classifies stock", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ results: ["MLA1", "MLA2"], paging: { total: 2 } })
      );
      mockFetch.mockResolvedValueOnce(
        jsonResponse([
          { code: 200, body: { id: "MLA1", seller_id: 10, available_quantity: 1, sold_quantity: 10 } },
          { code: 200, body: { id: "MLA2", seller_id: 10, available_quantity: 50, sold_quantity: 0 } },
        ])
      );

      const report = await sellerInventoryReport(client, { low_stock_threshold: 2 });
      const low = (report as { low_stock: Array<{ id: string }> }).low_stock;
      expect(low.some((i) => i.id === "MLA1")).toBe(true);
    });
  });
});
