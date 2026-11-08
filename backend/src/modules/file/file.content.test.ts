import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { ErrorCode, FILE_LIMITS } from "@quorvia/shared-types";
import { inspectFile } from "./file.content.js";
import { GIF, SVG, makeJpeg, makePng, makeWebp, withPngTextChunk } from "../asset/testImages.js";

const rejectsWith = (input: Buffer, code: string) =>
  expect(inspectFile(input)).rejects.toMatchObject({ message: code });

const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n");

describe("inspectFile: accepted types", () => {
  it("accepts a PDF and stores it unchanged", async () => {
    const result = await inspectFile(PDF);

    expect(result.mime).toBe("application/pdf");
    expect(result.data.equals(PDF)).toBe(true);
  });

  it("accepts plain UTF-8 text, Cyrillic included, unchanged", async () => {
    const text = Buffer.from("Звіт за місяць\r\n\tРядок з табуляцією\n", "utf8");
    const result = await inspectFile(text);

    expect(result.mime).toBe("text/plain");
    expect(result.data.equals(text)).toBe(true);
  });

  it("re-encodes PNG, JPEG and WebP images", async () => {
    expect((await inspectFile(await makePng())).mime).toBe("image/png");
    expect((await inspectFile(await makeJpeg())).mime).toBe("image/jpeg");
    expect((await inspectFile(await makeWebp())).mime).toBe("image/webp");
  });

  it("drops EXIF and hidden chunks from images, like for the logo", async () => {
    const withExif = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } })
      .jpeg()
      .withExif({ IFD0: { Copyright: "secret-owner" } })
      .toBuffer();
    const hidden = withPngTextChunk(await makePng(), "note", "hidden-comment");

    expect((await inspectFile(withExif)).data.includes(Buffer.from("secret-owner"))).toBe(false);
    expect((await inspectFile(hidden)).data.includes(Buffer.from("hidden-comment"))).toBe(false);
  });

  it("drops data appended after an image (polyglot)", async () => {
    const payload = Buffer.from("<script>alert(1)</script>");
    const { data } = await inspectFile(Buffer.concat([await makePng(), payload]));

    expect(data.includes(payload)).toBe(false);
  });

  it("allows larger images than the logo, scaling only above the file limit dimension", async () => {
    const { data } = await inspectFile(await makePng(3000, 2000));
    const meta = await sharp(data).metadata();

    expect(meta.width).toBe(3000);
    expect(meta.height).toBe(2000);
  });

  it("scales images beyond the maximum dimension down", async () => {
    const { data } = await inspectFile(await makePng(FILE_LIMITS.maxImageDimension + 1000, 100));

    expect((await sharp(data).metadata()).width).toBe(FILE_LIMITS.maxImageDimension);
  });
});

describe("inspectFile: rejected content", () => {
  it.each([
    ["a GIF", GIF],
    ["a ZIP / Office document", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 1, 2, 3, 4])],
    ["a Windows executable", Buffer.concat([Buffer.from("MZ"), Buffer.alloc(100, 1)])],
    ["a Linux executable", Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(100, 1)])],
    ["a shell script with NUL bytes", Buffer.from("#!/bin/sh\0echo hi")],
    ["random binary data", Buffer.from(Array.from({ length: 200 }, (_, i) => (i * 37) % 256))],
    ["invalid UTF-8", Buffer.from([0xff, 0xfe, 0xfd, 0x41, 0x42])],
    ["text with control characters", Buffer.from("hello\u0007world")],
  ])("rejects %s as an unsupported type", async (_label, data) => {
    await rejectsWith(data, ErrorCode.FILE_INVALID_TYPE);
  });

  it("rejects an empty file", async () => {
    await rejectsWith(Buffer.alloc(0), ErrorCode.FILE_INVALID_CONTENT);
  });

  it("requires the PDF signature at the very start (otherwise it is just text or unsupported)", async () => {
    const result = await inspectFile(Buffer.concat([Buffer.from("<script>"), PDF]));

    expect(result.mime).toBe("text/plain");
  });

  it("treats markup such as SVG as plain text, never as an image", async () => {
    // Valid UTF-8 without control characters is text. It is stored and served as text/plain, always
    // as a download with nosniff, so the markup is never interpreted.
    expect((await inspectFile(SVG)).mime).toBe("text/plain");
  });

  it("rejects bytes with an image signature that are not an image", async () => {
    const fake = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("not really a png"),
    ]);

    await rejectsWith(fake, ErrorCode.FILE_INVALID_CONTENT);
  });

  it("rejects an image bomb", async () => {
    const bomb = await sharp({ create: { width: 7000, height: 7000, channels: 3, background: "#000" } })
      .png({ compressionLevel: 9 })
      .toBuffer();

    await rejectsWith(bomb, ErrorCode.FILE_INVALID_CONTENT);
  });

  it("rejects anything above the size limit before looking at it", async () => {
    await rejectsWith(Buffer.alloc(FILE_LIMITS.maxBytes + 1, 0x61), ErrorCode.FILE_TOO_LARGE);
  });

  it("accepts text exactly at the size limit", async () => {
    const result = await inspectFile(Buffer.alloc(FILE_LIMITS.maxBytes, 0x61));

    expect(result.mime).toBe("text/plain");
  });
});
