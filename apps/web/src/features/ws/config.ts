export function resolveWsUrl(explicit?: string): string {
  if (explicit && explicit.trim().length > 0) {
    return explicit.trim();
  }

  const env = (
    import.meta as ImportMeta & {
      env: Record<string, string | undefined>;
    }
  ).env;
  const configured = env.VITE_SERVER_WS_URL;
  if (configured && configured.trim().length > 0) {
    return configured.trim();
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  if (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    return `${protocol}://localhost:8080`;
  }

  return `${protocol}://${window.location.host}`;
}
