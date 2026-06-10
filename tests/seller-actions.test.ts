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
  sellerCreateCatalogListing,
  sellerListMessagePacks,
  sellerGetPackMessages,
  sellerSendPackMessage,
  sellerListFeedback,
  sellerGetOrderFeedback,
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

  describe("sellerCreateCatalogListing", () => {
    it("POSTs catalog opt-in and returns catalog_listing_id", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: "MLA1804775783",
          seller_id: 10,
          catalog_product_id: "MLA27172665",
          catalog_listing: false,
        })
      );
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: "MLA999888777",
          permalink: "https://articulo.mercadolibre.com.ar/MLA999888777",
          catalog_listing: true,
          status: "active",
          title: "iPhone 15 Catalog",
        })
      );

      const result = await sellerCreateCatalogListing(client, {
        item_id: "MLA1804775783",
        catalog_product_id: "MLA27172665",
      });
      expect(result).toMatchObject({
        api: "POST /items/catalog_listings",
        source_item_id: "MLA1804775783",
        catalog_listing_id: "MLA999888777",
      });
      const postInit = mockFetch.mock.calls[2][1] as RequestInit;
      expect(JSON.parse(postInit.body as string)).toEqual({
        item_id: "MLA1804775783",
        catalog_product_id: "MLA27172665",
      });
      const postUrl = mockFetch.mock.calls[2][0] as string;
      expect(postUrl).toContain("/items/catalog_listings");
    });

    it("includes variation_id when item has multiple variations", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: "MLA1",
          seller_id: 10,
          variations: [{ id: 100 }, { id: 200 }],
        })
      );
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "MLA-CAT-1", catalog_listing: true }));

      await sellerCreateCatalogListing(client, {
        item_id: "MLA1",
        catalog_product_id: "MLA27172665",
        variation_id: 200,
      });

      const postInit = mockFetch.mock.calls[2][1] as RequestInit;
      expect(JSON.parse(postInit.body as string)).toMatchObject({
        variation_id: 200,
      });
    });

    it("rejects when item is already a catalog listing", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: "MLA-CAT",
          seller_id: 10,
          catalog_listing: true,
        })
      );

      await expect(
        sellerCreateCatalogListing(client, {
          item_id: "MLA-CAT",
          catalog_product_id: "MLA27172665",
        })
      ).rejects.toThrow(/already a catalog listing/);
    });
  });

  describe("sellerListMessagePacks", () => {
    it("calls GET /messages/unread for domestic sellers", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          userId: 10,
          results: [{ resource: "/packs/2000000089077943", count: 1 }],
        })
      );

      const result = await sellerListMessagePacks(client, {});
      expect(result).toMatchObject({
        api: "GET /messages/unread?role=seller&tag=post_sale",
        seller_id: 10,
      });
      const url = mockFetch.mock.calls[1][0] as string;
      expect(url).toContain("/messages/unread");
      expect(url).toContain("role=seller");
      expect(url).toContain("tag=post_sale");
      expect(url).not.toContain("/marketplace/");
    });

    it("falls back to marketplace/messages/unread when domestic returns 403", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      );
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          userId: 10,
          results: [{ resource: "/packs/999", count: 2 }],
        })
      );

      const result = await sellerListMessagePacks(client, {});
      expect(result).toMatchObject({
        api: "GET /marketplace/messages/unread?role=seller&tag=post_sale",
        seller_id: 10,
      });
      const marketplaceUrl = mockFetch.mock.calls[2][0] as string;
      expect(marketplaceUrl).toContain("/marketplace/messages/unread");
      expect(marketplaceUrl).toContain("user_id=10");
    });
  });

  describe("sellerSendPackMessage", () => {
    it("POSTs reply to pack thread with buyer_id", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "msg-sent", status: "available" }));

      const result = await sellerSendPackMessage(client, {
        pack_id: "2000013192222661",
        buyer_id: 3430802448,
        text: "Hola, estamos investigando el envío.",
      });
      expect(result).toMatchObject({
        api: "POST /messages/packs/{pack_id}/sellers/{seller_id}?tag=post_sale",
        seller_id: 10,
        pack_id: "2000013192222661",
        buyer_id: 3430802448,
      });
      const url = mockFetch.mock.calls[1][0] as string;
      expect(url).toContain("/messages/packs/2000013192222661/sellers/10");
      expect(url).toContain("tag=post_sale");
      const postInit = mockFetch.mock.calls[1][1] as RequestInit;
      expect(JSON.parse(postInit.body as string)).toEqual({
        from: { user_id: "10" },
        to: { user_id: "3430802448" },
        text: "Hola, estamos investigando el envío.",
      });
    });

    it("infers buyer_id from pack thread when omitted", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          messages: [{ from: { user_id: 3430802448 }, text: "No me llego el fono" }],
        })
      );
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "msg-sent" }));

      const result = await sellerSendPackMessage(client, {
        pack_id: "2000013192222661",
        text: "Lo revisamos ya.",
      });
      expect(result).toMatchObject({ buyer_id: 3430802448 });
      const postInit = mockFetch.mock.calls[2][1] as RequestInit;
      expect(JSON.parse(postInit.body as string).to).toEqual({ user_id: "3430802448" });
    });
  });

  describe("sellerListFeedback", () => {
    it("scans orders/search and fetches purchase feedback per order", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          results: [{ id: 1001 }, { id: 1002 }],
          paging: { total: 2, limit: 20, offset: 0 },
        })
      );
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          purchase: {
            id: 5040068164512,
            role: "buyer",
            rating: "positive",
            message: "Excelente",
          },
        })
      );
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          purchase: null,
          sale: { id: 1, rating: "positive" },
        })
      );

      const result = await sellerListFeedback(client, { limit: 5 });
      expect(result).toMatchObject({
        api: "GET /orders/search?seller={seller_id} + GET /orders/{order_id}/feedback",
        seller_id: 10,
        orders_scanned: 2,
        feedback_count: 1,
      });
      const feedback = (result as { feedback: Array<Record<string, unknown>> }).feedback;
      expect(feedback[0]).toMatchObject({
        order_id: 1001,
        feedback_id: 5040068164512,
        rating: "positive",
        message: "Excelente",
      });
      const searchUrl = mockFetch.mock.calls[1][0] as string;
      expect(searchUrl).toContain("/orders/search");
      expect(searchUrl).toContain("seller=10");
      const feedbackUrl = mockFetch.mock.calls[2][0] as string;
      expect(feedbackUrl).toContain("/orders/1001/feedback");
    });
  });

  describe("sellerGetOrderFeedback", () => {
    it("returns purchase and sale sides for an owned order", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1001, seller: { id: 10 } }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          purchase: { id: 99, rating: "neutral", message: "Ok" },
          sale: { id: 88, rating: "positive" },
        })
      );

      const result = await sellerGetOrderFeedback(client, { order_id: 1001 });
      expect(result).toMatchObject({
        api: "GET /orders/{order_id}/feedback",
        order_id: 1001,
        purchase: { id: 99, rating: "neutral" },
      });
    });
  });

  describe("sellerGetPackMessages", () => {
    it("reads pack thread with mark_as_read=false by default", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          messages: [{ id: "msg-1", text: "Hola" }],
          paging: { total: 1 },
        })
      );

      const result = await sellerGetPackMessages(client, { pack_id: "2000000089077943" });
      expect(result).toMatchObject({
        api: "GET /messages/packs/{pack_id}/sellers/{seller_id}?tag=post_sale&mark_as_read=false",
        pack_id: "2000000089077943",
        seller_id: 10,
      });
      const url = mockFetch.mock.calls[1][0] as string;
      expect(url).toContain("/messages/packs/2000000089077943/sellers/10");
      expect(url).toContain("tag=post_sale");
      expect(url).toContain("mark_as_read=false");
      expect(url).not.toContain("/packs/2000000089077943/messages");
    });
  });

  describe("sellerAddListingPictures", () => {
    it("PUTs merged pictures and verifies with GET (no variations)", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: "MLA999",
          seller_id: 10,
          pictures: [{ id: "existing-pic" }],
          variations: [],
        })
      );
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "MLA999", pictures: [] }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: "MLA999",
          pictures: [{ id: "existing-pic" }, { id: "625657-MLA112981342193_062026" }],
        })
      );

      const result = await sellerAddListingPictures(client, {
        item_id: "MLA999",
        picture_ids: ["625657-MLA112981342193_062026"],
      });
      expect(result).toMatchObject({
        api: "PUT /items/{id} (pictures)",
        mode: "add",
        verified: true,
        verified_picture_count: 2,
        variations_sent: null,
      });
      const putInit = mockFetch.mock.calls[2][1] as RequestInit;
      expect(JSON.parse(putInit.body as string)).toEqual({
        pictures: [{ id: "existing-pic" }, { id: "625657-MLA112981342193_062026" }],
      });
    });

    it("includes variation picture_ids when item has variations", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: "MLA999",
          seller_id: 10,
          pictures: [{ id: "existing-pic" }],
          variations: [{ id: 8822, picture_ids: ["existing-pic"] }],
        })
      );
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "MLA999" }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: "MLA999",
          pictures: [{ id: "existing-pic" }, { id: "new-pic" }],
          variations: [{ id: 8822, picture_ids: ["existing-pic", "new-pic"] }],
        })
      );

      await sellerAddListingPictures(client, {
        item_id: "MLA999",
        picture_ids: ["new-pic"],
      });

      const putInit = mockFetch.mock.calls[2][1] as RequestInit;
      expect(JSON.parse(putInit.body as string)).toEqual({
        pictures: [{ id: "existing-pic" }, { id: "new-pic" }],
        variations: [{ id: 8822, picture_ids: ["existing-pic", "new-pic"] }],
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
