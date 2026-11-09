import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { ErrorCode, FILE_LIMITS } from "@quorvia/shared-types";
import { errorHandler, AppError } from "../../shared/middleware/errorHandler.js";
import { TEST_JWT_SECRET, makeAuthHeader } from "../../test/testApp.js";

vi.mock("./file.service.js", () => ({
  uploadResponseFile: vi.fn(),
  deleteUnattachedFile: vi.fn(),
  getOwnerFile: vi.fn(),
}));

const service = await import("./file.service.js");
const { fileRoutes } = await import("./file.routes.js");

const app = express();
app.use(express.json());
app.use("/api/forms", fileRoutes);
app.use(errorHandler);

const DTO = { id: "file-1", name: "report.pdf", size: 12, mime: "application/pdf" };
const SESSION = "11111111-1111-4111-8111-111111111111";
const bytes = Buffer.from("%PDF-1.7 content");

const upload = (shareId = "share-1") =>
  request(app)
    .post(`/api/forms/${shareId}/files`)
    .field("sessionKey", SESSION)
    .field("questionId", "q1");

beforeAll(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/forms/:shareId/files (anonymous)", () => {
  it("201 without any authentication and passes only the bytes and the claimed name on", async () => {
    (service.uploadResponseFile as any).mockResolvedValue(DTO);

    const res = await upload().attach("file", bytes, {
      filename: "report.pdf",
      contentType: "application/zip",
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(DTO);
    expect(service.uploadResponseFile).toHaveBeenCalledWith({
      shareId: "share-1",
      sessionKey: SESSION,
      questionId: "q1",
      rawName: "report.pdf",
      data: bytes,
    });
  });

  it("400 FILE_UPLOAD_INVALID without a file", async () => {
    const res = await upload();

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(ErrorCode.FILE_UPLOAD_INVALID);
    expect(service.uploadResponseFile).not.toHaveBeenCalled();
  });

  it.each([
    ["no session key", { questionId: "q1" }],
    ["no question id", { sessionKey: SESSION }],
    ["an overlong session key", { sessionKey: "k".repeat(101), questionId: "q1" }],
  ])("400 FILE_UPLOAD_INVALID with %s", async (_label, fields) => {
    let req = request(app).post("/api/forms/share-1/files");
    for (const [name, value] of Object.entries(fields)) req = req.field(name, value);

    const res = await req.attach("file", bytes, "a.pdf");

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(ErrorCode.FILE_UPLOAD_INVALID);
    expect(service.uploadResponseFile).not.toHaveBeenCalled();
  });

  it("400 for the file under another field name and for several files", async () => {
    const wrongField = await upload().attach("upload", bytes, "a.pdf");
    const two = await upload().attach("file", bytes, "a.pdf").attach("file", bytes, "b.pdf");

    expect(wrongField.body.message).toBe(ErrorCode.FILE_UPLOAD_INVALID);
    expect(two.body.message).toBe(ErrorCode.FILE_UPLOAD_INVALID);
  });

  it("413 FILE_TOO_LARGE above the size limit, before the service is called", async () => {
    const big = Buffer.alloc(FILE_LIMITS.maxBytes + 1024, 0x61);

    const res = await upload().attach("file", big, "big.txt");

    expect(res.status).toBe(413);
    expect(res.body.message).toBe(ErrorCode.FILE_TOO_LARGE);
    expect(service.uploadResponseFile).not.toHaveBeenCalled();
  });

  it("passes service errors through", async () => {
    (service.uploadResponseFile as any).mockRejectedValue(
      new AppError(ErrorCode.FILE_LIMIT_REACHED, 409),
    );

    const res = await upload().attach("file", bytes, "a.pdf");

    expect(res.status).toBe(409);
    expect(res.body.message).toBe(ErrorCode.FILE_LIMIT_REACHED);
  });
});

describe("DELETE /api/forms/:shareId/files/:fileId (anonymous)", () => {
  it("204 and passes the session key from the query", async () => {
    (service.deleteUnattachedFile as any).mockResolvedValue(undefined);

    const res = await request(app).delete(`/api/forms/share-1/files/file-1?sessionKey=${SESSION}`);

    expect(res.status).toBe(204);
    expect(service.deleteUnattachedFile).toHaveBeenCalledWith("share-1", SESSION, "file-1");
  });

  it("400 without a session key", async () => {
    const res = await request(app).delete("/api/forms/share-1/files/file-1");

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(ErrorCode.FILE_UPLOAD_INVALID);
  });

  it("404 for a file that is not the caller's", async () => {
    (service.deleteUnattachedFile as any).mockRejectedValue(
      new AppError(ErrorCode.FILE_NOT_FOUND, 404),
    );

    const res = await request(app).delete(`/api/forms/share-1/files/file-1?sessionKey=${SESSION}`);

    expect(res.status).toBe(404);
  });
});

describe("GET /api/forms/:formId/responses/:responseId/files/:fileId (owner)", () => {
  const url = "/api/forms/f1/responses/r1/files/file-1";

  it("401 without a token", async () => {
    const res = await request(app).get(url);

    expect(res.status).toBe(401);
    expect(service.getOwnerFile).not.toHaveBeenCalled();
  });

  it("serves the bytes as a private, non-sniffable attachment", async () => {
    (service.getOwnerFile as any).mockResolvedValue({
      data: bytes,
      name: "Звіт.pdf",
      mime: "application/pdf",
    });

    const res = await request(app)
      .get(url)
      .set("Authorization", makeAuthHeader("owner-1"))
      .buffer(true);

    expect(res.status).toBe(200);
    expect(service.getOwnerFile).toHaveBeenCalledWith("f1", "r1", "file-1", "owner-1");
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="/);
    expect(res.headers["content-disposition"]).toContain("filename*=UTF-8''");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBe("default-src 'none'; sandbox");
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(Buffer.from(res.body).equals(bytes)).toBe(true);
  });

  it("serves text with an explicit charset", async () => {
    (service.getOwnerFile as any).mockResolvedValue({
      data: Buffer.from("hi"),
      name: "a.txt",
      mime: "text/plain",
    });

    const res = await request(app).get(url).set("Authorization", makeAuthHeader("owner-1"));

    expect(res.headers["content-type"]).toBe("text/plain; charset=utf-8");
  });

  it("passes 403 and 404 from the service through", async () => {
    (service.getOwnerFile as any).mockRejectedValue(new AppError(ErrorCode.FORM_FORBIDDEN, 403));

    const res = await request(app).get(url).set("Authorization", makeAuthHeader("someone-else"));

    expect(res.status).toBe(403);
  });
});
