export const logger = {
  info: (msg: string, meta?: unknown) =>
    console.log(`[INFO] ${msg}`, meta ? JSON.stringify(meta) : ""),
  error: (msg: string, error?: unknown) =>
    console.error(`[ERROR] ${msg}`, error),
  warn: (msg: string, meta?: unknown) =>
    console.warn(`[WARN] ${msg}`, meta ? JSON.stringify(meta) : ""),
};
