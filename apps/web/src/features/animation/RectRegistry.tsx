import React, { createContext, useContext, useRef, useCallback } from "react";

type RectRegistryContextType = {
  register: (id: string, element: HTMLElement | null) => void;
  getRect: (id: string) => DOMRect | null;
};

const RectRegistryContext = createContext<RectRegistryContextType | null>(null);

export function RectRegistryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const elements = useRef<Map<string, HTMLElement>>(new Map());

  const register = useCallback((id: string, element: HTMLElement | null) => {
    if (element) {
      elements.current.set(id, element);
    } else {
      elements.current.delete(id);
    }
  }, []);

  const getRect = useCallback((id: string) => {
    const el = elements.current.get(id);
    return el ? el.getBoundingClientRect() : null;
  }, []);

  return (
    <RectRegistryContext.Provider value={{ register, getRect }}>
      {children}
    </RectRegistryContext.Provider>
  );
}

export function useRectRegistry() {
  const context = useContext(RectRegistryContext);
  if (!context) {
    throw new Error(
      "useRectRegistry must be used within a RectRegistryProvider",
    );
  }
  return context;
}

export function useRegisterRect(id: string) {
  const { register } = useRectRegistry();
  return useCallback(
    (el: HTMLElement | null) => {
      register(id, el);
    },
    [id, register],
  );
}
