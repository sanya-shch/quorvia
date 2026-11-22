import { lazy } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { useWorkspace } from "./workspaceContext";

// Each workspace section as a route element. They read the form id from the URL, so the same
// element works under /forms/:formId/* without the router having to pass props.
// The Vue analytics host is loaded on demand: it pulls in the federated remote.
const VueAnalyticsHost = lazy(() => import("../analytics/components/VueAnalyticsHost"));
const OverviewPage = lazy(() => import("./overview/OverviewPage"));
const SettingsPage = lazy(() => import("./settings/SettingsPage"));
const BuilderPage = lazy(() => import("../builder/BuilderPage"));
export const QuestionDetailsRoute = lazy(
  () => import("../analytics/components/QuestionDetailsPage"),
);

const useFormId = () => useParams<{ formId: string }>().formId ?? "";

export const OverviewRoute = () => <OverviewPage formId={useFormId()} />;
export const SettingsRoute = () => <SettingsPage formId={useFormId()} />;
export const BuilderRoute = () => <BuilderPage />;

// The Vue analytics app sits in the workspace without its own title and tabs (the workspace has
// them). It is remounted when the section changes, so each section starts on its own tab.
export const AnalyticsRoute = () => {
  const formId = useFormId();
  useWorkspace();
  return <VueAnalyticsHost key="analytics" formId={formId} embedded initialTab="overview" />;
};

export const ResponsesRoute = () => {
  const formId = useFormId();
  const [params] = useSearchParams();
  return (
    <VueAnalyticsHost
      key={`responses-${params.get("response") ?? ""}`}
      formId={formId}
      embedded
      initialTab="responses"
      initialResponseId={params.get("response") ?? undefined}
    />
  );
};

// The old bookmarks: /builder/:id and /analytics/:id go to the new place.
export const LegacyRedirect = ({ section }: { section: "builder" | "analytics" }) => {
  const { formId, questionId } = useParams<{ formId: string; questionId?: string }>();
  const target = `/forms/${formId}/${section}${questionId ? `/questions/${questionId}` : ""}`;
  return <Navigate to={target} replace />;
};
