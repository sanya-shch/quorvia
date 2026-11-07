import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { ASSET_LIMITS } from "@quorvia/shared-types";
import LogoUploader from "./LogoUploader";
import { assetsApi } from "../../../api/assets";

vi.mock("../../../api/assets", () => ({
  assetsApi: { uploadLogo: vi.fn() },
  assetUrl: (id: string) => `http://api.test/assets/${id}`,
}));

const upload = vi.mocked(assetsApi.uploadLogo);

const renderUploader = (assetId: string | null | undefined = null, onChange = vi.fn()) => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <LogoUploader formId="form-1" assetId={assetId} onChange={onChange} />
    </QueryClientProvider>,
  );

  return onChange;
};

const file = (name: string, type: string, size = 100) =>
  new File([new Uint8Array(size)], name, { type });

const pick = async (f: File) => {
  // applyAccept is off: the browser's accept filter is a convenience, the checks live in the component.
  const user = userEvent.setup({ applyAccept: false });
  await user.upload(screen.getByTestId("logo-input"), f);
};

describe("LogoUploader", () => {
  beforeEach(() => {
    upload.mockReset();
  });

  it("offers an upload and no remove button while there is no logo", () => {
    renderUploader(null);

    expect(screen.getByRole("button", { name: "Завантажити логотип" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Видалити" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("uploads the chosen image and reports the new asset id", async () => {
    upload.mockResolvedValue({ id: "asset-9", kind: "LOGO", mime: "image/png", size: 100, width: 8, height: 8 });
    const onChange = renderUploader(null);
    const logo = file("logo.png", "image/png");

    await pick(logo);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("asset-9"));
    expect(upload).toHaveBeenCalledWith("form-1", logo);
  });

  it("shows the current logo with replace and remove actions", async () => {
    const onChange = renderUploader("asset-1");

    expect(document.querySelector("img")).toHaveAttribute("src", "http://api.test/assets/asset-1");
    expect(screen.getByRole("button", { name: "Замінити" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Видалити" }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it.each([
    ["an SVG", file("logo.svg", "image/svg+xml"), "Непідтримуваний тип файлу"],
    ["a GIF", file("a.gif", "image/gif"), "Непідтримуваний тип файлу"],
    ["a too large image", file("big.png", "image/png", ASSET_LIMITS.maxBytes + 1), "завелике"],
  ])("rejects %s without calling the server", async (_label, bad, message) => {
    const onChange = renderUploader(null);

    await pick(bad);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(upload).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the translated server error and keeps the previous logo", async () => {
    upload.mockRejectedValue(
      new AxiosError("fail", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 400,
        data: { message: "ASSET_INVALID_IMAGE" },
      } as never),
    );
    const onChange = renderUploader("asset-1");

    await pick(file("broken.png", "image/png"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Файл не є коректним зображенням");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears the error after a successful upload", async () => {
    upload.mockResolvedValue({ id: "asset-2", kind: "LOGO", mime: "image/png", size: 1, width: 1, height: 1 });
    renderUploader(null);

    await pick(file("a.svg", "image/svg+xml"));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await pick(file("ok.png", "image/png"));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
