import { z } from "zod";

export const ClientCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SUBSCRIBE") }),
  z.object({
    type: z.literal("RUN_CODE"),
    payload: z.object({
      code: z.string(),
      language: z.enum(["js", "ts"]).optional(),
      maxEvents: z.number().int().positive().optional(),
    }),
  }),
]);

export type ClientCommand = z.infer<typeof ClientCommandSchema>;

export function parseClientCommand(command: unknown): ClientCommand {
  return ClientCommandSchema.parse(command);
}
