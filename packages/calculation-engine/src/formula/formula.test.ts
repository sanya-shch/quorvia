import { describe, expect, it } from "vitest";
import { PARITY_CASES } from "./parity.cases.js";
import {
  analyzeFormula,
  compileCalculations,
  computeCalculations,
  evaluateFormula,
  formatCalcValue,
  formulaToShown,
  referenceLabels,
  shownToFormula,
  parseFormula,
  remapFormulaRefs,
  validateCalculations,
  type CalculationConfig,
  type FormulaQuestion,
} from "../index.js";

const num = (id: string, type: FormulaQuestion["type"] = "NUMBER"): FormulaQuestion => ({
  id,
  type,
});
const choice = (
  id: string,
  scores: Record<string, number>,
  type: FormulaQuestion["type"] = "CHOICE_SINGLE",
): FormulaQuestion => ({
  id,
  type,
  options: Object.entries(scores).map(([k, score]) => ({ id: k, text: `Option ${k}`, score })),
});
const calc = (
  id: string,
  formula: string,
  extra: Partial<CalculationConfig> = {},
): FormulaQuestion => ({
  id,
  type: "CALCULATION",
  config: { formula, resultType: "number", ...extra },
});

const base: FormulaQuestion[] = [
  num("a"),
  num("b"),
  { id: "t", type: "TEXT" },
  { id: "yes", type: "BOOLEAN", config: { score: { true: 5, false: 1 } } },
  choice("plan", { basic: 100, pro: 250.5 }),
  choice("extras", { x: 10, y: 20, z: 30 }, "CHOICE_MULTI"),
];

// Computes one formula over `base` plus the given answers.
const run = (
  formula: string,
  answers: Record<string, unknown> = {},
  extra: Partial<CalculationConfig> = {},
  visible: Set<string> | null = null,
) => {
  const q = calc("r", formula, extra);
  const out = computeCalculations([...base, q], answers, visible);

  return { value: out.values.r, error: out.errors.r };
};

describe("exact decimal arithmetic", () => {
  it("adds without binary float noise", () => {
    expect(run("0.1 + 0.2").value).toBe(0.3);
    expect(run("0.1 + 0.2", {}, { decimals: 8 }).value).toBe(0.3);
  });

  it("multiplies prices and rates exactly", () => {
    expect(run("19.99 * 3").value).toBe(59.97);
    expect(run("100 * 0.075").value).toBe(7.5);
    expect(run("{q:a} * 1.1", { a: 0.7 }, { decimals: 4 }).value).toBe(0.77);
  });

  it("rounds half away from zero, unlike Math.round on floats", () => {
    expect(run("ROUND(2.675, 2)").value).toBe(2.68);
    expect(run("ROUND(-2.675, 2)").value).toBe(-2.68);
    expect(run("ROUND(1.005, 2)").value).toBe(1.01);
    expect(run("ROUND(2.5)").value).toBe(3);
  });

  it("rounds the final result to `decimals` (default 2)", () => {
    expect(run("10 / 3").value).toBe(3.33);
    expect(run("10 / 3", {}, { decimals: 0 }).value).toBe(3);
    expect(run("2 / 3", {}, { decimals: 4 }).value).toBe(0.6667);
    expect(run("1 / 3 * 3").value).toBe(1);
  });

  it("FLOOR and CEIL take optional digits", () => {
    expect(run("FLOOR(2.999, 2)").value).toBe(2.99);
    expect(run("CEIL(2.001, 2)").value).toBe(2.01);
    expect(run("FLOOR(-1.5)").value).toBe(-2);
    expect(run("CEIL(-1.5)").value).toBe(-1);
  });

  it("modulo keeps the sign of the dividend", () => {
    expect(run("7 % 3").value).toBe(1);
    expect(run("-7 % 3").value).toBe(-1);
    expect(run("5.5 % 2").value).toBe(1.5);
  });

  it("never returns -0", () => {
    expect(Object.is(run("-0.001").value, 0)).toBe(true);
  });
});

