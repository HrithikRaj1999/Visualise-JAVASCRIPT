import React from "react";

type FontSizeState = Record<string, number>; // boxId -> scale (0.8, 1, 1.2, 1.5)

const FontSizeContext = React.createContext<{
  sizes: FontSizeState;
  setSize: (boxId: string, size: number) => void;
}>({ sizes: {}, setSize: () => {} });

export function FontSizeProvider({ children }: { children: React.ReactNode }) {
  const [sizes, setSizes] = React.useState<FontSizeState>({});
  const setSize = (boxId: string, size: number) => {
    setSizes((prev) => ({ ...prev, [boxId]: size }));
  };
  return (
    <FontSizeContext.Provider value={{ sizes, setSize }}>
      {children}
    </FontSizeContext.Provider>
  );
}

export function useFontSize(boxId: string) {
  const { sizes, setSize } = React.useContext(FontSizeContext);
  return {
    scale: sizes[boxId] || 1,
    setSize: (size: number) => setSize(boxId, size),
  };
}
