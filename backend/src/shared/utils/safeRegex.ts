import RE2 from "re2";

/**
 * User-defined regexes (TextQuestion.config.pattern) run ON THE SERVER over anonymous
 * respondents' data. A regular V8 RegExp backtracks, so a pattern like `(a+)+$` on a string
 * of ~30 characters blocks the event loop for seconds or minutes, stopping the whole API,
 * not just one form. Any registered user could create such a form and "submit" it
 * themselves (ReDoS).
 *
 * RE2 guarantees linear-time matching regardless of the pattern. The price: RE2 has no
 * lookahead/lookbehind or backreferences (\1); such patterns are rejected when the form is
 * saved (form.schema.ts).
 */
export const MAX_PATTERN_LENGTH = 200;

export const compileSafePattern = (pattern: string): RE2 | null => {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return null;
  }

  try {
    return new RE2(pattern);
  } catch {
    return null;
  }
};
