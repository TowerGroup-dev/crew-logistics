import { describe, expect, it } from "vitest";
import { diff, fillMissing, merge3 } from "./crew-merge";

describe("shared data merge", () => {
  const base = {
    version: 1,
    rotations: [
      { id: "a", personId: "bryan", notes: "", moves: [] as { id: string; toSite: string }[] },
      { id: "b", personId: "eric", notes: "" },
    ],
    ops: { bryan: { returnFlight: "needed" }, eric: { returnFlight: "needed" } },
  };

  it("keeps both people's edits when they touch different stays", () => {
    const yimika = structuredClone(base);
    yimika.rotations[0]!.notes = "Linger for snow";
    const katrina = structuredClone(base);
    katrina.rotations[1]!.notes = "Booked hotel";
    const merged = merge3(base, yimika, katrina);
    expect(merged.rotations.map((row) => row.notes)).toEqual(["Linger for snow", "Booked hotel"]);
  });

  it("keeps both when one adds a move and the other edits a booking", () => {
    const yimika = structuredClone(base);
    yimika.rotations[0]!.moves = [{ id: "m1", toSite: "POND" }];
    const katrina = structuredClone(base);
    katrina.ops.eric.returnFlight = "booked";
    const merged = merge3(base, yimika, katrina);
    expect(merged.rotations[0]!.moves).toEqual([{ id: "m1", toSite: "POND" }]);
    expect(merged.ops.eric.returnFlight).toBe("booked");
  });

  it("adds new records from both sides and honours deletes", () => {
    const yimika = { ...structuredClone(base), rotations: [...base.rotations, { id: "c", personId: "dean", notes: "" }] };
    const katrina = { ...structuredClone(base), rotations: [base.rotations[0]!] };
    const merged = merge3(base, yimika, katrina);
    expect(merged.rotations.map((row) => row.id)).toEqual(["a", "c"]);
  });

  it("same field changed by both: the later save wins for that field only", () => {
    const yimika = structuredClone(base);
    yimika.rotations[0]!.notes = "Mine";
    const katrina = structuredClone(base);
    katrina.rotations[0]!.notes = "Theirs";
    katrina.rotations[0]!.personId = "bryan";
    expect(merge3(base, yimika, katrina).rotations[0]!.notes).toBe("Mine");
  });

  it("no changes means no diff", () => {
    expect(diff(base, structuredClone(base))).toEqual([]);
  });
});

describe("first sync of a browser that already had data", () => {
  it("keeps the shared copy and adds only what is missing from it", () => {
    const shared = { rotations: [{ id: "a", notes: "shared" }], ops: { bryan: { returnFlight: "booked" } } };
    const local = { rotations: [{ id: "a", notes: "old local" }, { id: "b", notes: "only here" }], ops: { bryan: { returnFlight: "needed" }, eric: { returnFlight: "needed" } } };
    const out = fillMissing(shared, local);
    expect(out.rotations).toEqual([{ id: "a", notes: "shared" }, { id: "b", notes: "only here" }]);
    expect(out.ops).toEqual({ bryan: { returnFlight: "booked" }, eric: { returnFlight: "needed" } });
  });
});
