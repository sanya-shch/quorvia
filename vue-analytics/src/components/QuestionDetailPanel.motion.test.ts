import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createAnalyticsI18n } from "../i18n";
import QuestionDetailPanel from "./QuestionDetailPanel.vue";

describe("QuestionDetailPanel: поява панелі", () => {
  it("підкладка зʼявляється, панель виїжджає справа", () => {
    const wrapper = mount(QuestionDetailPanel, {
      props: { data: null, isLoading: true, error: null },
      global: { plugins: [createAnalyticsI18n("en")] },
    });

    expect(wrapper.find(".overlay").classes()).toContain("va-overlay");
    expect(wrapper.find(".panel").classes()).toContain("va-drawer");
  });
});
