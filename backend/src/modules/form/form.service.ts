import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma/prisma.js";
import { AppError } from "../../shared/middleware/errorHandler.js";
import {
  ErrorCode,
  type FormClosedReason,
  normalizeFormTranslations,
  getClosedReason,
  normalizeEndRules,
  normalizeEndScreen,
  normalizeScoring,
  normalizeTheme,
  normalizeWelcomeScreen,
  normalizeQuestionTranslations,
  stripOutcomeTranslations,
} from "@quorvia/shared-types";
import type {
  ClosedPublicFormDto,
  PublicFormDto,
  UpdateFormInput,
  UserFormsDto,
} from "./form.types.js";
import { assertFormOpen } from "./form.closing.js";
import { assertEndRulesValid } from "./form.endRules.js";
import { assertQuotasValid } from "./form.quotas.js";
import { stripQuestionScoring } from "./form.scoring.js";
import { removeFileObjects } from "../file/file.service.js";
import {
  assertFormAsset,
  assertFormAssets,
  copyAssetFiles,
  removeStoredFiles,
} from "../asset/asset.service.js";

type IncomingQuestion = UpdateFormInput["questions"][number];
type ResolvedQuestion = IncomingQuestion & { id: string };
import { toJson, toNullableJson } from "../../shared/utils/helpers.js";
import { validateConditionGraph } from "@quorvia/condition-engine";

export const createForm = async ({
  title,
  description,
  defaultLanguage,
  userId,
}: {
  title: string;
  description?: string;
  defaultLanguage?: string;
  userId: string;
}) => {
  return prisma.form.create({
    data: {
      title,
      description,
      // undefined -> the default from schema.prisma
      defaultLanguage,
      userId,
    },
  });
};

export const getUserForms = async (userId: string): Promise<UserFormsDto> => {
  return prisma.form.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          questions: true,
          responses: true,
        },
      },
    },
  });
};

export const deleteForm = async (formId: string, userId: string) => {
  const form = await prisma.form.findUnique({
    where: { id: formId },
  });

  if (!form) {
    throw new AppError(ErrorCode.FORM_NOT_FOUND, 404);
  }

  if (form.userId !== userId) {
    throw new AppError(ErrorCode.FORM_FORBIDDEN, 403);
  }

  // The rows disappear with the form (cascade), the files do not: collect their keys first
  // and remove the files afterwards. A failure there is not an error, the orphan sweep in
  // maintenance finds leftovers.
  const assets = await prisma.asset.findMany({ where: { formId }, select: { storageKey: true } });
  const files = await prisma.responseFile.findMany({
    where: { formId },
    select: { storageKey: true },
  });

  await prisma.form.delete({
    where: { id: formId },
  });

  await removeStoredFiles(assets.map((asset) => asset.storageKey));
  await removeFileObjects(files.map((file) => file.storageKey));
};

export const getUserForm = async (formId: string, userId: string) => {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: {
      questions: {
        orderBy: { order: "asc" },
      },
      _count: {
        select: {
          responses: true,
        },
      },
    },
  });

  if (!form) {
    throw new AppError(ErrorCode.FORM_NOT_FOUND, 404);
  }

  if (form.userId !== userId) {
    throw new AppError(ErrorCode.FORM_FORBIDDEN, 403);
  }

  return form;
};

const loadPublishedForm = async (shareId: string) => {
  const form = await prisma.form.findUnique({
    where: { shareId },
    include: {
      questions: {
        orderBy: { order: "asc" },
      },
    },
  });

  if (!form || !form.isPublished) {
    throw new AppError(ErrorCode.FORM_NOT_AVAILABLE, 404);
  }

  return form;
};

type LoadedForm = Awaited<ReturnType<typeof loadPublishedForm>>;

