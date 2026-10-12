import React, { createContext, useContext, useState, useMemo } from "react";
import LoadingScreen from "./LoadingScreen";

const LoadingContext = createContext({
  isLoading: false,
  showLoading: (message) => {},
  hideLoading: () => {},
});

export function LoadingProvider({ children }) {
  const [loadingState, setLoadingState] = useState({
    isLoading: false,
    message: undefined,
  });

  const value = useMemo(
    () => ({
      isLoading: loadingState.isLoading,
      showLoading: (message) =>
        setLoadingState({
          isLoading: true,
          message: message || "Your cart is ready to bring in more AOV",
        }),
      hideLoading: () =>
        setLoadingState({ isLoading: false, message: undefined }),
    }),
    [loadingState.isLoading],
  );

  return (
    <LoadingContext.Provider value={value}>
      {loadingState.isLoading && <LoadingScreen message={loadingState.message} />}
      {children}
    </LoadingContext.Provider>
  );
}

export function useLoadingScreen() {
  return useContext(LoadingContext);
}
