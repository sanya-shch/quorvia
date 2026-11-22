import { Suspense } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, Navigate, RouterProvider } from "react-router-dom";
import { ToastProvider } from "../../components/ui/Toast";
import FormWorkspaceLayout from "./FormWorkspaceLayout";
import { BuilderRoute, OverviewRoute, SettingsRoute } from "./routeElements";

// Renders the real form workspace (layout, draft, the section) at a URL, in a memory router, for
// tests. Only the sections that tests need are mounted; the layout is the production one.
export const renderWorkspace = (path = "/forms/form-1/settings") => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: "/forms/:formId",
        element: <FormWorkspaceLayout />,
        children: [
          { index: true, element: <Navigate to="overview" replace /> },
          { path: "overview", element: <OverviewRoute /> },
          { path: "builder", element: <BuilderRoute /> },
          { path: "settings", element: <SettingsRoute /> },
        ],
      },
      { path: "/dashboard", element: <p>dashboard</p> },
      { path: "/forms", element: <p>forms</p> },
    ],
    { initialEntries: [path] },
  );

  const result = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Suspense fallback={null}>
          <RouterProvider router={router} />
        </Suspense>
      </ToastProvider>
    </QueryClientProvider>,
  );

  return { ...result, router, queryClient };
};
