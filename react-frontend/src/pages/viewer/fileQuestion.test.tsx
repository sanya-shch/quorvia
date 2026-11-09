import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError } from "axios";
import { FILE_LIMITS } from "@quorvia/shared-types";
import FormViewer from "./FormViewer";
import QuestionStepper from "./QuestionStepper";
import UploadedFilesProvider from "./UploadedFilesProvider";
import { deleteResponseFile, uploadResponseFile } from "../../api/publicFormApi";
import type { Question } from "../../types/formBuilder";

vi.mock("../../api/publicFormApi", () => ({
  uploadResponseFile: vi.fn(),
  deleteResponseFile: vi.fn(),
  saveFormAttempt: vi.fn(() => Promise.resolve()),
}));

const upload = vi.mocked(uploadResponseFile);
const remove = vi.mocked(deleteResponseFile);

const SESSION = "session-1";
const SUBMIT = { name: "Надіслати відповіді" };

const q = (overrides: Partial<Question> = {}): Question => ({
  id: "q",
  type: "FILE",
  text: "Додайте файл",
  required: false,
  order: 0,
  options: [],
  config: { maxFiles: 2 },
  ...overrides,
});

const uploaded = (id: string, name: string, size = 2048) => ({
  id,
  name,
  size,
  mime: "application/pdf" as const,
});

const file = (name: string, type: string, size = 100) =>
  new File([new Uint8Array(size)], name, { type });

const renderForm = (question: Question = q(), onSubmit = vi.fn()) => {
  render(
    <UploadedFilesProvider>
      <FormViewer
        formTitle="Т"
        questions={[question]}
        onSubmit={onSubmit}
        shareId="share-1"
        sessionKey={SESSION}
      />
    </UploadedFilesProvider>,
  );

  return { onSubmit, user: userEvent.setup({ applyAccept: false }) };
};

const input = () => screen.getByTestId("file-input-q");

const axiosError = (code: string) =>
  new AxiosError("fail", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 400,
    data: { message: code },
  } as never);

