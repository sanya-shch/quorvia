import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formsApi } from "../../api/forms";
import { getApiErrorCode } from "../../i18n/errorCodes";
import { useToast } from "../../components/ui/Toast";

// The list-level actions (create, delete, publish/unpublish, duplicate), shared by the dashboard
// and "My forms". Same API calls as before; a failure is reported instead of silently ignored.
export function useFormsActions() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["forms"] });
  const fail = (error: unknown) => {
    const code = getApiErrorCode(error);
    toast.error(code ? t(`errors.${code}`) : t("workspace.actions.failed"));
  };

  return {
    create: useMutation({
      mutationFn: () => formsApi.create(t("dashboard.newFormTitle")),
      onSuccess: (form) => {
        refresh();
        // A new form opens in the builder: there is nothing to look at on its overview yet.
        navigate(`/forms/${form.id}/builder`);
      },
      onError: fail,
    }),
    remove: useMutation({ mutationFn: formsApi.delete, onSuccess: refresh, onError: fail }),
    togglePublish: useMutation({
      mutationFn: ({ id, isPublished }: { id: string; isPublished: boolean }) =>
        isPublished ? formsApi.unpublish(id) : formsApi.publish(id),
      onSuccess: refresh,
      onError: fail,
    }),
    duplicate: useMutation({ mutationFn: formsApi.duplicate, onSuccess: refresh, onError: fail }),
  };
}
