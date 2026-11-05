# Content Languages

A form is written in one **main language** and can be translated into up to 10 **additional languages**. Respondents see the form in their language; the builder shows which texts are still missing.

This is separate from the **interface language** of the application (`uk`/`en`, `SUPPORTED_LOCALES`): the interface language is about buttons and messages, the content language is about the form's own texts.

## Data model

- `Form.defaultLanguage` - the main language (ISO 639-1, no regions, default `uk`).
- `Form.languages` - additional languages (never contains the main one).
- `translations` (JSON) on the form and on every question: title/description, question text and description, option and matrix column texts, matrix row texts, scale labels.

The main-language texts stay in the form's own fields; a missing or blank translation means “show the main language”, so a partly translated form never shows empty labels. Answers are stored by option id, so they do not depend on the language. Analytics, exports and the response view use the main language.

The exact JSON shape, the normalization rules applied on save and the response `language` field are described in the [API reference](API.md#content-languages).

## Builder

- A language bar with one tab per language and an indicator with the number of missing translations.
- A translation panel next to each question, with a button to copy the main-language text as a starting point.
- Removing an option, a row or a language needs no manual cleanup: stale translations are dropped by the server on save.

## Public form

The language is picked in this order: the `?lang=` query parameter, the browser's languages (`Accept-Language`), the language switcher, then the main language. The switcher is shown only when the form has at least one additional language, and the choice is written back to `?lang=`.

Buttons and validation messages use the form language when the application has it (`uk`/`en`), otherwise English. The respondent's language is stored on the response (`language`) when it is one of the form's languages; anything else is stored as `null` and never rejects a submission.

Machine translation is not part of the product.