describe("parser", () => {
  const evalConst = (f: string) => run(f).value;

  it("respects precedence and associativity", () => {
    expect(evalConst("1 + 2 * 3")).toBe(7);
    expect(evalConst("(1 + 2) * 3")).toBe(9);
    expect(evalConst("10 - 4 - 3")).toBe(3);
    expect(evalConst("100 / 10 / 5")).toBe(2);
    expect(evalConst("-2 * 3")).toBe(-6);
    expect(evalConst("2 * -3")).toBe(-6);
    expect(evalConst("--5")).toBe(5);
  });

  it("orders NOT, comparison, AND, OR", () => {
    const b = (f: string) => run(f, {}, { resultType: "boolean" }).value;

    expect(b("NOT 1 = 2")).toBe(true);
    expect(b("TRUE OR FALSE AND FALSE")).toBe(true);
    expect(b("(TRUE OR FALSE) AND FALSE")).toBe(false);
    expect(b("1 + 1 = 2 AND 3 > 2")).toBe(true);
    expect(b("1 != 2")).toBe(true);
    expect(b("2 <= 2 AND 2 >= 2")).toBe(true);
  });

  it("is case-insensitive for keywords and functions", () => {
    expect(evalConst("round(1.5) + Max(1, 2)")).toBe(4);
  });

  it("handles strings with escapes", () => {
    const s = (f: string) => run(f, {}, { resultType: "string" }).value;

    expect(s('"a\\"b"')).toBe('a"b');
    expect(s('"back\\\\slash"')).toBe("back\\slash");
    expect(s('CONCAT("x", 1.50, TRUE)')).toBe("x1.5TRUE");
  });

  const fails = (formula: string) => {
    const r = parseFormula(formula);

    return r.ok ? null : r.error;
  };

  it("reports the position of syntax errors", () => {
    expect(fails("1 + ")).toMatchObject({ code: "UNEXPECTED_END" });
    expect(fails("1 + * 2")).toMatchObject({ code: "UNEXPECTED_TOKEN", pos: 4 });
    expect(fails("(1 + 2")).toMatchObject({ code: "UNEXPECTED_END" });
    expect(fails("1 2")).toMatchObject({ code: "UNEXPECTED_TOKEN", pos: 2 });
    expect(fails("1 $ 2")).toMatchObject({ code: "UNEXPECTED_CHARACTER", pos: 2 });
    expect(fails("1.")).toMatchObject({ code: "BAD_NUMBER" });
    expect(fails("12ab")).toMatchObject({ code: "BAD_NUMBER" });
    expect(fails('"open')).toMatchObject({ code: "BAD_STRING" });
    expect(fails('"a\\n"')).toMatchObject({ code: "BAD_STRING" });
    expect(fails("{q:}")).toMatchObject({ code: "BAD_REFERENCE" });
    expect(fails("{a}")).toMatchObject({ code: "BAD_REFERENCE" });
    expect(fails("foo")).toMatchObject({ code: "UNKNOWN_IDENTIFIER" });
    expect(fails("   ")).toMatchObject({ code: "EMPTY_FORMULA" });
  });

  it("enforces the size limits", () => {
    expect(fails("1".repeat(501))).toMatchObject({ code: "FORMULA_TOO_LONG" });
    expect(fails(Array(201).fill("1").join("+"))).toMatchObject({ code: "TOO_MANY_NODES" });
    // 21 summands: the left-leaning chain is 21 levels deep.
    expect(fails(Array(21).fill("1").join("+"))).toMatchObject({ code: "DEPTH_LIMIT" });
    expect(fails(Array(20).fill("1").join("+"))).toBeNull();
    expect(fails("(".repeat(200) + "1" + ")".repeat(200))).toMatchObject({ code: "DEPTH_LIMIT" });
    expect(fails("1".repeat(31))).toMatchObject({ code: "BAD_NUMBER" });
    expect(fails(`"${"x".repeat(201)}"`)).toMatchObject({ code: "BAD_STRING" });
  });
});

