export type PublicationStatus = "draft" | "published" | "unpublished";

/**
 * The model stores one flag (isPublished), so "draft" and "unpublished" are told apart by what
 * the form has already done: a form that is not published but has responses was published once
 * (responses only come through the public link), so it is "unpublished". A form that was
 * published and unpublished again before its first response is indistinguishable from a draft;
 * adding a publishedAt column for that edge case was not worth a schema change.
 */
export const getPublicationStatus = (form: {
  isPublished?: boolean;
  responseCount?: number;
}): PublicationStatus =>
  form.isPublished ? "published" : (form.responseCount ?? 0) > 0 ? "unpublished" : "draft";

// The link respondents open. `lang` picks a form language (the public page reads ?lang=).
export const publicFormUrl = (shareId: string, lang?: string): string => {
  const base = `${window.location.origin}/public/forms/${shareId}`;
  return lang ? `${base}?lang=${encodeURIComponent(lang)}` : base;
};
