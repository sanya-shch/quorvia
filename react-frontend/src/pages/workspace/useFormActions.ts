import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formsApi } from "../../api/forms";
import { getApiErrorCode } from "../../i18n/errorCodes";
import { useToast } from "../../components/ui/Toast";

// Publish, unpublish, duplicate and delete of the current form. The same API calls as the
// dashboard uses; nothing here is simulated, a failure shows the server's own error code.
export function useFormActions(formId: string) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["forms"] });
    queryClient.invalidateQueries({ queryKey: ["formAdmin", formId] });
  };

  const fail = (error: unknown) => {
    const code = getApiErrorCode(error);
    toast.error(code ? t(`errors.${code}`) : t("workspace.actions.failed"));
  };

  const publish = useMutation({
    mutationFn: () => formsApi.publish(formId),
    onSuccess: () => {
      refresh();
      toast.success(t("workspace.actions.published"));
    },
    onError: fail,
  });

  const unpublish = useMutation({
    mutationFn: () => formsApi.unpublish(formId),
    onSuccess: () => {
      refresh();
      toast.success(t("workspace.actions.unpublished"));
    },
    onError: fail,
  });

  const duplicate = useMutation({
    mutationFn: () => formsApi.duplicate(formId),
    onSuccess: (copy) => {
      queryClient.invalidateQueries({ queryKey: ["forms"] });
      toast.success(t("workspace.actions.duplicated"));
      navigate(`/forms/${copy.id}/overview`);
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: () => formsApi.delete(formId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forms"] });
      queryClient.removeQueries({ queryKey: ["formAdmin", formId] });
      toast.success(t("workspace.actions.deleted"));
      navigate("/forms", { replace: true });
    },
    onError: fail,
  });

  return { publish, unpublish, duplicate, remove };
}