describe("type checking on save", () => {
  const questions = new Map(base.map((q) => [q.id, q]));
  const check = (
    formula: string,
    resultType: CalculationConfig["resultType"] = "number",
    decimals?: number,
  ) => analyzeFormula({ formula, resultType, decimals }, questions);
  const code = (formula: string, resultType?: CalculationConfig["resultType"]) => {
    const r = check(formula, resultType);

    return r.ok ? "ok" : r.error.code;
  };

  it("accepts valid formulas", () => {
    expect(code("{q:a} + {q:b} * 2")).toBe("ok");
    expect(code('IF({q:a} > 5, "big", "small")', "string")).toBe("ok");
    expect(code("SCORE({q:plan}) + COUNT({q:extras}) + SCORE({q:yes})")).toBe("ok");
    expect(code("LABEL({q:plan})", "string")).toBe("ok");
    expect(code("{q:yes} AND {q:a} > 1", "boolean")).toBe("ok");
    expect(code("UPPER({q:t})", "string")).toBe("ok");
  });

  it("rejects type errors", () => {
    expect(code('1 + "a"')).toBe("TYPE_MISMATCH");
    expect(code("{q:t} + 1")).toBe("TYPE_MISMATCH");
    expect(code("1 < TRUE", "boolean")).toBe("TYPE_MISMATCH");
    expect(code('1 = "1"', "boolean")).toBe("TYPE_MISMATCH");
    expect(code("IF(1, 2, 3)")).toBe("TYPE_MISMATCH");
    expect(code('IF(TRUE, 1, "x")')).toBe("TYPE_MISMATCH");
    expect(code("NOT 1", "boolean")).toBe("TYPE_MISMATCH");
    expect(code("COUNT(1)")).toBe("TYPE_MISMATCH");
    expect(code("UPPER(1)", "string")).toBe("TYPE_MISMATCH");
  });

  it("rejects a result type that does not match the formula", () => {
    expect(code("1 + 1", "string")).toBe("TYPE_MISMATCH");
    expect(code('"x"', "number")).toBe("TYPE_MISMATCH");
  });

  it("rejects unknown functions, wrong arity, unknown and unsupported references", () => {
    expect(code("FOO(1)")).toBe("UNKNOWN_FUNCTION");
    expect(code("ROUND()")).toBe("ARITY");
    expect(code("ROUND(1, 2, 3)")).toBe("ARITY");
    expect(code("IF(TRUE, 1)")).toBe("ARITY");
    expect(code("{q:ghost} + 1")).toBe("UNKNOWN_REFERENCE");
    expect(code("COUNT({q:plan})")).toBe("UNSUPPORTED_REFERENCE");
    expect(code("LABEL({q:extras})", "string")).toBe("UNSUPPORTED_REFERENCE");

    const unsupported = new Map([["d", { id: "d", type: "DATE" as const }]]);

    expect(analyzeFormula({ formula: "{q:d}", resultType: "number" }, unsupported)).toMatchObject({
      ok: false,
      error: { code: "UNSUPPORTED_REFERENCE" },
    });
  });

  it("rejects invalid decimals", () => {
    expect(check("1", "number", 9)).toMatchObject({ ok: false, error: { code: "INVALID_CONFIG" } });
    expect(check("1", "number", 1.5)).toMatchObject({
      ok: false,
      error: { code: "INVALID_CONFIG" },
    });
    expect(check("1", "number", 8).ok).toBe(true);
  });
});

