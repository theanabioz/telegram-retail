import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_ORIGIN: z
    .string()
    .default("http://localhost:5173,http://127.0.0.1:5173")
    .transform((value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  BOT_TOKEN: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("7d"),
  DEV_AUTH_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
});

export const env = envSchema.parse(process.env);
