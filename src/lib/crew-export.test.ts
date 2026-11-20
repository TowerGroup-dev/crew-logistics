import { describe, expect, it } from "vitest";
import { buildZip, toCsv } from "@/lib/crew-export";

describe("crew-export", () => {
  it("quotes commas, quotes and line breaks; writes CRLF rows", () => {
    const csv = toCsv(
      [
        { a: "plain", b: 3 },
        { a: 'say "hi", ok', b: null },
        { a: "two\nlines", b: true },
      ],
      [
        { header: "A", value: (row) => row.a },
        { header: "B", value: (row) => row.b },
      ],
    );
    expect(csv).toBe('A,B\r\nplain,3\r\n"say ""hi"", ok",\r\n"two\nlines",TRUE\r\n');
  });

  it("builds a zip with one entry per file and a valid end record", async () => {
    const zip = buildZip([
      { name: "a.csv", bytes: new TextEncoder().encode("x,y\r\n") },
      { name: "b.csv", bytes: new TextEncoder().encode("z\r\n") },
    ]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const end = bytes.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
  });
});
