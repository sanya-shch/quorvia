# Calculation fields

A `CALCULATION` question is not answered by the respondent: its value is computed from other answers by a formula (a price calculator, a recommendation, a qualification). This page describes the formula engine, `packages/calculation-engine/src/formula`. The question type, the builder editor and the viewer are added in the following patches (see the plan, A4).

> Status: done and tested end to end: the engine, the `CALCULATION` question type, the validation on save, the computation on submit, the formula editor in the builder, the live value in the viewer, exports and analytics. What is left is listed under "Not in v1".

## Arithmetic: exact decimal

Numbers are computed with [`decimal.js`](https://github.com/MikeMcl/decimal.js) (exact in decimal, 40 significant digits for division, no floats), not with JavaScript numbers.

| Formula           | JS numbers            | Engine  |
| ----------------- | --------------------- | ------- |
| `0.1 + 0.2`       | `0.30000000000000004` | `0.3`   |
| `ROUND(2.675, 2)` | `2.67`                | `2.68`  |
| `19.99 * 3`       | `59.97` (by luck)     | `59.97` |

Why not "round to hundredths", as scoring does: scoring only adds numbers that already have two decimals, so integer hundredths are exact. A price calculator multiplies (`unit price * quantity * 1.075`), and a product of two numbers with two decimals has four, so rounding each step to hundredths gives wrong totals. Why not a hand-written decimal: it would be more code to get wrong for no benefit; `decimal.js` is small, has no dependencies and is widely used.

Rules:

- Rounding is half away from zero (`2.5 → 3`, `-2.5 → -3`), the same rule scoring uses.
- The result is rounded to `decimals` (0 to 8, default 2) and stored as a JSON number. A result needs at most 15 significant digits and a magnitude below 1e15, so it survives JSON unchanged; otherwise the value is `null` (`OVERFLOW`). Intermediate results above 1e30 are also an overflow.
- `%` keeps the sign of the dividend (`-7 % 3` is `-1`).
- Scoring (A3) stays in integer hundredths; formulas read option points as exact decimals.

## Language

| Part       | Syntax                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------- |
| Numbers    | `12`, `0.075` (no exponent, at most 30 characters)                                                |
| Text       | `"text"`, with `\"` and `\\` (at most 200 characters)                                             |
| Booleans   | `TRUE`, `FALSE`                                                                                   |
| Questions  | `{q:<id>}`; the editor shows the question's label, so renaming a question does not break formulas |
| Operators  | `+ - * / %`, `= != < <= > >=`, `AND OR NOT`, unary `-`, parentheses                               |
| Precedence | `OR` < `AND` < `NOT` < comparison < `+ -` < `* / %` < unary `-`                                   |

Keywords and function names are case-insensitive. `+` is only for numbers; join text with `CONCAT`. `=` and `!=` compare two values of the same type.

### What a reference gives

| Question                            | Value                                              |
| ----------------------------------- | -------------------------------------------------- |
| `NUMBER`, `RATING`, `SCALE`, `NPS`  | the number                                         |
| `CHOICE_SINGLE`, `IMAGE_CHOICE`     | the points (`option.score`) of the picked option   |
| `CHOICE_MULTI`                      | the sum of the points of the picked options        |
| `BOOLEAN`                           | `TRUE` / `FALSE`                                   |
| `TEXT`                              | the text                                           |
| another `CALCULATION`               | its result (number, text or boolean)               |
| `DATE`, `RANKING`, `MATRIX`, `FILE` | not supported (rejected when the formula is saved) |

### Functions

| Function                                   | Result            | Notes                                                                                      |
| ------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------ |
| `IF(cond, a, b)`                           | type of `a` / `b` | both branches have the same type; only the taken one is evaluated                          |
| `ROUND(x, n)`, `FLOOR(x, n)`, `CEIL(x, n)` | number            | `n` is 0 to 8, default 0                                                                   |
| `ABS(x)`                                   | number            |                                                                                            |
| `MIN`, `MAX`, `SUM`, `AVG`                 | number            | one or more numbers                                                                        |
| `COUNT({q:multi})`                         | number            | how many options of a `CHOICE_MULTI` are picked                                            |
| `CONCAT(a, b, ...)`                        | text              | numbers become plain decimals, booleans `TRUE` / `FALSE`; at most 1000 characters          |
| `UPPER(t)`, `LOWER(t)`                     | text              |                                                                                            |
| `SCORE({q:id})`                            | number            | the points of a choice or `BOOLEAN` (`config.score`); same as a bare reference for choices |
| `LABEL({q:single})`                        | text              | the text of the picked option (in the form's default language)                             |

`AND` and `OR` stop early like `IF`: `{q:b} != 0 AND {q:a} / {q:b} > 1` never divides by zero.

## Empty inputs and failures

- **`emptyAsZero: true` (default):** an empty, hidden or mistyped input counts as `0`, `""` or `FALSE`.
- **`emptyAsZero: false`:** the result is `null` (`EMPTY_REFERENCE`) as soon as a referenced input is empty. A reference in a branch that is not taken is not read.
- Division by zero, overflow, a `ROUND` digit outside 0 to 8 and a stored formula that no longer parses give `null` with a code (`DIVISION_BY_ZERO`, `OVERFLOW`, `INVALID_ARGUMENT`, `INVALID_FORMULA`). The field shows "-" and **submitting is never blocked**.
- A hidden question counts as empty. A calculation field that is itself hidden is not computed. A field that reads a failed (`null`) field sees an empty value.
- The engine never throws on stored data.

## Limits and safety

- No `eval` and no `new Function`: a formula is tokenized, parsed by a Pratt parser into a tree and walked. Answers are read with an own-property check, so an answer key such as `__proto__` is just a key.
- At most 500 characters, 200 elements and 20 levels of nesting (a long chain `a + b + c + ...` is one level per term: use `SUM(...)` for more than 20 terms). There are no loops and no recursion, so evaluation time is bounded.
- Parse and type errors carry a position (`pos`, `end`) for the editor.

## Dependency graph

Calculation fields may read each other. `compileCalculations` orders them topologically (ties keep the form's question order) and reports a circle as `FORMULA_CYCLE` with the ids on it; fields on a cycle are not computed.

## API of the package

```ts
import {
  analyzeFormula, // parse + type check + resultType/decimals check; for the builder and on save
  validateCalculations, // all problems of a form's calculation fields, FORMULA_CYCLE included
  computeCalculations, // values in dependency order: { values, errors }
} from "@quorvia/calculation-engine";
```

The same functions run in the server (authoritative, overwrites whatever the client sent), the builder (live check) and the viewer (live preview), so all three give the same value for the same answers.

## The question type

`CALCULATION` is a `QuestionType` (PostgreSQL enum value added in its own migration). Its `config`:

| Key                | Meaning                                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formula`          | the formula text, 1 to 500 characters                                                                                                                                                   |
| `resultType`       | `number`, `string` or `boolean`; it must be the type the formula gives (checked on save). The plan calls the text type `text`; the stored value is `string` like the engine's type name |
| `decimals`         | places of a number result, 0 to 8, default 2                                                                                                                                            |
| `prefix`, `suffix` | up to 20 characters shown around the value (`$`, ` kg`)                                                                                                                                 |
| `display`          | `visible` (default) or `hidden`: a hidden field is computed but not sent to the respondent                                                                                              |
| `emptyAsZero`      | default `true`, see above                                                                                                                                                               |

A calculation is never required. A form has at most 30 of them. It may have a condition of its own, like any question (then it is only computed for respondents who were shown it).

## What the server does

**On save** (`PATCH /forms/:formId`) every formula is parsed and type-checked against the questions of the same request, and the dependency graph is checked. Anything wrong is `400 FORM_INVALID_FORMULAS` with `errors: [{ questionId, code, message, pos, end }]`, and nothing is written (see the [API](API.md#calculation-fields)). Deleting a question that a formula reads is refused the same way (`UNKNOWN_REFERENCE`). A visible calculation cannot read a hidden one (`HIDDEN_REFERENCE`).

**On submit** the order is: validate the answers, drop the hidden ones, **compute the calculations**, score, pick the end screen, count the quotas. A value that the client sends for a calculation is dropped; only the server's is stored in `answers`. A value that could not be computed (a division by zero, an empty input with `emptyAsZero: false`) is not stored, and the response is accepted anyway.

- **End rules** may look at a calculation (`total > 5000`), and the text of an end screen may contain `{{calc:<question id>}}`, which becomes the value as the field shows it: prefix, exactly `decimals` places, the language's separators (`$8,548.67`, `8 548,67`), suffix. A field with no value becomes `—`.
- **Quotas and the conditions of questions** may not look at a calculation (`FORM_INVALID_QUOTAS`, `FORM_INVALID_CONDITIONS` with reason `CALCULATION_REFERENCE`).
- **Public form.** A hidden calculation is not in it at all, formula included. A visible one carries its formula, and the questions that a visible formula reads **keep their points** (the viewer needs the price of an option to show the total as it changes); every other question still loses its points. So points that are meant to stay secret (a quiz) must not be read by a visible formula.
- **Duplicating a form** rewrites the question references in the copied formulas to the copied questions.
- **Exports** have a column per calculation: a number as a raw number, a text as is, a boolean as Так / Ні ([exports](exports.md)). **Analytics** show min / avg / max of a number result in the overview and the value as the respondent read it in a response; there is no per-answer detail ([analytics](analytics.md)).
- **Limits of the points.** An option's points are now up to 1 000 000 in either direction (they were 1000) so they can be prices; the bounds of a score category are up to 1 000 000 000.

## The editor in the builder

A calculation field is added like any question (the sidebar, or the "+" between questions). Its card has no "required" switch.

- **Formula.** A text area. A question is written `[[Name]]`: the builder converts it to `{q:<id>}` when it stores the formula and back when it shows it, so renaming a question never breaks a formula. Two questions with the same name are `Name` and `Name #2`, a name is at most 40 characters and has no brackets, and an untitled question is "Untitled N". Text in quotes is left alone, so `"[[Plan]]"` stays text. Unfinished text such as `[[Pla` stays as typed.
- **Insert a question** puts `[[Name]]` where the cursor was (the end when the text area was never focused). Only questions a formula can read are listed (not dates, rankings, matrices or files) and not the field itself.
- **Functions** is a reference list; a click inserts `NAME()` with the cursor inside the brackets.
- **Live check.** The same engine the server runs checks the formula as you type. A problem shows its message, the position (counted in the text you see) and the place marked in the formula. Saving is blocked while a calculation has a problem, so the server never has to refuse it (it still does, as a safety net: `400 FORM_INVALID_FORMULAS`).
- **Settings:** the result type (number, text, yes/no), places after the point (0 to 8), a prefix and a suffix, whether the respondent sees the value, and whether an empty answer counts as 0.
- **Test panel.** It asks for sample answers for the questions the formula reads (following other calculation fields down to the questions they read) and shows the result the server would compute, or why there is none (division by zero, an empty answer with "empty counts as 0" off, ...).
- **End screen.** The card shows the placeholder to paste into the text of an end screen (`{{calc:<id>}}`) with a copy button. A result rule can pick a calculation field as its question, with the operators of its result type (number: equals, not equals, greater, less; text: equals, not equals, contains; yes/no: equals). A question's own condition and a quota cannot.

## The viewer

The respondent sees the value of a visible calculation change while they answer. It is computed in the browser by the same engine the server runs, so the number they see is the number the server stores. The server recomputes everything on submit and overwrites any value; the form does not send these values at all.

- **Where it is.** In "all questions on one page" mode the field is a read-only card at its own place; it is an `<output>` element labelled by the question, announced politely to a screen reader when it changes. In "one question at a time" mode it is a step of its own (with the value and "Next"), and the review screen lists it with its value. It has no "required" mark and never blocks the submit.
- **How it is written.** The number has exactly `decimals` places, the respondent's language's separators and the prefix and suffix (`$1,234.50`, `1 234,50`); text and yes/no are shown as they are. A field with no value shows a dash.
- **What it reads.** The answers so far. A question that a condition hid counts as empty, like on the server, so an old answer to a question a branch closed does not count. Empty answers count as 0 / "" / no, or make the value a dash when "empty counts as 0" is off.
- **Points.** To show a price the viewer needs the points of the options a visible formula reads; the server sends exactly those (see "What the server does"). A hidden calculation is not sent at all, so it never shows up, and a visible one cannot read it.
- **Same result everywhere.** `packages/calculation-engine/src/formula/parity.cases.ts` is one list of cases (prices to the cent, rounding, empty and hidden inputs, division by zero, chains of fields, text functions, overflow). The engine, the server's submit step and the viewer's live calculation each run all of them and must give the same values.

## Not in v1

- Visibility conditions of questions that depend on a calculation value (they need a shared dependency graph of conditions and formulas).
- Dates, rankings, matrices and files as formula inputs.
