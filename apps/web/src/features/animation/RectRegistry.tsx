import React, { createContext, useContext, useRef, useCallback } from "react";

type RectRegistryContextType = {
  register: (id: string, element: HTMLElement | null) => void;
  unregister: (id: string) => void;
  getRect: (id: string) => DOMRect | null;
};

const RectRegistryContext = createContext<RectRegistryContextType | null>(null);

export function RectRegistryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const elements = useRef<Map<string, HTMLElement>>(new Map());
  const lastKnownRects = useRef<Map<string, DOMRect>>(new Map());

  const register = useCallback((id: string, element: HTMLElement | null) => {
    if (element) {
      elements.current.set(id, element);
      // Cache initial rect
      lastKnownRects.current.set(id, element.getBoundingClientRect());

      // Optional: Observer to update rect if it moves?
      // For now, assuming static placement until unmount is enough for simple lists.
    } else {
      // Before removing, try to update last rect if element is still valid?
      const el = elements.current.get(id);
      if (el) {
        try {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            lastKnownRects.current.set(id, rect);
          }
        } catch (e) {
          /* ignore */
        }
      }
      elements.current.delete(id);
    }
  }, []);

  const getRect = useCallback((id: string) => {
    const el = elements.current.get(id);
    if (el) {
      const rect = el.getBoundingClientRect();
      lastKnownRects.current.set(id, rect);
      return rect;
    }
    return lastKnownRects.current.get(id) || null;
  }, []);

  const unregister = useCallback(
    (id: string) => {
      register(id, null);
    },
    [register],
  );

  return (
    <RectRegistryContext.Provider value={{ register, unregister, getRect }}>
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
