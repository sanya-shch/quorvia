import { createBrowserRouter, Navigate } from "react-router-dom";
import { lazy } from "react";
import ProtectedRoute from "./components/ProtectedRoute";
import { IS_FOR_PORTFOLIO } from "./config/portfolio";
import {
  AnalyticsRoute,
  BuilderRoute,
  LegacyRedirect,
  OverviewRoute,
  QuestionDetailsRoute,
  ResponsesRoute,
  SettingsRoute,
} from "./pages/workspace/routeElements";

const loadLanding = () => import("./pages/landing/LandingPage");
const loadLogin = () => import("./pages/auth/Login");
const loadRegister = () => import("./pages/auth/Register");
const loadMyForms = () => import("./pages/forms/MyFormsPage");
const loadDashboard = () => import("./pages/dashboard/Dashboard");
const loadWorkspace = () => import("./pages/workspace/FormWorkspaceLayout");
const loadPublicFormPage = () => import("./pages/viewer/PublicFormPage");

const LandingPage = lazy(loadLanding);
const Login = lazy(loadLogin);
const Register = lazy(loadRegister);
const Dashboard = lazy(loadDashboard);
const MyFormsPage = lazy(loadMyForms);
const FormWorkspaceLayout = lazy(loadWorkspace);
const PublicFormPage = lazy(loadPublicFormPage);

// Protected pages are only rendered after session restore and /auth/me, so
// their chunks would otherwise start downloading at the end of that chain.
// Order matters: the more specific analytics path goes first.
const preloaders: Array<[RegExp, () => Promise<unknown>]> = [
  [/^\/$/, loadLanding],
  [/^\/login\/?$/, loadLogin],
  [/^\/register\/?$/, loadRegister],
  [/^\/public\/forms\//, loadPublicFormPage],
  [/^\/dashboard\/?$/, loadDashboard],
  [/^\/forms\/?$/, loadMyForms],
  [/^\/forms\/[^/]+/, loadWorkspace],
];

export const preloadRouteChunk = (pathname: string): void => {
  const match = preloaders.find(([pattern]) => pattern.test(pathname));

  // A failed preload is harmless: lazy() retries the import on render.
  void match?.[1]().catch(() => undefined);
};

export const router = createBrowserRouter([
  { path: "/", element: <LandingPage /> },
  // The portfolio demo has no registration or login: visitors start from the demo button on the
  // landing page, and a visitor who is not signed in is sent there.
  { path: "/login", element: IS_FOR_PORTFOLIO ? <Navigate to="/" replace /> : <Login /> },
  {
    path: "/register",
    element: IS_FOR_PORTFOLIO ? <Navigate to="/" replace /> : <Register />,
  },
  { path: "/public/forms/:shareId", element: <PublicFormPage /> },
  {
    path: "/dashboard",
    element: (
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    ),
  },
  {
    path: "/forms",
    element: (
      <ProtectedRoute>
        <MyFormsPage />
      </ProtectedRoute>
    ),
  },
  // The form workspace: one layout owns the form and its draft; the sections are its children.
  {
    path: "/forms/:formId",
    element: (
      <ProtectedRoute>
        <FormWorkspaceLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="overview" replace /> },
      { path: "overview", element: <OverviewRoute /> },
      { path: "builder", element: <BuilderRoute /> },
      { path: "responses", element: <ResponsesRoute /> },
      { path: "analytics", element: <AnalyticsRoute /> },
      { path: "analytics/questions/:questionId", element: <QuestionDetailsRoute /> },
      { path: "settings", element: <SettingsRoute /> },
    ],
  },
  // Links from before the workspace existed.
  { path: "/builder/:formId", element: <LegacyRedirect section="builder" /> },
  { path: "/analytics/:formId", element: <LegacyRedirect section="analytics" /> },
  {
    path: "/analytics/:formId/questions/:questionId",
    element: <LegacyRedirect section="analytics" />,
  },
  { path: "*", element: <Navigate to="/dashboard" replace /> },
]);
