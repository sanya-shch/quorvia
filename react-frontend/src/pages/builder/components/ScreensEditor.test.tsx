import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormEndScreen, FormWelcomeScreen } from "@quorvia/shared-types";
import ScreensEditor from "./ScreensEditor";

const setup = (
  welcome: FormWelcomeScreen | null = null,
  end: FormEndScreen | null = null,
  formTitle = "Опитування",
) => {
  const onWelcomeChange = vi.fn();
  const onEndChange = vi.fn();

  render(
    <ScreensEditor
      formTitle={formTitle}
      welcomeScreen={welcome}
      endScreen={end}
      onWelcomeChange={onWelcomeChange}
      onEndChange={onEndChange}
    />,
  );

  return { onWelcomeChange, onEndChange, user: userEvent.setup() };
};

describe("ScreensEditor", () => {
  it("shows only the two switches while both screens are off", () => {
    setup();

    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("turning the welcome screen on starts from the form title", async () => {
    const { onWelcomeChange, user } = setup(null, null, "Моє опитування");

    await user.click(screen.getByRole("checkbox", { name: /привітальний екран/i }));

    expect(onWelcomeChange).toHaveBeenCalledWith({
      title: "Моє опитування",
      text: "",
      buttonLabel: "",
    });
  });

  it("turning a screen off removes it", async () => {
    const { onWelcomeChange, onEndChange, user } = setup(
      { title: "Hi" },
      { text: "Bye", redirectUrl: "" },
    );

    await user.click(screen.getByRole("checkbox", { name: /привітальний екран/i }));
    await user.click(screen.getByRole("checkbox", { name: /власне повідомлення/i }));

    expect(onWelcomeChange).toHaveBeenCalledWith(null);
    expect(onEndChange).toHaveBeenCalledWith(null);
  });

  it("edits the welcome fields without losing the others", async () => {
    const { onWelcomeChange, user } = setup({ title: "Hi", text: "Intro", buttonLabel: "Go" });

    await user.type(screen.getByLabelText("Заголовок"), "!");
    await user.type(screen.getByLabelText("Текст"), "?");
    await user.type(screen.getByLabelText("Напис на кнопці"), "o");

    expect(onWelcomeChange).toHaveBeenNthCalledWith(1, {
      title: "Hi!",
      text: "Intro",
      buttonLabel: "Go",
    });
    expect(onWelcomeChange).toHaveBeenNthCalledWith(2, {
      title: "Hi",
      text: "Intro?",
      buttonLabel: "Go",
    });
    expect(onWelcomeChange).toHaveBeenNthCalledWith(3, {
      title: "Hi",
      text: "Intro",
      buttonLabel: "Goo",
    });
  });

  it("warns that a welcome screen without a title is not saved", () => {
    setup({ title: "  " });

    expect(screen.getByRole("alert")).toHaveTextContent("Вкажіть заголовок");
    expect(screen.getByLabelText("Заголовок")).toHaveAttribute("aria-invalid", "true");
  });

  it("warns that an end screen without a message is not saved", () => {
    setup(null, { text: "" });

    expect(screen.getByRole("alert")).toHaveTextContent("Вкажіть повідомлення");
  });

  it("edits the end message and the redirect", async () => {
    const { onEndChange, user } = setup(null, { text: "Дякуємо", redirectUrl: "https://a.test" });

    await user.type(screen.getByLabelText("Повідомлення"), "!");
    await user.type(screen.getByLabelText(/Адреса для переходу/), "x");

    expect(onEndChange).toHaveBeenNthCalledWith(1, {
      text: "Дякуємо!",
      redirectUrl: "https://a.test",
    });
    expect(onEndChange).toHaveBeenNthCalledWith(2, {
      text: "Дякуємо",
      redirectUrl: "https://a.testx",
    });
  });

  it("explains the redirect with a hint while the address is fine or empty", () => {
    setup(null, { text: "Дякуємо", redirectUrl: "https://example.com" });

    expect(screen.getByText(/Працюють лише адреси http:\/\/ і https:\/\//)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    "javascript:alert(1)",
    "example.com",
    "ftp://example.com",
    "/relative",
    "data:text/html,x",
  ])("flags %j as an address that will not be saved", (redirectUrl) => {
    setup(null, { text: "Дякуємо", redirectUrl });

    expect(screen.getByRole("alert")).toHaveTextContent("http:// або https://");
    expect(screen.getByLabelText(/Адреса для переходу/)).toHaveAttribute("aria-invalid", "true");
  });
});
