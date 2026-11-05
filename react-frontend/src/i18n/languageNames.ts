/** Назва мови мовою `uiLanguage` ("англійська" / "English"), з великої літери; при збої - сам код. */
export const getLanguageName = (code: string, uiLanguage: string): string => {
  try {
    const name = new Intl.DisplayNames([uiLanguage], { type: "language" }).of(code);

    if (!name) return code;

    return name.charAt(0).toLocaleUpperCase(uiLanguage) + name.slice(1);
  } catch {
    return code;
  }
};
