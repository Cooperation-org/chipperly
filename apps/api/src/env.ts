import { z } from 'zod';

/**
 * process.env -> validated Env. Names and defaults per docs/CONTRACTS.md
 * "Environment variables". Loaded once at import time; every other module
 * reads `env`, never `process.env` directly.
 */
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_OWNER: z.string().min(1).optional(),
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().min(1).default('127.0.0.1'),
  JWT_SECRET: z.string().min(32),
  WEB_DIR: z.string().min(1).optional(),
  BASE_PATH: z.string().default(''),
  CORS_ORIGIN: z.string().min(1).optional(),
  UPLOAD_DIR: z.string().min(1).default('./uploads'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  S3_ENDPOINT: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  MEDIA_PUBLIC_BASE: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  APPLE_SIGNIN_CLIENT_ID: z.string().min(1).optional(),
  APPLE_SIGNIN_TEAM_ID: z.string().min(1).optional(),
  APPLE_SIGNIN_KEY_ID: z.string().min(1).optional(),
  APPLE_SIGNIN_PRIVATE_KEY: z.string().min(1).optional(),
  BETA_INVITE_CODE: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(1).default('Chipperly <no-reply@chipperlyapp.com>'),
  /** The Firebase service account key JSON, as a single-line string (a deploy sets this, not a file path). Unset = push logs to the console instead of sending. */
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().min(1).optional(),
  /** Web Push (VAPID) keys, from `npx web-push generate-vapid-keys`. Unset = browser push logs to the console. */
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z.string().min(1).default('mailto:hello@chipperlyapp.com'),
  APP_ORIGIN: z.string().min(1).optional(),
  LOG_LEVEL: z.string().min(1).default('info'),
});

// `.env.example` documents an unset var as `KEY=` (empty), which --env-file
// loads as an empty string, not undefined; treat empty the same as unset so
// every optional var above (`.min(1).optional()`) accepts it.
const envWithoutEmpty = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== ''),
);
const parsed = EnvSchema.parse(envWithoutEmpty);

export const env = {
  ...parsed,
  DATABASE_URL_OWNER: parsed.DATABASE_URL_OWNER ?? parsed.DATABASE_URL,
  /** True when /auth/google should be enabled instead of 404. */
  googleEnabled: Boolean(parsed.GOOGLE_OAUTH_CLIENT_ID),
  /** True when /auth/apple should be enabled instead of 404: all four Apple vars set. */
  appleEnabled: Boolean(
    parsed.APPLE_SIGNIN_CLIENT_ID &&
      parsed.APPLE_SIGNIN_TEAM_ID &&
      parsed.APPLE_SIGNIN_KEY_ID &&
      parsed.APPLE_SIGNIN_PRIVATE_KEY,
  ),
  /** True when Resend is configured; false = mail is logged to stdout. */
  mailEnabled: Boolean(parsed.RESEND_API_KEY),
  /** True when a Firebase service account is configured; false = push logs to stdout instead of sending. */
  pushEnabled: Boolean(parsed.FIREBASE_SERVICE_ACCOUNT_JSON),
  /** True when both VAPID keys are set, so browsers can subscribe to push. */
  webPushEnabled: Boolean(parsed.VAPID_PUBLIC_KEY && parsed.VAPID_PRIVATE_KEY),
  /** True when a closed beta invite code gates /auth/register and new-user /auth/google, /auth/apple. */
  inviteCodeRequired: Boolean(parsed.BETA_INVITE_CODE),
};

export type Env = typeof env;
