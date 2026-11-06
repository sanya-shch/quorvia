// Language name in `uiLanguage` ("English" / "англійська"), capitalized; the code itself on failure.
export const getLanguageName = (code: string, uiLanguage: string): string => {
  try {
    const name = new Intl.DisplayNames([uiLanguage], { type: "language" }).of(code);

    if (!name) return code;

    return name.charAt(0).toLocaleUpperCase(uiLanguage) + name.slice(1);
  } catch {
    return code;
  }
};
