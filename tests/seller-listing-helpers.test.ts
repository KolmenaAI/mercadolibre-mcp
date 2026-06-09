import { describe, it, expect } from "vitest";
import {
  parseListingValidationResponse,
  summarizeCategoryListingRequirements,
  extractItemPictureRefs,
  mergeListingPictures,
  buildPicturesPutPayload,
} from "../src/seller-listing-helpers.js";

describe("seller-listing-helpers", () => {
  it("parseListingValidationResponse treats only type:error as blocking", () => {
    const parsed = parseListingValidationResponse(400, {
      message: "Validation error",
      cause: [
        {
          type: "error",
          code: "item.attributes.missing_required",
          message: "BRAND required",
        },
        {
          type: "warning",
          code: "item.shipping.mandatory_free_shipping",
          message: "Mandatory free shipping added",
        },
      ],
    });
    expect(parsed.valid).toBe(false);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.warnings).toHaveLength(1);
  });

  it("summarizeCategoryListingRequirements lists required attribute ids", () => {
    const summary = summarizeCategoryListingRequirements("MLA1055", [
      { id: "BRAND", tags: { required: true }, values: [] },
      { id: "COLOR", tags: { required: true }, values: [{ id: "1", name: "Rojo" }] },
      { id: "WEIGHT", tags: {}, values: [] },
    ]);
    expect(summary.required_for_listing.map((a) => a.id)).toEqual(["BRAND", "COLOR"]);
    expect(summary.listing_checklist.length).toBeGreaterThan(3);
  });

  it("extractItemPictureRefs reads ids from item.pictures", () => {
    const refs = extractItemPictureRefs({
      pictures: [{ id: "pic-a", url: "https://x/a.jpg" }, { id: "pic-b" }],
    });
    expect(refs).toEqual([{ id: "pic-a" }, { id: "pic-b" }]);
  });

  it("mergeListingPictures appends new ids without dropping existing", () => {
    const merged = mergeListingPictures([{ id: "pic-a" }], undefined, ["pic-b", "pic-a"]);
    expect(merged).toEqual([{ id: "pic-a" }, { id: "pic-b" }]);
  });

  it("buildPicturesPutPayload adds variation picture_ids when item has variations", () => {
    const payload = buildPicturesPutPayload(
      {
        pictures: [{ id: "pic-a" }],
        variations: [{ id: 99, picture_ids: ["pic-a"] }],
      },
      undefined,
      ["pic-b"]
    );
    expect(payload.pictures).toEqual([{ id: "pic-a" }, { id: "pic-b" }]);
    expect(payload.variations).toEqual([{ id: 99, picture_ids: ["pic-a", "pic-b"] }]);
  });
});