const toPublicFormDto = (form: LoadedForm): PublicFormDto => ({
  id: form.id,
  title: form.title,
  description: form.description,
  responseMode: form.responseMode,
  defaultLanguage: form.defaultLanguage,
  languages: form.languages,
  // The end rule texts and score category labels stay on the server: only the screen chosen on
  // submit is sent.
  translations: stripOutcomeTranslations(form.translations) as Prisma.JsonValue | null,
  logoAssetId: form.logoAssetId,
  // Normalized again on read: only known keys and valid values leave the server.
  theme: normalizeTheme(form.theme),
  welcomeScreen: normalizeWelcomeScreen(form.welcomeScreen),
  endScreen: normalizeEndScreen(form.endScreen),
  // Without the points: which answer is worth what (and so which is "right") stays on the server.
  questions: form.questions.map(stripQuestionScoring),
});

const toClosedFormDto = (
  form: LoadedForm,
  closedReason: FormClosedReason,
): ClosedPublicFormDto => ({
  closedReason,
  id: form.id,
  title: form.title,
  description: form.description,
  defaultLanguage: form.defaultLanguage,
  languages: form.languages,
  // The end rule texts and score category labels stay on the server: only the screen chosen on
  // submit is sent.
  translations: stripOutcomeTranslations(form.translations) as Prisma.JsonValue | null,
  logoAssetId: form.logoAssetId,
  theme: normalizeTheme(form.theme),
});

// The form a respondent can fill in. Throws a 410 for a form that has closed.
export const getFormByShareId = async (shareId: string): Promise<PublicFormDto> => {
  const form = await loadPublishedForm(shareId);

  assertFormOpen(form);

  return toPublicFormDto(form);
};

// What the public GET returns. A closed form answers with its closing reason instead of an error,
// so the respondent sees a proper "survey closed" page (with the author's branding), not a 404.
export const getPublicForm = async (
  shareId: string,
): Promise<PublicFormDto | ClosedPublicFormDto> => {
  const form = await loadPublishedForm(shareId);
  const closedReason = getClosedReason(form);

  return closedReason ? toClosedFormDto(form, closedReason) : toPublicFormDto(form);
};

