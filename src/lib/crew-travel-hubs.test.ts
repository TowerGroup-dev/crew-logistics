import { describe, expect, it } from "vitest";
import { worksiteFromMark } from "@/lib/crew-sites";
import {
  DEFAULT_TRAVEL_HUBS,
  formatJourneyNames,
  formatJourneyPath,
  hubFromMark,
  stopoverMenuHubs,
  transitCellMark,
  travelHubName,
} from "@/lib/crew-travel-hubs";

describe("journey arrows", () => {
  it("formats codes with arrows", () => {
    expect(formatJourneyPath(["YK", "YOW", "YHZ"])).toBe("YK → YOW → YHZ");
  });

  it("formats city names with arrows for multi-day transit", () => {
    expect(formatJourneyNames(["YK", "YOW", "YHZ"])).toBe("Yellowknife → Ottawa → Halifax");
  });

  it("marks transit boxes with place names and arrows", () => {
    expect(transitCellMark("YK", { fromTravel: false, toTravel: true })).toBe("Yellowknife→");
    expect(transitCellMark("YOW", { fromTravel: true, toTravel: true })).toBe("→Ottawa→");
    expect(transitCellMark("YHZ", { fromTravel: true, toTravel: false })).toBe("→Halifax");
  });
});

describe("worksites vs pass-through hubs", () => {
  it("keeps camp city names off the default travel-hub list", () => {
    const names = DEFAULT_TRAVEL_HUBS.map((hub) => hub.name);
    const codes = DEFAULT_TRAVEL_HUBS.map((hub) => hub.code);
    expect(names).not.toContain("Kugluktuk");
    expect(names).not.toContain("Iqaluit");
    expect(names).not.toContain("Pond Inlet");
    expect(codes).not.toContain("YCO");
    expect(codes).not.toContain("YFB");
    expect(codes).not.toContain("YIO");
    expect(codes).not.toContain("KUG");
    expect(codes).not.toContain("IQA");
  });

  it("stopover menu is pass-through hubs only", () => {
    const menu = stopoverMenuHubs(DEFAULT_TRAVEL_HUBS);
    expect(menu.some((hub) => hub.code === "YK")).toBe(true);
    expect(menu.some((hub) => ["YCO", "YFB", "YIO", "KUG", "IQA"].includes(hub.code))).toBe(false);
  });

  it("via camp marks are pass-through codes, not worksite stays", () => {
    expect(worksiteFromMark("via KUG")).toBeNull();
    expect(worksiteFromMark("via IQA")).toBeNull();
    expect(hubFromMark("via KUG")).toBe("KUG");
    expect(hubFromMark("YF")).toBe("YK");
    expect(travelHubName("KUG")).toBe("KUG");
    expect(travelHubName("YK")).toBe("Yellowknife");
  });
});
