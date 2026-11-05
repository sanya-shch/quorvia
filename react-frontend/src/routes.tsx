import { createBrowserRouter, Navigate } from "react-router-dom";
import { lazy } from "react";
import ProtectedRoute from "./components/ProtectedRoute";

const loadLogin = () => import("./pages/auth/Login");
const loadRegister = () => import("./pages/auth/Register");
const loadDashboard = () => import("./pages/dashboard/Dashboard");
const loadFormBuilder = () => import("./pages/builder/FormBuilder");
const loadPublicFormPage = () => import("./pages/viewer/PublicFormPage");
const loadFormAnalyticsPage = () => import("./pages/analytics/FormAnalyticsPage");
const loadQuestionDetailsPage = () => import("./pages/analytics/components/QuestionDetailsPage");

const Login = lazy(loadLogin);
const Register = lazy(loadRegister);
const Dashboard = lazy(loadDashboard);
const FormBuilder = lazy(loadFormBuilder);
const PublicFormPage = lazy(loadPublicFormPage);
const FormAnalyticsPage = lazy(loadFormAnalyticsPage);
const QuestionDetailsPage = lazy(loadQuestionDetailsPage);

// Protected pages are only rendered after session restore and /auth/me, so
// their chunks would otherwise start downloading at the end of that chain.
// Order matters: the more specific analytics path goes first.
const preloaders: Array<[RegExp, () => Promise<unknown>]> = [
  [/^\/login\/?$/, loadLogin],
  [/^\/register\/?$/, loadRegister],
  [/^\/public\/forms\//, loadPublicFormPage],
  [/^\/dashboard\/?$/, loadDashboard],
  [/^\/builder\//, loadFormBuilder],
  [/^\/analytics\/[^/]+\/questions\//, loadQuestionDetailsPage],
  [/^\/analytics\//, loadFormAnalyticsPage],
];

export const preloadRouteChunk = (pathname: string): void => {
  const match = preloaders.find(([pattern]) => pattern.test(pathname));

  // A failed preload is harmless: lazy() retries the import on render.
  void match?.[1]().catch(() => undefined);
};

export const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/register", element: <Register /> },
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
    path: "/builder/:formId",
    element: (
      <ProtectedRoute>
        <FormBuilder />
      </ProtectedRoute>
    ),
  },
  {
    path: "/analytics/:formId",
    element: (
      <ProtectedRoute>
        <FormAnalyticsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/analytics/:formId/questions/:questionId",
    element: (
      <ProtectedRoute>
        <QuestionDetailsPage />
      </ProtectedRoute>
    ),
  },
  { path: "*", element: <Navigate to="/dashboard" replace /> },
]);