export const updateForm = async (formId: string, userId: string, data: UpdateFormInput) => {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: { questions: true },
  });

  if (!form) throw new AppError(ErrorCode.FORM_NOT_FOUND, 404);
  if (form.userId !== userId) throw new AppError(ErrorCode.FORM_FORBIDDEN, 403);

  if (data.logoAssetId) {
    await assertFormAsset(data.logoAssetId, formId, "LOGO");
  }

  // Option pictures must be images of this form, not someone else's.
  await assertFormAssets(collectOptionImageIds(data.questions), formId, "OPTION_IMAGE");

  const existingQuestions = form.questions;
  const incomingQuestions = data.questions;

  // Languages: anything not sent stays as it was. The main language cannot also be an
  // additional one (its text is the form's own fields, not a translation).
  const defaultLanguage = data.defaultLanguage ?? form.defaultLanguage;
  const languages = data.languages ?? form.languages;

  if (languages.includes(defaultLanguage)) {
    throw new AppError(ErrorCode.REQUEST_BODY_INVALID, 400);
  }

  // End rules as they will be after this save: the ones sent, or the stored ones when none were
  // sent. They are checked against the questions below, so deleting a question that a stored rule
  // still looks at is refused as well.
  const endRules = normalizeEndRules(data.endRules !== undefined ? data.endRules : form.endRules);

  // The same for scoring: the settings as they will be after this save. An end rule may look at the
  // score only while scoring is on, so switching it off while a rule needs it is refused below.
  const scoring = normalizeScoring(data.scoring !== undefined ? data.scoring : form.scoring);

  // Normalize the stored ones too (when the client sent none): the language list may have shrunk.
  // Texts of rules that no longer exist are dropped with them.
  const formTranslations = normalizeFormTranslations(
    data.translations !== undefined ? data.translations : form.translations,
    languages,
    (endRules ?? []).map((rule) => rule.id),
    (scoring?.categories ?? []).map((category) => category.id),
  );
  const previousQuestionById = new Map(existingQuestions.map((q) => [q.id, q]));

  // Question translations before saving. If the client did not send `translations` (an old
  // client) we take the stored ones and normalize them anyway, because options or languages
  // may have changed in this same request.
  const translationsFor = (q: ResolvedQuestion) =>
    normalizeQuestionTranslations(
      // undefined (field not sent) -> stored; null (explicit clear) and an object -> as is.
      q.translations !== undefined ? q.translations : previousQuestionById.get(q.id)?.translations,
      languages,
      {
        options: "options" in q ? q.options : null,
        config: "config" in q ? (q.config as { rows?: { id: string }[] } | null) : null,
      },
    );

  const existingIds = new Set(existingQuestions.map((q) => q.id));

  // Questions without a client id get one here, before the graph validation, so other
  // questions' conditions can reference them and the id we validated is the one actually
  // written to the DB.
  const withResolvedIds: ResolvedQuestion[] = incomingQuestions.map((q) => ({
    ...q,
    id: q.id ?? crypto.randomUUID(),
  }));

  // A client may send its own id for a NEW question (so other questions' conditions can
  // reference it). If that id already exists in the DB (in another form), the insert would
  // fail with a unique error (500) and also confirm that someone else's id exists, so we
  // return a controlled 409.
  const clientNewIds = incomingQuestions.flatMap((q) =>
    q.id && !existingIds.has(q.id) ? [q.id] : [],
  );

  if (clientNewIds.length > 0) {
    const taken = await prisma.question.count({ where: { id: { in: clientNewIds } } });

    if (taken > 0) {
      throw new AppError(ErrorCode.FORM_QUESTION_ID_CONFLICT, 409);
    }
  }

  const graphValidation = validateConditionGraph(
    withResolvedIds.map((q) => ({ id: q.id, order: q.order, condition: q.condition })),
  );

  if (!graphValidation.valid) {
    // errors is a structured { questionId, reason, detail } array from condition-engine; the
    // frontend translation is built from `reason` (a stable code), not from the Ukrainian `detail`.
    throw new AppError(ErrorCode.FORM_INVALID_CONDITIONS, 400, graphValidation.errors);
  }

  assertEndRulesValid(
    endRules,
    withResolvedIds.map((q) => ({ id: q.id, type: q.type })),
    scoring?.enabled === true,
  );

  // Same for the quotas of the form: a question that a quota still looks at cannot be deleted.
  assertQuotasValid(
    await prisma.formQuota.findMany({ where: { formId }, select: { id: true, condition: true } }),
    withResolvedIds.map((q) => ({ id: q.id, type: q.type })),
  );

  const incomingIds = new Set(withResolvedIds.map((q) => q.id));
  const toDelete = existingQuestions.filter((q) => !incomingIds.has(q.id)).map((q) => q.id);

  // The version the client edited (or, if none was sent, the one read above). Everything
  // read and validated above holds only for this version, so the check and the increment
  // are the FIRST action of the transaction.
  const expectedVersion = data.version ?? form.version;

  return prisma.$transaction(async (tx) => {
    // The conditional UPDATE ... WHERE version = N is atomic: the row is locked until the
    // transaction ends, and a concurrent request with the same N sees N+1 after our commit,
    // finds no row (count = 0) and gets 409. All question changes below therefore apply only
    // to the state we read.
    const { count } = await tx.form.updateMany({
      where: { id: formId, version: expectedVersion },
      data: {
        title: data.title,
        description: data.description,
        responseMode: data.responseMode,
        defaultLanguage: data.defaultLanguage,
        languages: data.languages,
        translations: toNullableJson(formTranslations),
        // undefined leaves the logo as is; null removes it.
        logoAssetId: data.logoAssetId,
        // undefined leaves the theme as is; null removes it.
        closesAt:
          data.closesAt === undefined ? undefined : data.closesAt && new Date(data.closesAt),
        maxResponses: data.maxResponses,
        theme: toNullableJson(data.theme === undefined ? undefined : normalizeTheme(data.theme)),
        welcomeScreen: toNullableJson(
          data.welcomeScreen === undefined ? undefined : normalizeWelcomeScreen(data.welcomeScreen),
        ),
        endScreen: toNullableJson(
          data.endScreen === undefined ? undefined : normalizeEndScreen(data.endScreen),
        ),
        endRules: toNullableJson(data.endRules === undefined ? undefined : endRules),
        scoring: toNullableJson(data.scoring === undefined ? undefined : scoring),
        updatedAt: new Date(),
        version: { increment: 1 },
      },
    });

    if (count === 0) {
      throw new AppError(ErrorCode.FORM_VERSION_CONFLICT, 409);
    }

    if (toDelete.length) {
      await tx.question.deleteMany({
        where: { id: { in: toDelete } },
      });
    }

    const resolvedToUpdate = withResolvedIds.filter((q) => existingIds.has(q.id));
    const resolvedToCreate = withResolvedIds.filter((q) => !existingIds.has(q.id));

    for (const q of resolvedToUpdate) {
      await tx.question.update({
        where: { id: q.id },
        data: {
          text: q.text,
          description: q.description,
          type: q.type,
          required: q.required ?? false,
          order: q.order,
          options: "options" in q ? toJson(q.options) : undefined,
          config: "config" in q ? toNullableJson(q.config) : undefined,
          condition: toNullableJson(q.condition),
          translations: toNullableJson(translationsFor(q)),
        },
      });
    }

    if (resolvedToCreate.length) {
      await tx.question.createMany({
        data: resolvedToCreate.map((q) => ({
          id: q.id,
          text: q.text,
          description: q.description,
          type: q.type,
          required: q.required ?? false,
          order: q.order,
          options: "options" in q ? toJson(q.options) : undefined,
          config: "config" in q ? toJson(q.config) : undefined,
          condition: q.condition == null ? undefined : toJson(q.condition),
          translations: translationsFor(q) == null ? undefined : toJson(translationsFor(q)),
          formId,
        })),
      });
    }

    return { success: true, version: expectedVersion + 1 };
  });
};

