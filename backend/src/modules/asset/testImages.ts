import sharp from "sharp";

// Small valid images for the asset tests, generated with the same decoder the code uses.
export const makePng = (width = 8, height = 8) =>
  sharp({ create: { width, height, channels: 3, background: "#3366ff" } })
    .png()
    .toBuffer();

export const makeJpeg = (width = 8, height = 8) =>
  sharp({ create: { width, height, channels: 3, background: "#3366ff" } })
    .jpeg()
    .toBuffer();

export const makeWebp = (width = 8, height = 8) =>
  sharp({ create: { width, height, channels: 3, background: "#3366ff" } })
    .webp()
    .toBuffer();

export const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);

export const GIF = Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;", "binary");

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (data: Buffer): number => {
  let c = 0xffffffff;
  for (const byte of data) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

// Inserts a tEXt chunk right after IHDR: a valid PNG that carries a hidden text.
export const withPngTextChunk = (png: Buffer, keyword: string, text: string): Buffer => {
  const body = Buffer.concat([Buffer.from(keyword), Buffer.from([0]), Buffer.from(text)]);
  const type = Buffer.from("tEXt");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, body])));
  const chunk = Buffer.concat([length, type, body, crc]);

  // 8 signature bytes + 25 bytes of the IHDR chunk.
  return Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]);
};
