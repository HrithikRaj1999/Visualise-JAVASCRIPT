import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.string().transform(Number).default("3000"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  MAX_CODE_SIZE: z.number().default(50000), // 50KB
  MAX_EVENTS: z.number().default(10000),
  EXEC_TIMEOUT_MS: z.number().default(5000),
});

export const env = EnvSchema.parse(process.env);
