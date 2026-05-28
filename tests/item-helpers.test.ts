import { describe, it, expect } from "vitest";
import { extractBuyBoxItemId, itemPrice } from "../src/item-helpers.js";

describe("item-helpers", () => {
  it("extracts string buy_box_winner", () => {
    expect(extractBuyBoxItemId({ id: "MLA1", buy_box_winner: "MLA999" })).toBe("MLA999");
  });

  it("extracts object buy_box_winner.item_id", () => {
    expect(
      extractBuyBoxItemId({ id: "MLA1", buy_box_winner: { item_id: "MLA888" } })
    ).toBe("MLA888");
  });

  it("returns null when no winner", () => {
    expect(extractBuyBoxItemId({ id: "MLA1" })).toBeNull();
  });

  it("reads item price", () => {
    expect(itemPrice({ id: "MLA1", price: 42 })).toBe(42);
    expect(itemPrice({ id: "MLA1" })).toBeNull();
  });
});
