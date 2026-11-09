import { describe, expect, it } from "vitest";
import { FILE_LIMITS } from "@quorvia/shared-types";
import { attachmentDisposition, contentTypeFor, sanitizeFileName } from "./file.name.js";

describe("sanitizeFileName", () => {
  it("keeps an ordinary name", () => {
    expect(sanitizeFileName("report.pdf", "application/pdf")).toBe("report.pdf");
  });

  it("keeps a Cyrillic name that arrived as UTF-8 bytes read as latin1 (multer)", () => {
    const asMulterSeesIt = Buffer.from("Звіт.pdf", "utf8").toString("latin1");

    expect(sanitizeFileName(asMulterSeesIt, "application/pdf")).toBe("Звіт.pdf");
  });

  it("keeps a name that is already decoded", () => {
    expect(sanitizeFileName("Звіт.pdf", "application/pdf")).toBe("Звіт.pdf");
  });

  it.each([
    ["../../etc/passwd", "passwd.txt"],
    ["..\\..\\windows\\system32\\x.txt", "x.txt"],
    ["/absolute/path/file.txt", "file.txt"],
  ])("strips path parts from %j", (raw, expected) => {
    expect(sanitizeFileName(raw, "text/plain")).toBe(expected);
  });

  it("forces the extension to match the real type", () => {
    expect(sanitizeFileName("invoice.exe", "application/pdf")).toBe("invoice.pdf");
    expect(sanitizeFileName("photo.php", "image/png")).toBe("photo.png");
    expect(sanitizeFileName("noextension", "text/plain")).toBe("noextension.txt");
  });

  it("does not let a double extension keep an executable one", () => {
    expect(sanitizeFileName("invoice.pdf.exe", "application/pdf")).toBe("invoice.pdf.pdf");
  });

  it("accepts common alternative extensions of the same type", () => {
    expect(sanitizeFileName("photo.JPEG", "image/jpeg")).toBe("photo.jpeg");
    expect(sanitizeFileName("notes.md", "text/plain")).toBe("notes.md");
  });

  it("removes control characters, quotes and bidi overrides", () => {
    const hostile = 'a\u0000b"c\r\nd\u202Egnp.exe';
    const name = sanitizeFileName(hostile, "application/pdf");

    expect(name).not.toMatch(/[\u0000-\u001f"\u202e]/);
    expect(name.endsWith(".pdf")).toBe(true);
  });

  it("removes characters that are special in headers and file systems", () => {
    expect(sanitizeFileName("a<b>c:d|e?f*g.txt", "text/plain")).toBe("abcdefg.txt");
  });

  it.each(["", "   ", ".", "...", ".hidden", undefined])(
    "falls back to a generic name for %j",
    (raw) => {
      expect(sanitizeFileName(raw, "text/plain")).toMatch(/^(file|hidden)\.txt$/);
    },
  );

  it("never exceeds the maximum length and keeps the extension", () => {
    const name = sanitizeFileName(`${"x".repeat(500)}.pdf`, "application/pdf");

    expect(name.length).toBeLessThanOrEqual(FILE_LIMITS.maxNameLength);
    expect(name.endsWith(".pdf")).toBe(true);
  });
});

describe("attachmentDisposition", () => {
  it("is an attachment with an ASCII fallback and the UTF-8 name", () => {
    const header = attachmentDisposition("Звіт 2026.pdf");

    expect(header).toMatch(/^attachment; /);
    expect(header).toContain('filename="____ 2026.pdf"');
    expect(header).toContain("filename*=UTF-8''%D0%97%D0%B2%D1%96%D1%82%202026.pdf");
  });

  it("cannot be broken out of with quotes or line breaks", () => {
    const header = attachmentDisposition('x".pdf\r\nSet-Cookie: a=b');

    expect(header).not.toMatch(/[\r\n]/);
    expect(header.match(/"/g)).toHaveLength(2);
  });

  it("escapes characters that RFC 5987 reserves", () => {
    expect(attachmentDisposition("it's (1)*.txt")).toContain("it%27s%20%281%29%2A.txt");
  });
});

describe("contentTypeFor", () => {
  it("adds a charset for text and leaves the other types alone", () => {
    expect(contentTypeFor("text/plain")).toBe("text/plain; charset=utf-8");
    expect(contentTypeFor("application/pdf")).toBe("application/pdf");
  });
});
