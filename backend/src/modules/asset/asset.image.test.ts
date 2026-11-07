import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { ASSET_LIMITS, ErrorCode } from "@quorvia/shared-types";
import { processImage, sniffImageType } from "./asset.image.js";
import { GIF, SVG, makeJpeg, makePng, makeWebp, withPngTextChunk } from "./testImages.js";

const rejectsWith = async (input: Buffer, code: string) => {
  await expect(processImage(input)).rejects.toMatchObject({ message: code });
};

describe("sniffImageType", () => {
  it("recognizes PNG, JPEG and WebP by their leading bytes", async () => {
    expect(sniffImageType(await makePng())).toBe("image/png");
    expect(sniffImageType(await makeJpeg())).toBe("image/jpeg");
    expect(sniffImageType(await makeWebp())).toBe("image/webp");
  });

  it("rejects SVG, GIF, text and empty input", () => {
    expect(sniffImageType(SVG)).toBeNull();
    expect(sniffImageType(GIF)).toBeNull();
    expect(sniffImageType(Buffer.from("hello world, definitely not an image"))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe("processImage", () => {
  it("re-encodes each allowed format into the same format", async () => {
    expect((await processImage(await makePng())).mime).toBe("image/png");
    expect((await processImage(await makeJpeg())).mime).toBe("image/jpeg");
    expect((await processImage(await makeWebp())).mime).toBe("image/webp");
  });

  it("reports the real dimensions of the result", async () => {
    const result = await processImage(await makePng(40, 20));

    expect(result).toMatchObject({ width: 40, height: 20 });
    expect((await sharp(result.data).metadata()).width).toBe(40);
  });

  it("scales large images down and keeps the aspect ratio", async () => {
    const result = await processImage(await makePng(2048, 1024));

    expect(result.width).toBe(ASSET_LIMITS.maxDimension);
    expect(result.height).toBe(ASSET_LIMITS.maxDimension / 2);
  });

  it("does not enlarge small images", async () => {
    expect(await processImage(await makePng(16, 16))).toMatchObject({ width: 16, height: 16 });
  });

  it("strips EXIF metadata (for example GPS and copyright)", async () => {
    const withExif = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } })
      .jpeg()
      .withExif({ IFD0: { Copyright: "secret-owner" } })
      .toBuffer();

    expect(withExif.includes(Buffer.from("secret-owner"))).toBe(true);

    const { data } = await processImage(withExif);

    expect(data.includes(Buffer.from("secret-owner"))).toBe(false);
    expect((await sharp(data).metadata()).exif).toBeUndefined();
  });

  it("drops data appended after the image (a polyglot file)", async () => {
    const payload = Buffer.from("<script>alert('polyglot')</script>");
    const polyglot = Buffer.concat([await makePng(), payload]);

    expect(sniffImageType(polyglot)).toBe("image/png");

    const { data } = await processImage(polyglot);

    expect(data.includes(payload)).toBe(false);
  });

  it("drops text hidden in a PNG metadata chunk", async () => {
    const png = withPngTextChunk(await makePng(), "note", "hidden-comment");

    expect(png.includes(Buffer.from("hidden-comment"))).toBe(true);
    expect(sniffImageType(png)).toBe("image/png");

    const { data } = await processImage(png);

    expect(data.includes(Buffer.from("hidden-comment"))).toBe(false);
  });

  it("rejects SVG and GIF as an unsupported type", async () => {
    await rejectsWith(SVG, ErrorCode.ASSET_INVALID_TYPE);
    await rejectsWith(GIF, ErrorCode.ASSET_INVALID_TYPE);
  });

  it("rejects bytes that have a PNG signature but are not an image", async () => {
    const fake = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("this is not a real png body"),
    ]);

    await rejectsWith(fake, ErrorCode.ASSET_INVALID_IMAGE);
  });

  it("rejects a truncated image", async () => {
    const png = await makePng(64, 64);

    await rejectsWith(png.subarray(0, Math.floor(png.length / 2)), ErrorCode.ASSET_INVALID_IMAGE);
  });

  it("rejects images with too many pixels (decompression bomb)", async () => {
    // Tiny on disk, but about 25 million pixels once decoded.
    const bomb = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: "#000" } })
      .png({ compressionLevel: 9 })
      .toBuffer();

    expect(bomb.length).toBeLessThan(ASSET_LIMITS.maxBytes);
    await rejectsWith(bomb, ErrorCode.ASSET_INVALID_IMAGE);
  });
});
