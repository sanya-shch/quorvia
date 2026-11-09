import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { ASSET_LIMITS, ErrorCode } from "@quorvia/shared-types";
import { errorHandler, AppError } from "../../shared/middleware/errorHandler.js";
import { TEST_JWT_SECRET, makeAuthHeader } from "../../test/testApp.js";

vi.mock("./asset.service.js", () => ({
  uploadAsset: vi.fn(),
  getAssetContent: vi.fn(),
}));

const service = await import("./asset.service.js");
const { formAssetRoutes, publicAssetRoutes } = await import("./asset.routes.js");

const app = express();
app.use(express.json());
app.use("/api/forms", formAssetRoutes);
app.use("/api/assets", publicAssetRoutes);
app.use(errorHandler);

const AUTH = makeAuthHeader("user-1");
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const DTO = { id: "asset-1", kind: "LOGO", mime: "image/png", size: 11, width: 8, height: 8 };

beforeAll(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/forms/:formId/assets", () => {
  it("401 without a token, and the body is not even parsed", async () => {
    const res = await request(app).post("/api/forms/f1/assets").attach("file", png, "logo.png");

    expect(res.status).toBe(401);
    expect(service.uploadAsset).not.toHaveBeenCalled();
  });

  it("201 passes the owner, the form, the kind and the bytes to the service", async () => {
    (service.uploadAsset as any).mockResolvedValue(DTO);

    const res = await request(app)
      .post("/api/forms/f1/assets")
      .set("Authorization", AUTH)
      .field("kind", "LOGO")
      .attach("file", png, "logo.png");

    expect(res.status).toBe(201);
    expect(res.body).toEqual(DTO);
    expect(service.uploadAsset).toHaveBeenCalledWith("f1", "user-1", "LOGO", png);
  });

  it("defaults the kind to LOGO", async () => {
    (service.uploadAsset as any).mockResolvedValue(DTO);

    await request(app)
      .post("/api/forms/f1/assets")
      .set("Authorization", AUTH)
      .attach("file", png, "a.png");

    expect((service.uploadAsset as any).mock.calls[0][2]).toBe("LOGO");
  });

  it("does not trust the client's file name or content type", async () => {
    (service.uploadAsset as any).mockResolvedValue(DTO);

    const res = await request(app)
      .post("/api/forms/f1/assets")
      .set("Authorization", AUTH)
      .attach("file", png, { filename: "evil.svg", contentType: "image/svg+xml" });

    expect(res.status).toBe(201);
    // Only the bytes reach the service: it decides the type itself.
    expect((service.uploadAsset as any).mock.calls[0]).toHaveLength(4);
  });

  it("400 ASSET_UPLOAD_INVALID when there is no file", async () => {
    const res = await request(app)
      .post("/api/forms/f1/assets")
      .set("Authorization", AUTH)
      .field("kind", "LOGO");

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(ErrorCode.ASSET_UPLOAD_INVALID);
    expect(service.uploadAsset).not.toHaveBeenCalled();
  });

  it("400 ASSET_UPLOAD_INVALID for an unknown kind", async () => {
    const res = await request(app)
      .post("/api/forms/f1/assets")
      .set("Authorization", AUTH)
      .field("kind", "SCRIPT")
      .attach("file", png, "a.png");

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(ErrorCode.ASSET_UPLOAD_INVALID);
  });

  it("400 ASSET_UPLOAD_INVALID when the file is under a different field name", async () => {
    const res = await request(app)
      .post("/api/forms/f1/assets")
      .set("Authorization", AUTH)
      .attach("upload", png, "a.png");

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(ErrorCode.ASSET_UPLOAD_INVALID);
  });

  it("400 ASSET_UPLOAD_INVALID for more than one file", async () => {
    const res = await request(app)
      .post("/api/forms/f1/assets")
      .set("Authorization", AUTH)
      .attach("file", png, "a.png")
      .attach("file", png, "b.png");

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(ErrorCode.ASSET_UPLOAD_INVALID);
  });

  it("413 ASSET_TOO_LARGE above the size limit, before the service is called", async () => {
    const big = Buffer.concat([png, Buffer.alloc(ASSET_LIMITS.maxBytes)]);

    const res = await request(app)
      .post("/api/forms/f1/assets")
      .set("Authorization", AUTH)
      .attach("file", big, "big.png");

    expect(res.status).toBe(413);
    expect(res.body.message).toBe(ErrorCode.ASSET_TOO_LARGE);
    expect(service.uploadAsset).not.toHaveBeenCalled();
  });

  it("passes service errors through (for example someone else's form)", async () => {
    (service.uploadAsset as any).mockRejectedValue(new AppError(ErrorCode.FORM_FORBIDDEN, 403));

    const res = await request(app)
      .post("/api/forms/f1/assets")
      .set("Authorization", AUTH)
      .attach("file", png, "a.png");

    expect(res.status).toBe(403);
    expect(res.body.message).toBe(ErrorCode.FORM_FORBIDDEN);
  });
});

describe("GET /api/assets/:assetId", () => {
  it("serves the bytes with hardening headers and no authentication", async () => {
    (service.getAssetContent as any).mockResolvedValue({ data: png, mime: "image/png" });

    const res = await request(app).get("/api/assets/asset-1");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBe("default-src 'none'; sandbox");
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(res.headers["cache-control"]).toContain("immutable");
    expect(res.headers["content-length"]).toBe(String(png.length));
    expect(Buffer.from(res.body).equals(png)).toBe(true);
  });

  it("404 ASSET_NOT_FOUND for an unknown id", async () => {
    (service.getAssetContent as any).mockRejectedValue(
      new AppError(ErrorCode.ASSET_NOT_FOUND, 404),
    );

    const res = await request(app).get("/api/assets/missing");

    expect(res.status).toBe(404);
    expect(res.body.message).toBe(ErrorCode.ASSET_NOT_FOUND);
  });
});
