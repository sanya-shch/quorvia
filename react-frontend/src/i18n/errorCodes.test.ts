import { describe, expect, it } from "vitest";
import { AxiosError } from "axios";
import i18n from "./index";
import { getApiErrorCode, getApiErrorMessage } from "./errorCodes";

const axiosError = (data: unknown) =>
  new AxiosError("fail", "ERR", undefined, undefined, { status: 409, data } as never);

describe("getApiErrorCode", () => {
  it("дістає код з поля message відповіді axios-помилки", () => {
    expect(getApiErrorCode(axiosError({ message: "FORM_VERSION_CONFLICT" }))).toBe(
      "FORM_VERSION_CONFLICT",
    );
  });

  it("undefined для не-axios помилок і відповідей без message", () => {
    expect(getApiErrorCode(new Error("boom"))).toBeUndefined();
    expect(getApiErrorCode(axiosError({}))).toBeUndefined();
    expect(getApiErrorCode(null)).toBeUndefined();
  });
});

describe("getApiErrorMessage", () => {
  it("перекладає відомий код", () => {
    const message = getApiErrorMessage(i18n.t.bind(i18n) as never, axiosError({ message: "FORM_VERSION_CONFLICT" }));

    expect(message).toContain("Форму змінили");
  });

  it("невідомий код і не-axios помилка дають загальний текст", () => {
    const t = i18n.t.bind(i18n) as never;
    const unknown = i18n.t("errors.UNKNOWN");

    expect(getApiErrorMessage(t, axiosError({ message: "SOMETHING_NEW" }))).toBe(unknown);
    expect(getApiErrorMessage(t, new Error("x"))).toBe(unknown);
  });
});