describe("references", () => {
  it("reads numbers, option points, multi sums, booleans and text", () => {
    expect(run("{q:a} + {q:b}", { a: 1.1, b: 2.2 }).value).toBe(3.3);
    expect(run("{q:plan}", { plan: "pro" }).value).toBe(250.5);
    expect(run("{q:extras}", { extras: ["x", "z"] }).value).toBe(40);
    expect(run("SCORE({q:yes})", { yes: true }).value).toBe(5);
    expect(run("SCORE({q:yes})", { yes: false }).value).toBe(1);
    expect(run("IF({q:yes}, 1, 2)", { yes: true }).value).toBe(1);
    expect(run("COUNT({q:extras})", { extras: ["x", "y", "nope"] }).value).toBe(2);
    expect(run("LABEL({q:plan})", { plan: "basic" }, { resultType: "string" }).value).toBe(
      "Option basic",
    );
    expect(run("UPPER({q:t})", { t: "hi" }, { resultType: "string" }).value).toBe("HI");
  });

  it("totals a price calculator without drift", () => {
    const f = "({q:plan} + {q:extras}) * {q:a} * 1.2";

    expect(run(f, { plan: "pro", extras: ["x", "y"], a: 3 }).value).toBe(
      Math.round(280.5 * 3 * 1.2 * 100) / 100,
    );
    expect(run(f, { plan: "pro", extras: ["x", "y"], a: 3 }, { decimals: 4 }).value).toBe(1009.8);
  });

  it("treats empty, hidden and mistyped inputs as 0 / '' / false by default", () => {
    expect(run("{q:a} + 1").value).toBe(1);
    expect(run("{q:a} + 1", { a: "x" }).value).toBe(1);
    expect(run("{q:a} + 1", { a: Number.NaN }).value).toBe(1);
    expect(run("{q:plan}", { plan: "unknown" }).value).toBe(0);
    expect(run("{q:plan}", { plan: ["basic"] }).value).toBe(0);
    expect(run("{q:extras}", { extras: [] }).value).toBe(0);
    expect(run('CONCAT({q:t}, "!")', {}, { resultType: "string" }).value).toBe("!");
    expect(run("{q:yes}", {}, { resultType: "boolean" }).value).toBe(false);
    expect(run("LABEL({q:plan})", {}, { resultType: "string" }).value).toBe("");
    expect(run("{q:a} + 1", { a: 5 }, {}, new Set(["b", "r"])).value).toBe(1);
  });

  it("gives null with EMPTY_REFERENCE when emptyAsZero is off", () => {
    const off = { emptyAsZero: false };

    expect(run("{q:a} + 1", {}, off)).toEqual({ value: null, error: "EMPTY_REFERENCE" });
    expect(run("{q:a} + 1", { a: 5 }, off).value).toBe(6);
    expect(run("LABEL({q:plan})", {}, { ...off, resultType: "string" }).error).toBe(
      "EMPTY_REFERENCE",
    );
    expect(run("{q:a} + 1", { a: 5 }, off, new Set(["r"])).error).toBe("EMPTY_REFERENCE");
    // The branch that is not taken is never read.
    expect(run("IF(TRUE, 1, {q:a})", {}, off).value).toBe(1);
  });

  it("does not read inherited keys of the answers object", () => {
    const evil = JSON.parse('{"__proto__": 99, "constructor": 5}') as Record<string, unknown>;
    const questions = [num("__proto__"), calc("r", "{q:__proto__} + 1")];

    expect(computeCalculations(questions, {}).values.r).toBe(1);
    // A real own "__proto__" key in parsed JSON is a normal answer.
    expect(computeCalculations(questions, evil).values.r).toBe(100);
  });
});

