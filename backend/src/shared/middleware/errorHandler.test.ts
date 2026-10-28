import { describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@surveycraft/shared-types";
import { AppError, errorHandler } from "./errorHandler.js";

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe("AppError", () => {
  it("зберігає message/statusCode/errors", () => {
    const err = new AppError("Bad request", 400, { field: "email" });

    expect(err.message).toBe("Bad request");
    expect(err.statusCode).toBe(400);
    expect(err.errors).toEqual({ field: "email" });
    expect(err).toBeInstanceOf(Error);
  });

  it("errors необов'язковий", () => {
    const err = new AppError("Not found", 404);

    expect(err.errors).toBeUndefined();
  });
});

describe("errorHandler", () => {
  it("для AppError повертає його statusCode і message", () => {
    const res = makeRes();
    const err = new AppError("Forbidden", 403, { reason: "not owner" });

    errorHandler(err, {} as any, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "Forbidden",
      errors: { reason: "not owner" },
    });
  });

  it("для AppError без errors підставляє null", () => {
    const res = makeRes();
    const err = new AppError("Not found", 404);

    errorHandler(err, {} as any, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith({ message: "Not found", errors: null });
  });

  it("для будь-якої іншої помилки повертає 500, не витікає деталей у відповідь, але логує в консоль", () => {
    const res = makeRes();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const internalError = new Error("щось секретне про БД");

    errorHandler(internalError, {} as any, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: ErrorCode.INTERNAL_SERVER_ERROR });
    expect(consoleSpy).toHaveBeenCalledWith(internalError);

    consoleSpy.mockRestore();
  });

  it("для AppError НІЧОГО не логує в консоль (це очікуваний потік, а не збій сервера)", () => {
    const res = makeRes();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    errorHandler(new AppError("Not found", 404), {} as any, res, vi.fn());

    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('обробляє навіть не-Error значення (throw "рядок")', () => {
    const res = makeRes();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    errorHandler("щось незрозуміле", {} as any, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);

    consoleSpy.mockRestore();
  });
});

describe("errorHandler: помилки body-parser", () => {
  const makeRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  it("битий JSON -> 400 REQUEST_BODY_INVALID без логування як 500", () => {
    const res = makeRes();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    errorHandler({ type: "entity.parse.failed" }, {} as any, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "REQUEST_BODY_INVALID" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("надто велике тіло -> 413 REQUEST_TOO_LARGE", () => {
    const res = makeRes();

    errorHandler({ type: "entity.too.large" }, {} as any, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({ message: "REQUEST_TOO_LARGE" });
  });
});
