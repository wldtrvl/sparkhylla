import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { htmlToBody, isChapterTitle, textToBody } = await import("@/lib/import/html");
const { draftFromFile } = await import("@/lib/import/file");
const { publicDomainInNorway, supportedUrl } = await import("@/lib/import/sources");
const { analyzeBody } = await import("@/lib/import/analyze");

describe("import: HTML and text to the body format", () => {
  it("keeps running text and headings, drops tables, notes and reference sections", () => {
    const html = `<div class="mw-parser-output">
      <table class="infobox"><tr><td>Areal 42 km²</td></tr></table>
      <p>Bergen er en by<sup class="reference">[1]</sup> på Vestlandet.</p>
      <h2>Historie<span class="mw-editsection">rediger</span></h2>
      <p>Byen ble grunnlagt i 1070.</p>
      <h2>Tom seksjon</h2>
      <h2>Referanser</h2><p>Kilde: noe.</p></div>`;
    expect(htmlToBody(html)).toBe("Bergen er en by på Vestlandet.\n\n## Historie\n\nByen ble grunnlagt i 1070.");
  });

  it("joins wrapped lines, marks chapter titles, removes illustration notes", () => {
    const raw = "CHAPTER I.\r\n\r\nIt was a dark\r\nand stormy night.\r\n\r\n[Illustration: a house]\r\n\r\n\r\nThe end came.";
    expect(textToBody(raw)).toBe("## CHAPTER I\n\nIt was a dark and stormy night.\n\nThe end came.");
    expect(isChapterTitle("KAPITTEL 3")).toBe(true);
    expect(isChapterTitle("XII.")).toBe(true);
    expect(isChapterTitle("«NEI!»")).toBe(false);
    expect(isChapterTitle("Hun gikk hjem.")).toBe(false);
  });
});

describe("import: rights and sources", () => {
  it("applies Norway's 70-year rule", () => {
    const now = new Date("2026-10-04");
    expect(publicDomainInNorway(1955, now)).toBe(true); // free since 1 Jan 2026
    expect(publicDomainInNorway(1956, now)).toBe(false);
  });

  it("accepts only the supported hosts", () => {
    expect(supportedUrl("https://no.wikisource.org/wiki/Eventyr")).not.toBeNull();
    expect(supportedUrl("https://snl.no/fjord")).not.toBeNull();
    expect(supportedUrl("https://www.gutenberg.org/ebooks/14838")).not.toBeNull();
    expect(supportedUrl("https://example.com/book.txt")).toBeNull();
    expect(supportedUrl("http://169.254.169.254/latest")).toBeNull();
    expect(supportedUrl("file:///etc/passwd")).toBeNull();
  });
});

describe("import: files", () => {
  it("reads an EPUB in spine order, skips the nav document, and asks the coach to confirm rights", () => {
    const xhtml = (body: string) => `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body>${body}</body></html>`;
    const epub = zipSync({
      "META-INF/container.xml": strToU8(`<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`),
      "OEBPS/content.opf": strToU8(`<package><metadata><dc:title>Smørbukk</dc:title><dc:creator>Asbjørnsen og Moe</dc:creator><dc:language>nb</dc:language><dc:date>1928-01-01</dc:date><dc:rights>Public domain</dc:rights></metadata>
        <manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c2" href="text/c2.xhtml" media-type="application/xhtml+xml"/><item id="c1" href="text/c1.xhtml" media-type="application/xhtml+xml"/></manifest>
        <spine><itemref idref="nav"/><itemref idref="c1"/><itemref idref="c2"/></spine></package>`),
      "OEBPS/nav.xhtml": strToU8(xhtml("<nav><p>Innhold</p></nav><p>Innholdsfortegnelse</p>")),
      "OEBPS/text/c1.xhtml": strToU8(xhtml("<h1>Smørbukk</h1><p>Det var engang en kjerring.</p>")),
      "OEBPS/text/c2.xhtml": strToU8(xhtml("<p>Så gikk hun hjem igjen.</p>")),
    });
    const d = draftFromFile("smorbukk.epub", epub);
    expect(d.body).toBe("## Smørbukk\n\nDet var engang en kjerring.\n\nSå gikk hun hjem igjen.");
    expect(d).toMatchObject({ title: "Smørbukk", author: "Asbjørnsen og Moe", year: "1928", lang: "no", rights: "check" });
  });

  it("decodes older Windows-1252 text files and strips Gutenberg boilerplate", () => {
    const latin1 = new Uint8Array([...new TextEncoder().encode("Header\n*** START OF THE PROJECT GUTENBERG EBOOK X ***\n"), 0x48, 0xe5, 0x6e, 0x20, 0x67, 0x69, 0x6b, 0x6b, 0x2e, ...new TextEncoder().encode("\n*** END OF THE PROJECT GUTENBERG EBOOK X ***\nLicense")]);
    const d = draftFromFile("bok.txt", latin1);
    expect(d.body).toBe("Hån gikk.");
  });

  it("flags capitalised nouns (pre-1907 spelling) and old riksmål spelling", () => {
    const pre1907 = "Da han kom til Kongsgaarden, saae han en Mand med en Hest og en Hund ved Døren og Vinduet. ".repeat(5);
    expect(analyzeBody(pre1907, "no").warnings.join(" ")).toMatch(/большой буквы/);
    const riksmal = "Han satte sig ned, for han vilde hvile efter turen, og hun kunde ikke se ham. ".repeat(5);
    expect(analyzeBody(riksmal, "no").orthography).toBe("old");
  });
});