export const publishForm = async (formId: string, userId: string) => {
  const form = await prisma.form.findUnique({
    where: { id: formId },
  });

  if (!form) throw new AppError(ErrorCode.FORM_NOT_FOUND, 404);
  if (form.userId !== userId) throw new AppError(ErrorCode.FORM_FORBIDDEN, 403);

  return prisma.form.update({
    where: { id: formId },
    data: { isPublished: true },
  });
};

export const unpublishForm = async (formId: string, userId: string) => {
  const form = await prisma.form.findUnique({
    where: { id: formId },
  });

  if (!form) throw new AppError(ErrorCode.FORM_NOT_FOUND, 404);
  if (form.userId !== userId) throw new AppError(ErrorCode.FORM_FORBIDDEN, 403);

  return prisma.form.update({
    where: { id: formId },
    data: { isPublished: false },
  });
};

// Ids of the pictures referenced by the options of IMAGE_CHOICE questions.
const collectOptionImageIds = (questions: { type: string; options?: unknown }[]): string[] =>
  questions
    .filter((q) => q.type === "IMAGE_CHOICE" && Array.isArray(q.options))
    .flatMap((q) => q.options as { imageAssetId?: string | null }[])
    .flatMap((option) => (option.imageAssetId ? [option.imageAssetId] : []));

