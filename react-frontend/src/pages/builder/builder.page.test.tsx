import { beforeEach, describe, expect, it, vi } from "vitest";
import { configure, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formsApi } from "../../api/forms";
import { saveFormAttempt } from "../../api/publicFormApi";
import { renderWorkspace } from "../workspace/renderWorkspace";
import { adminForm, choice, text } from "../workspace/testFixtures";

vi.setConfig({ testTimeout: 20000 });
// The suite runs many files in parallel: async lookups need more room than the 1 s default.
configure({ asyncUtilTimeout: 5000 });

vi.mock("../../api/forms", () => ({
  formsApi: {
    getAdminForm: vi.fn(),
    update: vi.fn(),
    publish: vi.fn(),
    unpublish: vi.fn(),
    duplicate: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("../../api/publicFormApi", () => ({
  saveFormAttempt: vi.fn(),
  submitForm: vi.fn(),
  getPublicForm: vi.fn(),
}));
vi.mock("../analytics/components/VueAnalyticsHost", () => ({ default: () => null }));

const get = vi.mocked(formsApi.getAdminForm);
const update = vi.mocked(formsApi.update);

const open = async (overrides = {}) => {
  get.mockResolvedValue(adminForm(overrides));
  const user = userEvent.setup();
  renderWorkspace("/forms/form-1/builder");
  await screen.findByRole("button", { name: "Додати питання" }, { timeout: 5000 });
  return user;
};

const list = () => screen.getByRole("list");
const rows = () => within(list()).getAllByRole("listitem");
const rowOf = (name: string) => rows().find((row) => within(row).queryByText(name))!;
const menuOf = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(within(rowOf(name)).getByRole("button", { name: /Дії з питанням/ }));
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Білдер - список питань", () => {
  it("показує всі питання з номерами, типом і позначкою логіки", async () => {
    await open();

    expect(rows()).toHaveLength(3);
    expect(within(rowOf("Перше")).getByText("01")).toBeInTheDocument();
    expect(within(rowOf("Друге")).getByText("Логіка")).toBeInTheDocument();
    expect(within(rowOf("Третє")).queryByText("Логіка")).not.toBeInTheDocument();
    expect(screen.getByText("3 питання")).toBeInTheDocument();
  });

  it("вибір питання оновлює інспектор: назва і тип", async () => {
    const user = await open();

    await user.click(within(rowOf("Третє")).getByRole("button", { name: /Третє/ }));

    expect(screen.getByLabelText("Назва питання")).toHaveValue("Третє");
    expect(screen.getByLabelText("Тип питання")).toHaveValue("TEXT");
  });

  it("правка назви в інспекторі змінює список і ставить 'незбережені зміни'", async () => {
    const user = await open();

    const title = screen.getByLabelText("Назва питання");
    await user.clear(title);
    await user.type(title, "Нове перше");

    expect(within(list()).getByText("Нове перше")).toBeInTheDocument();
    expect(screen.getAllByText("Є незбережені зміни").length).toBeGreaterThan(0);
  });

  it("додавання питання з вибору типу: воно виділене й відкрите в інспекторі", async () => {
    const user = await open();

    await user.click(screen.getByRole("button", { name: "Додати питання" }));
    await user.click(screen.getByRole("button", { name: /Число/ }));

    expect(rows()).toHaveLength(4);
    expect(screen.getByLabelText("Тип питання")).toHaveValue("NUMBER");
    expect(screen.getByLabelText("Назва питання")).toHaveValue("");
  });

  it("список вибору пропонує всі типи, що існують у проєкті", async () => {
    const user = await open();

    await user.click(screen.getByRole("button", { name: "Додати питання" }));

    expect(within(screen.getByRole("dialog")).getAllByRole("button")).toHaveLength(14);
  });

  it("дублювання виділяє копію", async () => {
    const user = await open();

    await menuOf(user, "Третє");
    await user.click(screen.getByRole("menuitem", { name: "Дублювати" }));

    expect(rows()).toHaveLength(4);
  });
});

describe("Білдер - залежності між питаннями", () => {
  it("переміщення залежного питання вище за його джерело заборонене з поясненням", async () => {
    const user = await open();

    await menuOf(user, "Друге");
    await user.click(screen.getByRole("menuitem", { name: "Вгору" }));

    expect(await screen.findByText("Це переміщення зламає умову")).toBeInTheDocument();
    // nothing moved
    expect(rows().map((row) => row.textContent)).toEqual([
      expect.stringContaining("Перше"),
      expect.stringContaining("Друге"),
      expect.stringContaining("Третє"),
    ]);
  });

  it("безпечне переміщення виконується", async () => {
    const user = await open();

    await menuOf(user, "Третє");
    await user.click(screen.getByRole("menuitem", { name: "Вгору" }));

    expect(rows()[1]!.textContent).toContain("Третє");
    expect(screen.queryByText("Це переміщення зламає умову")).not.toBeInTheDocument();
  });

  it("видалення питання, від якого залежать інші: попереджає й після згоди прибирає їхні умови", async () => {
    const user = await open();

    await menuOf(user, "Перше");
    await user.click(screen.getByRole("menuitem", { name: "Видалити" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Друге/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Видалити" }));

    expect(rows()).toHaveLength(2);
    // the former dependent has no "Логіка" mark any more: its condition was removed, as announced
    expect(within(rowOf("Друге")).queryByText("Логіка")).not.toBeInTheDocument();
  });

  it("скасування видалення нічого не змінює", async () => {
    const user = await open();

    await menuOf(user, "Перше");
    await user.click(screen.getByRole("menuitem", { name: "Видалити" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Скасувати" }),
    );

    expect(rows()).toHaveLength(3);
    expect(within(rowOf("Друге")).getByText("Логіка")).toBeInTheDocument();
  });
});

describe("Білдер - тип питання", () => {
  it("змінити тип можна, поки немає відповідей: з підтвердженням, якщо є налаштування типу", async () => {
    const user = await open();

    await user.selectOptions(screen.getByLabelText("Тип питання"), "TEXT");

    expect(await screen.findByText("Змінити тип питання?")).toBeInTheDocument();
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Змінити тип" }),
    );

    expect(within(rowOf("Перше")).getByText("Текстове поле")).toBeInTheDocument();
  });

  it("коли у форми є відповіді, тип заблоковано", async () => {
    await open({ responseCount: 5 });

    expect(screen.getByLabelText("Тип питання")).toBeDisabled();
    expect(screen.getByText(/не можна змінити/)).toBeInTheDocument();
  });
});

describe("Білдер - превʼю", () => {
  it("показує форму так, як її бачить респондент, з тих самих компонентів", async () => {
    await open();

    expect(screen.getByRole("heading", { name: "Превʼю" })).toBeInTheDocument();
    // all-at-once mode: every question that is visible with no answers
    expect(await screen.findByRole("button", { name: "Надіслати відповіді" })).toBeInTheDocument();
    expect(
      screen.getByText("Сесія превʼю · лише тестові відповіді, нічого не зберігається"),
    ).toBeInTheDocument();
  });

  it("відповіді в превʼю нічого не відправляють і не зберігають", async () => {
    const user = await open();

    await user.click((await screen.findAllByLabelText("Так"))[0]!);
    await user.type(screen.getAllByRole("textbox")[0]!, "тест");

    expect(saveFormAttempt).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    // the form itself is untouched by preview answers
    expect(screen.queryByText("Є незбережені зміни")).not.toBeInTheDocument();
  });

  it("умова працює в превʼю за тим самим рушієм: 'Друге' зʼявляється після відповіді 'Так'", async () => {
    const user = await open();

    expect(screen.queryByText("Друге", { selector: "label span" })).not.toBeInTheDocument();

    await user.click((await screen.findAllByLabelText("Так"))[0]!);

    expect(await screen.findByText("Друге", { selector: "label span" })).toBeInTheDocument();
  });

  it("'Скинути відповіді' очищає лише відповіді превʼю", async () => {
    const user = await open();

    await user.click((await screen.findAllByLabelText("Так"))[0]!);
    expect(await screen.findByText("Друге", { selector: "label span" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Скинути відповіді" }));

    expect(screen.queryByText("Друге", { selector: "label span" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Друге").length).toBeGreaterThan(0); // still in the question list
  });

  it("покроковий режим: по одному питанню, 'Далі' веде за гілкою", async () => {
    const user = await open({ responseMode: "STEP_BY_STEP" });

    expect(await screen.findByRole("button", { name: "Далі →" })).toBeInTheDocument();
    expect(screen.getByText("Питання 1 із 3")).toBeInTheDocument();

    // "Так" leads to the conditional question, "Далі" opens it
    await user.click((await screen.findAllByLabelText("Так"))[0]!);
    await user.click(screen.getByRole("button", { name: "Далі →" }));

    expect(await screen.findByText("Питання 2 із 3")).toBeInTheDocument();
    expect(screen.getAllByText("Друге").length).toBeGreaterThan(1);
  });

  it("вибір питання в списку переводить превʼю до нього", async () => {
    const user = await open({
      responseMode: "STEP_BY_STEP",
      questions: [choice("q1", "Перше", 0), text("q3", "Третє", 1)],
    });

    await user.click(within(rowOf("Третє")).getByRole("button", { name: /Третє/ }));

    expect(await screen.findByText("Питання 2 із 2")).toBeInTheDocument(); // reached by the flow, with no answers needed
  });

  it("вибране питання, приховане умовою, позначено в превʼю", async () => {
    const user = await open();

    await user.click(within(rowOf("Друге")).getByRole("button", { name: /Друге/ }));

    expect(await screen.findByText(/приховане його умовою/)).toBeInTheDocument();
  });
});

describe("Білдер - вітальний екран у превʼю", () => {
  it("якщо автор увімкнув вітальний екран, превʼю починається з нього", async () => {
    const user = await open({ welcomeScreen: { title: "Вітаємо в опитуванні", text: "Коротко" } });

    expect(
      await screen.findByRole("heading", { level: 1, name: "Вітаємо в опитуванні" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("3 питання").length).toBeGreaterThan(1); // the list header and the welcome facts
    expect(screen.queryByRole("button", { name: "Надіслати відповіді" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Почати" }));
    expect(await screen.findByRole("button", { name: "Надіслати відповіді" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Скинути відповіді" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Вітаємо в опитуванні" }),
    ).toBeInTheDocument();
  });

  it("без вітального екрана превʼю одразу показує питання", async () => {
    await open({ welcomeScreen: null });

    expect(await screen.findByRole("button", { name: "Надіслати відповіді" })).toBeInTheDocument();
  });
});

describe("Білдер - перевірка логіки", () => {
  it("показує, які питання буде показано за обраними значеннями", async () => {
    const user = await open();

    await user.click(screen.getByRole("button", { name: "Перевірити логіку" }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText("Показано: 2 із 3")).toBeInTheDocument();

    await user.selectOptions(within(dialog).getAllByRole("combobox")[0]!, "q1-a");

    expect(within(dialog).getByText("Показано: 3 із 3")).toBeInTheDocument();
  });
});

describe("Білдер - переклади питання", () => {
  it("показує основну мову і незаповнені переклади", async () => {
    await open({ languages: ["en"] });

    expect(screen.getByText("Основна")).toBeInTheDocument();
    expect(screen.getByText(/Бракує: \d+/)).toBeInTheDocument();
  });
});

describe("Білдер - збереження", () => {
  it("зміна питання зберігається існуючим механізмом з версією форми", async () => {
    update.mockResolvedValue({ success: true, version: 4 } as never);
    const user = await open();

    const title = screen.getByLabelText("Назва питання");
    await user.clear(title);
    await user.type(title, "Нове");
    await user.click(screen.getAllByRole("button", { name: "Зберегти" })[0]!);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]![1]).toMatchObject({ version: 3 });
    expect(update.mock.calls[0]![1].questions?.[0]).toMatchObject({ id: "q1", text: "Нове" });
  });
});
