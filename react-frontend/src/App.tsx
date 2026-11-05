import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { Suspense } from "react";
import { router } from "./routes";
import { useAuthExpiredListener } from "./store/useAuthExpiredListener";
import RouteLoadingFallback from "./components/ui/RouteLoadingFallback";
import { ToastProvider } from "./components/ui/Toast";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  useAuthExpiredListener();

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Suspense fallback={<RouteLoadingFallback />}>
          <RouterProvider router={router} />
        </Suspense>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