export const duplicateForm = async (formId: string, userId: string) => {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: { questions: true, quotas: true },
  });

  if (!form) throw new AppError(ErrorCode.FORM_NOT_FOUND, 404);
  if (form.userId !== userId) throw new AppError(ErrorCode.FORM_FORBIDDEN, 403);

  // The copy gets its own copies of the logo and the option pictures (files included), so the two
  // forms can be deleted independently.
  const usedAssetIds = [
    ...(form.logoAssetId ? [form.logoAssetId] : []),
    ...collectOptionImageIds(form.questions),
  ];
  const sourceAssets = await prisma.asset.findMany({ where: { id: { in: usedAssetIds } } });
  const assetCopies = await copyAssetFiles(sourceAssets);

  // Copied questions get new ids (the old ones belong to the original); conditions, in questions and
  // in end rules, must be remapped to them, or the copy would point at the original's questions.
  const idMap = new Map(form.questions.map((q) => [q.id, crypto.randomUUID()]));
  const sourceEndRules = normalizeEndRules(form.endRules);

  return prisma.$transaction(async (tx) => {
    const newForm = await tx.form.create({
      data: {
        title: form.title + " (Copy)",
        description: form.description,
        responseMode: form.responseMode,
        defaultLanguage: form.defaultLanguage,
        languages: form.languages,
        translations: form.translations == null ? undefined : toJson(form.translations),
        theme: form.theme == null ? undefined : toJson(form.theme),
        welcomeScreen: form.welcomeScreen == null ? undefined : toJson(form.welcomeScreen),
        endScreen: form.endScreen == null ? undefined : toJson(form.endScreen),
        // Scoring: the points of the options and answers are in the copied questions, the categories
        // here (their ids only have to be unique within a form).
        scoring: form.scoring == null ? undefined : toJson(form.scoring),
        // Rule ids stay the same (they only have to be unique within a form), so the translated
        // texts copied above keep matching.
        endRules: sourceEndRules
          ? toJson(
              sourceEndRules.map((rule) => ({
                ...rule,
                condition: {
                  ...rule.condition,
                  rules: rule.condition.rules.map((r) => ({
                    ...r,
                    questionId: idMap.get(r.questionId) ?? r.questionId,
                  })),
                },
              })),
            )
          : undefined,
        userId,
        isPublished: false,
      },
    });

    if (assetCopies.size > 0) {
      await tx.asset.createMany({
        data: [...assetCopies.values()].map((copy) => ({
          id: copy.id,
          formId: newForm.id,
          kind: copy.source.kind,
          mime: copy.source.mime,
          size: copy.source.size,
          width: copy.source.width,
          height: copy.source.height,
          storageKey: copy.storageKey,
        })),
      });

      const logoCopy = form.logoAssetId ? assetCopies.get(form.logoAssetId) : undefined;

      if (logoCopy) {
        await tx.form.update({ where: { id: newForm.id }, data: { logoAssetId: logoCopy.id } });
      }
    }

    // Option pictures point at the copied assets (or lose the picture if its file was missing).
    const remapOptions = (type: string, options: unknown): Prisma.InputJsonValue => {
      if (!Array.isArray(options)) return [];
      if (type !== "IMAGE_CHOICE") return options as Prisma.InputJsonValue;

      return options.map((option: { imageAssetId?: string | null }) => ({
        ...option,
        imageAssetId: option.imageAssetId
          ? (assetCopies.get(option.imageAssetId)?.id ?? null)
          : null,
      })) as Prisma.InputJsonValue;
    };

    const remapCondition = (condition: unknown): Prisma.InputJsonValue | undefined => {
      if (!condition || typeof condition !== "object") return undefined;
      const c = condition as {
        logic: "AND" | "OR";
        rules: { questionId: string; operator: string; value: unknown }[];
      };
      return {
        logic: c.logic,
        rules: c.rules.map((r) => ({ ...r, questionId: idMap.get(r.questionId) ?? r.questionId })),
      } as Prisma.InputJsonValue;
    };

    await tx.question.createMany({
      data: form.questions.map((q) => ({
        id: idMap.get(q.id),
        text: q.text,
        description: q.description,
        type: q.type,
        required: q.required,
        order: q.order,
        options: remapOptions(q.type, q.options),
        config: q.config as Prisma.InputJsonValue,
        condition: remapCondition(q.condition),
        // Translations are keyed by option/row ids inside the question, which do not change when
        // copying, so they are carried over as is.
        translations: q.translations == null ? undefined : toJson(q.translations),
        formId: newForm.id,
      })),
    });

    // Quotas are limits on this form's responses, and the copy has none yet: they come along with
    // an empty count, pointing at the copied questions. (A quota with a damaged condition is not
    // worth copying; it could never match.)
    const quotaCopies = form.quotas.flatMap((quota) => {
      const condition = remapCondition(quota.condition);

      return condition
        ? [
            {
              formId: newForm.id,
              name: quota.name,
              condition,
              limit: quota.limit,
              count: 0,
              message: quota.message,
            },
          ]
        : [];
    });

    if (quotaCopies.length > 0) await tx.formQuota.createMany({ data: quotaCopies });

    return newForm;
  });
};