describe("failures give null, never an exception", () => {
  it("division by zero and modulo by zero", () => {
    expect(run("1 / 0")).toEqual({ value: null, error: "DIVISION_BY_ZERO" });
    expect(run("1 % 0").error).toBe("DIVISION_BY_ZERO");
    expect(run("{q:a} / {q:b}", { a: 4 }).error).toBe("DIVISION_BY_ZERO");
  });

  it("evaluates only the branch that is taken", () => {
    expect(run("IF({q:b} = 0, 0, {q:a} / {q:b})", { a: 4, b: 0 }).value).toBe(0);
    expect(run("IF({q:b} = 0, 0, {q:a} / {q:b})", { a: 4, b: 2 }).value).toBe(2);
    expect(run("{q:b} != 0 AND {q:a} / {q:b} > 1", {}, { resultType: "boolean" }).value).toBe(
      false,
    );
  });

  it("overflow and invalid arguments", () => {
    const big = Array(10).fill("10000000").join("*");

    expect(run(big).error).toBe("OVERFLOW");
    expect(run("999999999999999 + 1").error).toBe("OVERFLOW");
    expect(run("1234567890.123456 * 1000000", {}, { decimals: 6 }).error).toBe("OVERFLOW");
    expect(run("ROUND(1, 9)").error).toBe("INVALID_ARGUMENT");
    expect(run("ROUND(1, 0.5)").error).toBe("INVALID_ARGUMENT");
    expect(run("ROUND(1, -1)").error).toBe("INVALID_ARGUMENT");
    // Long text from an answer: 20 copies of a 100-character answer exceed the 1000-character cap.
    const refs = Array(20).fill("{q:t}").join(", ");
    expect(run(`CONCAT(${refs})`, { t: "x".repeat(100) }, { resultType: "string" }).error).toBe(
      "OVERFLOW",
    );
  });

  it("an invalid stored formula yields INVALID_FORMULA and does not block the others", () => {
    const out = computeCalculations([num("a"), calc("bad", "1 +"), calc("ok", "{q:a} * 2")], {
      a: 4,
    });

    expect(out.values).toEqual({ bad: null, ok: 8 });
    expect(out.errors).toEqual({ bad: "INVALID_FORMULA" });
  });

  it("MIN / MAX / SUM / AVG / ABS", () => {
    expect(run("MIN(3, 1.5, 2)").value).toBe(1.5);
    expect(run("MAX({q:a}, {q:b}, 0)", { a: -2, b: -1 }).value).toBe(0);
    expect(run("SUM(0.1, 0.2, 0.3)").value).toBe(0.6);
    expect(run("AVG(1, 2)").value).toBe(1.5);
    expect(run("AVG(1, 2, 4)", {}, { decimals: 4 }).value).toBe(2.3333);
    expect(run("ABS(-2.5)").value).toBe(2.5);
  });
});

