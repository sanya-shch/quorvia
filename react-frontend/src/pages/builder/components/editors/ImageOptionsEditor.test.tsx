import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { ASSET_LIMITS, IMAGE_CHOICE_LIMITS } from "@quorvia/shared-types";
import ImageOptionsEditor from "./ImageOptionsEditor";
import { assetsApi } from "../../../../api/assets";
import type { QuestionOption } from "../../../../types/formBuilder";

vi.mock("../../../../api/assets", () => ({
  assetsApi: { uploadOptionImage: vi.fn() },
  assetUrl: (id: string) => `http://api.test/assets/${id}`,
}));

const upload = vi.mocked(assetsApi.uploadOptionImage);

const option = (id: string, extra: Partial<QuestionOption> = {}): QuestionOption => ({
  id,
  text: `Текст ${id}`,
  isDefault: false,
  ...extra,
});

const setup = (options: QuestionOption[] = [option("a", { imageAssetId: "img-a" }), option("b")]) => {
  const onChange = vi.fn();

  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <ImageOptionsEditor formId="form-1" options={options} onChange={onChange} />
    </QueryClientProvider>,
  );

  return { onChange, user: userEvent.setup({ applyAccept: false }) };
};

const file = (name: string, type: string, size = 100) => new File([new Uint8Array(size)], name, { type });

describe("ImageOptionsEditor", () => {
  beforeEach(() => {
    upload.mockReset();
  });

  it("shows each option with its label and picture", () => {
    setup();

    expect(screen.getByLabelText("Підпис варіанта 1")).toHaveValue("Текст a");
    expect(document.querySelector("img")).toHaveAttribute("src", "http://api.test/assets/img-a");
    expect(screen.getByText("Без картинки")).toBeInTheDocument();
  });

  it("edits the label of one option and keeps the others", async () => {
    const { onChange, user } = setup();

    await user.type(screen.getByLabelText("Підпис варіанта 2"), "!");

    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: "a", text: "Текст a" }),
      expect.objectContaining({ id: "b", text: "Текст b!" }),
    ]);
  });

  it("uploads a picture and attaches it to that option", async () => {
    upload.mockResolvedValue({ id: "new-img", kind: "OPTION_IMAGE", mime: "image/png", size: 1, width: 1, height: 1 });
    const { onChange, user } = setup();
    const picture = file("b.png", "image/png");

    await user.upload(screen.getByTestId("option-image-input-b"), picture);

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: "a", imageAssetId: "img-a" }),
        expect.objectContaining({ id: "b", imageAssetId: "new-img" }),
      ]),
    );
    expect(upload).toHaveBeenCalledWith("form-1", picture);
  });

  it.each([
    ["an SVG", file("x.svg", "image/svg+xml"), "Непідтримуваний тип файлу"],
    ["a too large image", file("big.png", "image/png", ASSET_LIMITS.maxBytes + 1), "завелике"],
  ])("rejects %s on the client without a request", async (_label, bad, message) => {
    const { onChange, user } = setup();

    await user.upload(screen.getByTestId("option-image-input-b"), bad);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(upload).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows a server error under the option it belongs to", async () => {
    upload.mockRejectedValue(
      new AxiosError("fail", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 400,
        data: { message: "ASSET_INVALID_IMAGE" },
      } as never),
    );
    const { onChange, user } = setup();

    await user.upload(screen.getByTestId("option-image-input-a"), file("a.png", "image/png"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Файл не є коректним зображенням");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes only the picture of an option", async () => {
    const { onChange, user } = setup();

    await user.click(screen.getByRole("button", { name: "Прибрати картинку варіанта 1" }));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: "a", imageAssetId: null, text: "Текст a" }),
      expect.objectContaining({ id: "b" }),
    ]);
  });

  it("adds an option with a default label", async () => {
    const { onChange, user } = setup();

    await user.click(screen.getByRole("button", { name: "+ Додати варіант" }));

    const next = onChange.mock.calls[0]![0] as QuestionOption[];
    expect(next).toHaveLength(3);
    expect(next[2]).toMatchObject({ text: "Варіант 3", isDefault: false });
  });

  it("cannot add beyond the maximum", () => {
    setup(Array.from({ length: IMAGE_CHOICE_LIMITS.maxOptions }, (_, i) => option(`o${i}`)));

    expect(screen.getByRole("button", { name: "+ Додати варіант" })).toBeDisabled();
  });

  it("cannot delete below the minimum", () => {
    setup(Array.from({ length: IMAGE_CHOICE_LIMITS.minOptions }, (_, i) => option(`o${i}`)));

    expect(screen.getByRole("button", { name: "Видалити варіант 1" })).toBeDisabled();
  });

  it("deletes an option when there are more than the minimum", async () => {
    const { onChange, user } = setup([option("a"), option("b"), option("c")]);

    await user.click(screen.getByRole("button", { name: "Видалити варіант 2" }));

    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: "a" }), expect.objectContaining({ id: "c" })]);
  });

  it("reorders options and disables moves at the ends", async () => {
    const { onChange, user } = setup([option("a"), option("b"), option("c")]);

    expect(screen.getByRole("button", { name: "Підняти варіант 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Опустити варіант 3" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Підняти варіант 2" }));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: "b" }),
      expect.objectContaining({ id: "a" }),
      expect.objectContaining({ id: "c" }),
    ]);
  });
});
