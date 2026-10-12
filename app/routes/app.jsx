import { Outlet, useLoaderData, useRouteError, useNavigation, useFetchers } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import LoadingScreen from "../components/LoadingScreen";
import { LoadingProvider } from "../components/LoadingContext";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: session.shop,
  };
};

export function HydrateFallback() {
  return <LoadingScreen />;
}

export default function App() {
  const { apiKey } = useLoaderData();
  const navigation = useNavigation();
  const fetchers = useFetchers();

  const isNavigating =
    navigation.state === "loading" ||
    navigation.state === "submitting" ||
    fetchers.some((f) => f.state === "loading" || f.state === "submitting");

  return (
    <AppProvider embedded apiKey={apiKey}>
      {/* Shopify App Bridge nav menu rendered in the Shopify Admin sidebar */}
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/settings">Settings</s-link>
      </s-app-nav>
      <LoadingProvider>
        <main className="min-h-screen bg-white text-slate-900 relative">
          {isNavigating && <LoadingScreen />}
          <Outlet />
        </main>
      </LoadingProvider>
    </AppProvider>
  );
}

// Catch thrown responses and headers as required by Shopify App Bridge
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
