import "server-only";
import { z } from "zod";

const telegramGroupChatId = z.preprocess(
  (value) => value === "" || value === undefined ? undefined : value,
  z.coerce.number().int().negative().optional()
);

const secretAlias = (primary: string, fallback: string) => (input: Record<string, unknown>) =>
  input[primary] ?? input[fallback];

const serverInputSchema = z
  .object({
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    TELEGRAM_BOT_TOKEN: z.string().min(20),
    TELEGRAM_WEBHOOK_SECRET: z
      .string()
      .min(16)
      .regex(/^[A-Za-z0-9_-]+$/, "TELEGRAM_WEBHOOK_SECRET solo puede contener A-Z, a-z, 0-9, _ y -"),
    TELEGRAM_GROUP_CHAT_ID: telegramGroupChatId,
    ADMIN_PASSWORD: z.string().min(8),
    SESSION_SECRET: z.string().min(32),
    CRON_SECRET: z.string().min(16),
    TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: z.coerce.number().int().min(60).max(3 * 60 * 60).optional(),
  })
  .passthrough();

const serverSchema = z.preprocess((value) => {
  const input = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    ...input,
    ADMIN_PASSWORD: secretAlias("ADMIN_PASSWORD", "ADMIN_DASHBOARD_PASSWORD")(input),
    SESSION_SECRET: secretAlias("SESSION_SECRET", "ADMIN_SESSION_SECRET")(input),
  };
}, serverInputSchema);

const supabaseAdminSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
});

const telegramSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(20),
  TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: z.coerce.number().int().min(60).max(3 * 60 * 60).optional(),
});

const webhookSchema = telegramSchema.merge(supabaseAdminSchema).extend({
  TELEGRAM_GROUP_CHAT_ID: telegramGroupChatId,
  TELEGRAM_WEBHOOK_SECRET: serverInputSchema.shape.TELEGRAM_WEBHOOK_SECRET,
  ADMIN_PASSWORD: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
});

const webhookEnvSchema = z.preprocess((value) => {
  const input = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    ...input,
    ADMIN_PASSWORD: secretAlias("ADMIN_PASSWORD", "ADMIN_DASHBOARD_PASSWORD")(input),
    SESSION_SECRET: secretAlias("SESSION_SECRET", "ADMIN_SESSION_SECRET")(input),
  };
}, webhookSchema);

export const serverEnvSchema = serverSchema;

export type ServerEnv = z.infer<typeof serverInputSchema>;
export type SupabaseAdminEnv = z.infer<typeof supabaseAdminSchema>;
export type TelegramEnv = z.infer<typeof telegramSchema>;
export type WebhookEnv = z.infer<typeof webhookSchema>;

let supabaseAdminCache: SupabaseAdminEnv | null = null;
let telegramCache: TelegramEnv | null = null;
let serverCache: ServerEnv | null = null;
let webhookCache: WebhookEnv | null = null;

function format(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

function parseEnv<T>(schema: z.ZodType<T>, label: string): T {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid ${label} env: ${format(parsed.error)}`);
  }
  return parsed.data;
}

export function serverEnv(): ServerEnv {
  if (serverCache) return serverCache;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid server env: ${format(parsed.error)}`);
  }
  serverCache = parsed.data as ServerEnv;
  return serverCache;
}

export function supabaseAdminEnv(): SupabaseAdminEnv {
  if (supabaseAdminCache) return supabaseAdminCache;
  supabaseAdminCache = parseEnv(supabaseAdminSchema, "Supabase");
  return supabaseAdminCache;
}

export function telegramEnv(): TelegramEnv {
  if (telegramCache) return telegramCache;
  telegramCache = parseEnv(telegramSchema, "Telegram");
  return telegramCache;
}

export function webhookEnv(): WebhookEnv {
  if (webhookCache) return webhookCache;
  webhookCache = parseEnv(webhookEnvSchema, "webhook") as WebhookEnv;
  return webhookCache;
}

export function envValue(name: keyof ServerEnv) {
  return serverEnv()[name];
}
