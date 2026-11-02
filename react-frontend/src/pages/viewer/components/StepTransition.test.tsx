import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import StepTransition from "./StepTransition";

/**
 * У більшості тестів анімації миттєві (test/setup.ts). Тут вони ввімкнені,
 * щоб побачити проміжний стан: екран, що виходить, і початкову позицію нового.
 */
describe("StepTransition", () => {
  beforeEach(() => {
    MotionGlobalConfig.skipAnimations = false;
  });

  afterEach(() => {
    MotionGlobalConfig.skipAnimations = true;
  });

  it("перший екран з'являється одразу, без анімації входу", () => {
    render(
      <StepTransition stepKey="a" direction={1}>
        <p>Перший</p>
      </StepTransition>,
    );

    const card = screen.getByText("Перший").parentElement!;
    expect(card).not.toHaveAttribute("inert");
    expect(card.style.opacity).not.toBe("0");
  });

  it("при зміні кроку екран, що виходить, стає inert (клікі по його застарілих кнопках неможливі)", () => {
    const { rerender } = render(
      <StepTransition stepKey="a" direction={1}>
        <button type="button">Далі (старий)</button>
      </StepTransition>,
    );

    rerender(
      <StepTransition stepKey="b" direction={1}>
        <button type="button">Далі (новий)</button>
      </StepTransition>,
    );

    const exiting = screen.getByText("Далі (старий)").parentElement!;
    expect(exiting).toHaveAttribute("inert");
  });

  it("після виходу старого екрана в DOM лишається тільки новий, і він не inert", async () => {
    const { rerender } = render(
      <StepTransition stepKey="a" direction={1}>
        <p>Старий</p>
      </StepTransition>,
    );
    rerender(
      <StepTransition stepKey="b" direction={1}>
        <p>Новий</p>
      </StepTransition>,
    );

    await waitFor(() => expect(screen.queryByText("Старий")).not.toBeInTheDocument());
    expect(await screen.findByText("Новий")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Новий").parentElement).not.toHaveAttribute("inert"));
  });

  it("два екрани ніколи не стоять разом: новий з'являється лише після виходу старого (mode=wait)", () => {
    const { rerender } = render(
      <StepTransition stepKey="a" direction={1}>
        <p>Старий</p>
      </StepTransition>,
    );
    rerender(
      <StepTransition stepKey="b" direction={1}>
        <p>Новий</p>
      </StepTransition>,
    );

    expect(screen.getByText("Старий")).toBeInTheDocument();
    expect(screen.queryByText("Новий")).not.toBeInTheDocument();
  });

  it("напрямок назад: новий екран входить зліва (відʼємний зсув)", async () => {
    const { rerender } = render(
      <StepTransition stepKey="a" direction={-1}>
        <p>Старий</p>
      </StepTransition>,
    );
    rerender(
      <StepTransition stepKey="b" direction={-1}>
        <p>Новий</p>
      </StepTransition>,
    );

    const entering = (await screen.findByText("Новий")).parentElement!;
    expect(entering.style.transform).toContain("translateX(-");
    await act(async () => {});
  });

  it("напрямок вперед: новий екран входить справа (додатний зсув)", async () => {
    const { rerender } = render(
      <StepTransition stepKey="a" direction={1}>
        <p>Старий</p>
      </StepTransition>,
    );
    rerender(
      <StepTransition stepKey="b" direction={1}>
        <p>Новий</p>
      </StepTransition>,
    );

    const entering = (await screen.findByText("Новий")).parentElement!;
    expect(entering.style.transform).toMatch(/translateX\(\d/);
    await act(async () => {});
  });
});