describe("FormViewer - FILE", () => {
  beforeEach(() => {
    upload.mockReset();
    remove.mockReset();
  });

  it("explains what can be attached", () => {
    renderForm();

    expect(screen.getByRole("button", { name: "Виберіть файл" })).toBeEnabled();
    expect(screen.getByText(/До 2 файл\(ів\), по 5 МБ кожен/)).toBeInTheDocument();
  });

  it("uploads the chosen file for this question and session, and shows it", async () => {
    upload.mockResolvedValue(uploaded("f1", "report.pdf"));
    const { user } = renderForm();
    const report = file("report.pdf", "application/pdf");

    await user.upload(input(), report);

    expect(await screen.findByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("2 KB")).toBeInTheDocument();
    expect(upload).toHaveBeenCalledWith("share-1", {
      sessionKey: SESSION,
      questionId: "q",
      file: report,
    });
  });

  it("submits the ids of the uploaded files", async () => {
    upload
      .mockResolvedValueOnce(uploaded("f1", "a.pdf"))
      .mockResolvedValueOnce(uploaded("f2", "b.pdf"));
    const { user, onSubmit } = renderForm();

    await user.upload(input(), file("a.pdf", "application/pdf"));
    await screen.findByText("a.pdf");
    await user.upload(input(), file("b.pdf", "application/pdf"));
    await screen.findByText("b.pdf");
    await user.click(screen.getByRole("button", SUBMIT));

    expect(onSubmit).toHaveBeenCalledWith({ q: ["f1", "f2"] });
  });

  it("does not send an answer for an optional question without files", async () => {
    const { user, onSubmit } = renderForm();

    await user.click(screen.getByRole("button", SUBMIT));

    expect(onSubmit).toHaveBeenCalledWith({});
  });

  it("blocks the submit of a required question without a file", async () => {
    const { user, onSubmit } = renderForm(q({ required: true }));

    await user.click(screen.getByRole("button", SUBMIT));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText(/обов/i)).toBeInTheDocument();
  });

  it.each([
    ["an executable", file("virus.exe", "application/x-msdownload"), "Непідтримуваний тип файлу"],
    ["an SVG image", file("logo.svg", "image/svg+xml"), "Непідтримуваний тип файлу"],
    [
      "a Word document",
      file("a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      "Непідтримуваний тип файлу",
    ],
    [
      "a file above the size limit",
      file("big.pdf", "application/pdf", FILE_LIMITS.maxBytes + 1),
      "завеликий",
    ],
  ])("rejects %s without a request", async (_label, bad, message) => {
    const { user } = renderForm();

    await user.upload(input(), bad);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(upload).not.toHaveBeenCalled();
  });

  it("accepts a text file the browser reports without a type, by its extension", async () => {
    upload.mockResolvedValue({ ...uploaded("f1", "notes.txt"), mime: "text/plain" });
    const { user } = renderForm();

    await user.upload(input(), file("notes.txt", ""));

    expect(await screen.findByText("notes.txt")).toBeInTheDocument();
  });

  it("shows the translated server error with the file name and keeps nothing", async () => {
    upload.mockRejectedValue(axiosError("FILE_INVALID_CONTENT"));
    const { user, onSubmit } = renderForm();

    await user.upload(input(), file("broken.pdf", "application/pdf"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "broken.pdf: Файл порожній або пошкоджений",
    );

    await user.click(screen.getByRole("button", SUBMIT));
    expect(onSubmit).toHaveBeenCalledWith({});
  });

  it("stops offering uploads once the maximum is reached", async () => {
    upload.mockResolvedValue(uploaded("f1", "a.pdf"));
    const { user } = renderForm(q({ config: { maxFiles: 1 } }));

    await user.upload(input(), file("a.pdf", "application/pdf"));
    await screen.findByText("a.pdf");

    expect(screen.getByRole("button", { name: "Додати ще файл" })).toBeDisabled();
  });

  it("uploads only as many files as fit and says the rest were left out", async () => {
    upload.mockImplementation(async (_share, { file: f }) => uploaded(`id-${f.name}`, f.name));
    const { user } = renderForm(q({ config: { maxFiles: 2 } }));

    await user.upload(input(), [
      file("a.pdf", "application/pdf"),
      file("b.pdf", "application/pdf"),
      file("c.pdf", "application/pdf"),
    ]);

    await screen.findByText("b.pdf");
    expect(upload).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("c.pdf")).not.toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("Тут не можна додати більше файлів");
  });

  it("removes a file on the server and from the answer", async () => {
    upload.mockResolvedValue(uploaded("f1", "a.pdf"));
    remove.mockResolvedValue(undefined);
    const { user, onSubmit } = renderForm();

    await user.upload(input(), file("a.pdf", "application/pdf"));
    await user.click(await screen.findByRole("button", { name: "Видалити a.pdf" }));

    await waitFor(() => expect(screen.queryByText("a.pdf")).not.toBeInTheDocument());
    expect(remove).toHaveBeenCalledWith("share-1", SESSION, "f1");

    await user.click(screen.getByRole("button", SUBMIT));
    expect(onSubmit).toHaveBeenCalledWith({});
  });

  it("keeps the file when the server could not remove it", async () => {
    upload.mockResolvedValue(uploaded("f1", "a.pdf"));
    remove.mockRejectedValue(axiosError("FILE_UPLOAD_INVALID"));
    const { user } = renderForm();

    await user.upload(input(), file("a.pdf", "application/pdf"));
    await user.click(await screen.findByRole("button", { name: "Видалити a.pdf" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("a.pdf")).toBeInTheDocument();
  });

  it("drops a file the server no longer has", async () => {
    upload.mockResolvedValue(uploaded("f1", "a.pdf"));
    remove.mockRejectedValue(axiosError("FILE_NOT_FOUND"));
    const { user } = renderForm();

    await user.upload(input(), file("a.pdf", "application/pdf"));
    await user.click(await screen.findByRole("button", { name: "Видалити a.pdf" }));

    await waitFor(() => expect(screen.queryByText("a.pdf")).not.toBeInTheDocument());
  });

  it("cannot upload without a share id and a session", () => {
    render(<FormViewer formTitle="Т" questions={[q()]} onSubmit={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Виберіть файл" })).toBeDisabled();
  });
});

describe("QuestionStepper - FILE", () => {
  beforeEach(() => {
    upload.mockReset();
  });

  it("shows the names of the uploaded files on the review screen", async () => {
    upload.mockResolvedValue(uploaded("f1", "Звіт.pdf"));
    const user = userEvent.setup({ applyAccept: false });

    render(
      <UploadedFilesProvider>
        <QuestionStepper
          formTitle="Т"
          questions={[q()]}
          onSubmit={vi.fn()}
          shareId="share-1"
          sessionKey={SESSION}
        />
      </UploadedFilesProvider>,
    );

    await user.upload(input(), file("Звіт.pdf", "application/pdf"));
    await screen.findByText("Звіт.pdf");
    await user.click(screen.getByRole("button", { name: /Далі|Перевірити/ }));

    expect(await screen.findByText(/Додайте файл - Звіт\.pdf/)).toBeInTheDocument();
  });
});
