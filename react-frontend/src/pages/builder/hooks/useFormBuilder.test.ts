import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFormBuilder } from "./useFormBuilder";

describe("useFormBuilder", () => {
  it("addQuestionAtPosition одразу генерує стабільний id (не undefined)", () => {
    const { result } = renderHook(() => useFormBuilder());

    act(() => {
      result.current.addQuestionAtPosition("TEXT", 0);
    });

    expect(result.current.form.questions).toHaveLength(1);
    expect(result.current.form.questions[0].id).toBeTruthy();
    expect(typeof result.current.form.questions[0].id).toBe("string");
  });

  it("addQuestionAtPosition вставляє на потрібну позицію і переприсвоює order", () => {
    const { result } = renderHook(() => useFormBuilder());

    act(() => result.current.addQuestionAtPosition("TEXT", 0));
    act(() => result.current.addQuestionAtPosition("NUMBER", 1));
    act(() => result.current.addQuestionAtPosition("BOOLEAN", 1)); // an insert between two existing ones

    const types = result.current.form.questions.map((q) => q.type);
    expect(types).toEqual(["TEXT", "BOOLEAN", "NUMBER"]);
    expect(result.current.form.questions.map((q) => q.order)).toEqual([0, 1, 2]);
  });

  it("duplicateQuestion дає новий id і НЕ успадковує condition", () => {
    const { result } = renderHook(() => useFormBuilder());

    act(() => result.current.addQuestionAtPosition("TEXT", 0));
    const originalId = result.current.form.questions[0].id;

    act(() => {
      result.current.updateQuestion(0, {
        condition: {
          logic: "AND",
          rules: [{ questionId: "some-other-q", operator: "equals", value: "x" }],
        },
      });
    });

    act(() => result.current.duplicateQuestion(0));

    expect(result.current.form.questions).toHaveLength(2);
    const duplicate = result.current.form.questions[1];
    expect(duplicate.id).not.toBe(originalId);
    expect(duplicate.id).toBeTruthy();
    expect(duplicate.condition).toBeNull();
  });

  it("trySave блокує збереження, якщо назва форми порожня", () => {
    const { result } = renderHook(() => useFormBuilder());
    const onSuccess = vi.fn();

    act(() => result.current.updateFormMeta({ title: "" }));
    act(() => result.current.trySave(onSuccess));

    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.errors.title).toBeTruthy();
  });

  it("trySave блокує збереження при циклічній умові (validateConditionGraph)", () => {
    const { result } = renderHook(() => useFormBuilder());
    const onSuccess = vi.fn();

    act(() => result.current.updateFormMeta({ title: "Форма" }));
    act(() => result.current.addQuestionAtPosition("TEXT", 0));
    act(() => result.current.addQuestionAtPosition("TEXT", 1));

    act(() => {
      result.current.updateQuestion(0, { text: "Q1" });
      result.current.updateQuestion(1, { text: "Q2" });
    });

    const [q1, q2] = result.current.form.questions;

    // We create a cycle artificially: q1 depends on q2 (forward reference) and vice versa; both have
    // the same order conflict, which validateConditionGraph must catch as CYCLE.
    act(() => {
      result.current.updateQuestion(0, {
        condition: {
          logic: "AND",
          rules: [{ questionId: q2.id!, operator: "equals", value: "y" }],
        },
      });
      result.current.updateQuestion(1, {
        condition: {
          logic: "AND",
          rules: [{ questionId: q1.id!, operator: "equals", value: "y" }],
        },
      });
    });

    act(() => result.current.trySave(onSuccess));

    expect(onSuccess).not.toHaveBeenCalled();
    expect(Object.keys(result.current.errors).some((k) => k.endsWith("-condition"))).toBe(true);
  });

  it("trySave викликає onSuccess для валідної форми", () => {
    const { result } = renderHook(() => useFormBuilder());
    const onSuccess = vi.fn();

    act(() => result.current.updateFormMeta({ title: "Форма" }));
    act(() => result.current.addQuestionAtPosition("TEXT", 0));
    act(() => result.current.updateQuestion(0, { text: "Питання 1" }));

    act(() => result.current.trySave(onSuccess));

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.errors).toEqual({});
  });

  it("deleteQuestion переприсвоює order після видалення", () => {
    const { result } = renderHook(() => useFormBuilder());

    act(() => result.current.addQuestionAtPosition("TEXT", 0));
    act(() => result.current.addQuestionAtPosition("NUMBER", 1));
    act(() => result.current.addQuestionAtPosition("BOOLEAN", 2));

    act(() => result.current.deleteQuestion(0)); // delete the TEXT one

    const types = result.current.form.questions.map((q) => q.type);
    expect(types).toEqual(["NUMBER", "BOOLEAN"]);
    expect(result.current.form.questions.map((q) => q.order)).toEqual([0, 1]);
  });

  describe("лічильник правок (isDirty / revision / markSaved)", () => {
    it("нова форма чиста; будь-яка правка робить її брудною", () => {
      const { result } = renderHook(() => useFormBuilder());
      expect(result.current.isDirty).toBe(false);

      act(() => result.current.updateFormMeta({ title: "A" }));

      expect(result.current.isDirty).toBe(true);
    });

    it("markSaved(поточна ревізія) робить форму чистою", () => {
      const { result } = renderHook(() => useFormBuilder());
      act(() => result.current.updateFormMeta({ title: "A" }));

      act(() => result.current.markSaved(result.current.revision));

      expect(result.current.isDirty).toBe(false);
    });

    it("правка ПІСЛЯ відправки (але до відповіді) лишає форму брудною", () => {
      const { result } = renderHook(() => useFormBuilder());
      act(() => result.current.updateFormMeta({ title: "A" }));
      const revisionAtSend = result.current.revision;

      act(() => result.current.updateFormMeta({ title: "AB" })); // the user keeps typing
      act(() => result.current.markSaved(revisionAtSend)); // the response to the old save

      expect(result.current.isDirty).toBe(true);
    });

    it("resetDirty (завантаження з сервера) очищає форму відносно поточного стану", () => {
      const { result } = renderHook(() => useFormBuilder());
      act(() => result.current.updateFormMeta({ title: "A" }));

      act(() => result.current.resetDirty());

      expect(result.current.isDirty).toBe(false);
    });

    it("після resetDirty нова правка знову робить форму брудною", () => {
      const { result } = renderHook(() => useFormBuilder());
      act(() => result.current.updateFormMeta({ title: "A" }));
      act(() => result.current.resetDirty());

      act(() => result.current.updateFormMeta({ title: "B" }));

      expect(result.current.isDirty).toBe(true);
    });
  });
});
