import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchPublicForm, submitFormResponses } from "../../../api/publicFormApi";
import type { FormAnswers } from "../../../types/formViewer";

export function usePublicFormQuery(shareId?: string) {
  return useQuery({
    queryKey: ["publicForm", shareId],
    queryFn: () => fetchPublicForm(shareId!),
    enabled: !!shareId,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}

export function useSubmitResponsesMutation() {
  return useMutation({
    mutationFn: ({
      shareId,
      answers,
      sessionKey,
      language,
    }: {
      shareId: string;
      answers: FormAnswers;
      sessionKey?: string;
      /** Мова, якою респондент бачив багатомовну форму (для одномовних - не передається). */
      language?: string;
    }) => submitFormResponses(shareId, answers, sessionKey, language),
  });
}