describe("dependency graph", () => {
  it("orders calculation fields by what they read, ties by question order", () => {
    const qs = [
      num("a"),
      calc("c3", "{q:c2} + 1"),
      calc("c1", "{q:a} * 2"),
      calc("c2", "{q:c1} + {q:a}"),
    ];

    expect(compileCalculations(qs).order).toEqual(["c1", "c2", "c3"]);
    expect(computeCalculations(qs, { a: 5 }).values).toEqual({ c1: 10, c2: 15, c3: 16 });
  });

  it("reports a cycle and a self reference", () => {
    const cycle = validateCalculations([
      calc("x", "{q:y}"),
      calc("y", "{q:z}"),
      calc("z", "{q:x}"),
    ]);

    expect(cycle).toHaveLength(1);
    expect(cycle[0]).toMatchObject({ code: "FORMULA_CYCLE" });
    expect(cycle[0]!.cycle).toEqual(["x", "y", "z", "x"]);
    expect(validateCalculations([calc("s", "{q:s} + 1")])[0]).toMatchObject({
      code: "FORMULA_CYCLE",
      cycle: ["s", "s"],
    });
  });

  it("keeps computing the fields that are not on a cycle", () => {
    const out = computeCalculations(
      [num("a"), calc("x", "{q:y}"), calc("y", "{q:x}"), calc("ok", "{q:a} + 1")],
      { a: 1 },
    );

    expect(out.values).toEqual({ x: null, y: null, ok: 2 });
    expect(out.errors).toMatchObject({ x: "INVALID_FORMULA", y: "INVALID_FORMULA" });
  });

  it("reports one issue per broken field with its questionId", () => {
    const issues = validateCalculations([
      num("a"),
      calc("one", "{q:ghost}"),
      calc("two", "{q:a} +"),
      calc("fine", "{q:a}"),
    ]);

    expect(issues.map((i) => [i.questionId, i.code])).toEqual([
      ["one", "UNKNOWN_REFERENCE"],
      ["two", "UNEXPECTED_END"],
    ]);
  });

  it("a calculation field of another result type can be read", () => {
    const qs = [
      num("a"),
      calc("flag", "{q:a} > 10", { resultType: "boolean" }),
      calc("label", 'IF({q:flag}, "high", "low")', { resultType: "string" }),
    ];

    expect(computeCalculations(qs, { a: 11 }).values).toEqual({ flag: true, label: "high" });
    expect(computeCalculations(qs, { a: 1 }).values).toEqual({ flag: false, label: "low" });
  });

  it("a hidden calculation field is not computed and reads as empty downstream", () => {
    const qs = [num("a"), calc("c1", "{q:a} * 2"), calc("c2", "{q:c1} + 1")];
    const out = computeCalculations(qs, { a: 5 }, new Set(["a", "c2"]));

    expect(out.values).toEqual({ c2: 1 });
  });

  it("a failed field reads as empty downstream", () => {
    const qs = [
      calc("c1", "1 / 0"),
      calc("c2", "{q:c1} + 1"),
      calc("c3", "{q:c1} + 1", { emptyAsZero: false }),
    ];
    const out = computeCalculations(qs, {});

    expect(out.values).toEqual({ c1: null, c2: 1, c3: null });
    expect(out.errors).toEqual({ c1: "DIVISION_BY_ZERO", c3: "EMPTY_REFERENCE" });
  });
});

describe("evaluateFormula", () => {
  it("rejects a result of the wrong type", () => {
    const parsed = parseFormula("1 + 1");

    if (!parsed.ok) throw new Error("parse");

    const env = {
      questions: new Map(),
      answers: {},
      visibleIds: null,
      calcValues: new Map(),
      emptyAsZero: true,
    };

    expect(evaluateFormula(parsed.ast, env, { resultType: "string" })).toEqual({
      ok: false,
      code: "INVALID_FORMULA",
    });
    expect(evaluateFormula(parsed.ast, env, { resultType: "number" })).toEqual({
      ok: true,
      value: 2,
    });
  });
});

// A small deterministic generator (no extra dependency): random token soup must never throw, and
// anything that parses must also evaluate to a value or a coded failure.
describe("fuzz", () => {
  const pieces = [
    "1",
    "2.5",
    "0",
    "99999999999",
    '"s"',
    "TRUE",
    "FALSE",
    "{q:a}",
    "{q:b}",
    "{q:plan}",
    "{q:extras}",
    "{q:yes}",
    "+",
    "-",
    "*",
    "/",
    "%",
    "=",
    "!=",
    "<",
    "<=",
    ">",
    ">=",
    "AND",
    "OR",
    "NOT",
    "(",
    ")",
    ",",
    "IF",
    "ROUND",
    "SUM",
    "MIN",
    "COUNT",
    "LABEL",
    "SCORE",
    "CONCAT",
    "UPPER",
    " ",
    "\\",
    '"',
    "{",
    "}",
    "$",
    "é",
    "\u0000",
  ];

  const rng = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;

    return seed / 4294967296;
  };

  it("never throws on random input", () => {
    const next = rng(12345);

    for (let i = 0; i < 3000; i++) {
      const length = 1 + Math.floor(next() * 14);
      const formula = Array.from({ length }, () => pieces[Math.floor(next() * pieces.length)]).join(
        next() < 0.5 ? " " : "",
      );

      expect(() => {
        const out = computeCalculations([...base, calc("r", formula)], {
          a: 3,
          b: 0,
          plan: "pro",
          extras: ["x"],
          yes: true,
        });

        expect(out.values).toHaveProperty("r");
      }).not.toThrow();
    }
  });

  it("random garbage of any length is bounded", () => {
    const next = rng(777);

    for (let i = 0; i < 300; i++) {
      const formula = Array.from(
        { length: Math.floor(next() * 700) },
        () => pieces[Math.floor(next() * pieces.length)],
      ).join("");

      expect(() => parseFormula(formula)).not.toThrow();
    }
  });

  it("deep parentheses and long chains stay within limits and do not overflow the stack", () => {
    expect(parseFormula("(".repeat(100000)).ok).toBe(false);
    expect(parseFormula("-".repeat(100000)).ok).toBe(false);
    expect(parseFormula("NOT ".repeat(100000)).ok).toBe(false);
    expect(parseFormula("ROUND(".repeat(100000)).ok).toBe(false);
  });
});

describe("hidden calculations", () => {
  it("a visible calculation cannot read a hidden one", () => {
    const qs = [num("a"), calc("h", "{q:a} * 2", { display: "hidden" }), calc("v", "1 + {q:h}")];
    const issues = validateCalculations(qs);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ questionId: "v", code: "HIDDEN_REFERENCE", pos: 4, end: 9 });
  });

  it("hidden may read hidden and visible; visible may read visible", () => {
    const qs = [
      num("a"),
      calc("v1", "{q:a}"),
      calc("h1", "{q:v1} + 1", { display: "hidden" }),
      calc("h2", "{q:h1} + 1", { display: "hidden" }),
      calc("v2", "{q:v1} + 1"),
    ];

    expect(validateCalculations(qs)).toEqual([]);
  });
});

describe("remapFormulaRefs", () => {
  const map = new Map([
    ["a", "n1"],
    ["b", "n2"],
  ]);

  it("replaces references and leaves unknown ids and text alone", () => {
    expect(remapFormulaRefs("{q:a} + {q:b} * {q:c}", map)).toBe("{q:n1} + {q:n2} * {q:c}");
    expect(remapFormulaRefs('CONCAT("{q:a}", {q:a})', map)).toBe('CONCAT("{q:a}", {q:n1})');
  });

  it("falls back to text replacement when the formula does not parse", () => {
    expect(remapFormulaRefs("({q:a} +", map)).toBe("({q:n1} +");
  });

  it("the copy computes the same value", () => {
    const original = [num("a"), calc("r", "{q:a} * 3")];
    const copy = [num("n1"), calc("r2", remapFormulaRefs("{q:a} * 3", map))];

    expect(computeCalculations(original, { a: 2 }).values.r).toBe(6);
    expect(computeCalculations(copy, { n1: 2 }).values.r2).toBe(6);
  });
});

describe("formatCalcValue", () => {
  const money = { resultType: "number", decimals: 2, prefix: "$" } as const;

  it("shows exactly `decimals` places with the prefix and suffix", () => {
    expect(formatCalcValue(59.9, money, "en")).toBe("$59.90");
    expect(formatCalcValue(1234567.5, money, "en")).toBe("$1,234,567.50");
    expect(formatCalcValue(12, { resultType: "number", decimals: 0, suffix: " kg" }, "en")).toBe(
      "12 kg",
    );
    expect(formatCalcValue(0.5, { resultType: "number" }, "en")).toBe("0.50");
  });

  it("uses the language's separators", () => {
    expect(formatCalcValue(1234.5, { resultType: "number" }, "de")).toBe("1.234,50");
  });

  it("falls back to plain digits for an unknown locale", () => {
    expect(formatCalcValue(1234.5, { resultType: "number" }, "not a locale!")).toBe("1234.50");
  });

  it("text, boolean and no value", () => {
    expect(formatCalcValue("Pro", { resultType: "string" })).toBe("Pro");
    expect(formatCalcValue(true, { resultType: "boolean" }, "uk")).toBe("Так");
    expect(formatCalcValue(false, { resultType: "boolean" }, "en")).toBe("No");
    expect(formatCalcValue(null, money)).toBe("—");
    expect(formatCalcValue(undefined, money)).toBe("—");
  });
});

describe("formula text with question names", () => {
  const questions = [
    { id: "id-plan", text: "Plan" },
    { id: "id-seats", text: "Seats" },
    { id: "id-seats-2", text: "Seats" },
    { id: "id-empty", text: "  " },
    { id: "id-odd", text: "Price [USD]\nnet" },
  ];
  const labels = referenceLabels(questions, (n) => `Untitled ${n}`);

  it("gives every question a unique label", () => {
    expect([...labels.labelById.values()]).toEqual([
      "Plan",
      "Seats",
      "Seats #2",
      "Untitled 4",
      "Price USD net",
    ]);
    expect(labels.idByLabel.get("Seats #2")).toBe("id-seats-2");
  });

  it("shortens a long text", () => {
    const long = referenceLabels([{ id: "a", text: "x".repeat(100) }]);

    expect(long.labelById.get("a")).toHaveLength(40);
  });

  it("shows names and converts back to the same formula", () => {
    const stored = "{q:id-plan} * {q:id-seats-2} + {q:id-odd}";
    const shown = formulaToShown(stored, labels);

    expect(shown.text).toBe("[[Plan]] * [[Seats #2]] + [[Price USD net]]");
    expect(shownToFormula(shown.text, labels)).toBe(stored);
  });

  it("renaming a question changes the shown text, not the stored formula", () => {
    const stored = "{q:id-plan} + 1";
    const renamed = referenceLabels([{ id: "id-plan", text: "Tariff" }]);

    expect(formulaToShown(stored, renamed).text).toBe("[[Tariff]] + 1");
    expect(shownToFormula("[[Tariff]] + 1", renamed)).toBe(stored);
  });

  it("leaves unknown references, unfinished names and string literals alone", () => {
    expect(formulaToShown("{q:gone} + 1", labels).text).toBe("{q:gone} + 1");
    expect(shownToFormula("[[Nope]] + [[Pla", labels)).toBe("[[Nope]] + [[Pla");
    expect(formulaToShown('CONCAT("{q:id-plan}", {q:id-plan})', labels).text).toBe(
      'CONCAT("{q:id-plan}", [[Plan]])',
    );
    expect(shownToFormula('CONCAT("[[Plan]]", [[Plan]])', labels)).toBe(
      'CONCAT("[[Plan]]", {q:id-plan})',
    );
    expect(shownToFormula('"a\\\\" [[Plan]]', labels)).toBe('"a\\\\" {q:id-plan}');
  });

  it("carries an error position from the stored text to the shown one", () => {
    const stored = "{q:id-plan} + * 2";
    const shown = formulaToShown(stored, labels);
    const at = stored.indexOf("*");

    expect(shown.text.charAt(shown.mapPosition(at))).toBe("*");
    // Inside a reference: the start or the end of the shown name.
    expect(shown.mapPosition(3)).toBe(0);
    expect(shown.mapPosition(3, true)).toBe("[[Plan]]".length);
    expect(shown.mapPosition(0)).toBe(0);
    expect(shown.mapPosition(stored.length)).toBe(shown.text.length);
  });

  it("round-trips random text without throwing", () => {
    for (const text of ["", "[[", "]]", '"', '"\\', "{q:", "{q:a}", "[[Plan]][[Plan]]"]) {
      expect(() => shownToFormula(text, labels)).not.toThrow();
      expect(() => formulaToShown(text, labels)).not.toThrow();
    }
  });
});

describe("parity cases (shared with the server and the viewer)", () => {
  it.each(PARITY_CASES.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const visible = c.visibleQuestionIds ? new Set(c.visibleQuestionIds) : null;
    const { values } = computeCalculations(c.questions, c.answers, visible);

    expect(
      Object.fromEntries(Object.keys(c.expected).map((id) => [id, values[id] ?? null])),
    ).toEqual(c.expected);
  });
});
