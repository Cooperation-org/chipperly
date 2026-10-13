import { bigint, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';

/** Every email the app sent or tried to send (lib/mailer.ts), for the admin site's per-person log. Migration 0060. */
export const email_log = pgTable(
  'email_log',
  {
    id: uuid('id').primaryKey(),
    at: bigint('at', { mode: 'number' }).notNull(),
    to_email: text('to_email').notNull(),
    subject: text('subject').notNull(),
    /** sent | failed | logged (no provider on this server) */
    result: text('result').notNull(),
    /** Resend's id, to read delivered/bounced later. */
    provider_id: text('provider_id'),
  },
  (t) => [index('email_log_to_idx').on(t.to_email, t.at)],
);

/** Uncaught errors browsers reported (routes/clientErrors.ts). Nothing about who. Kept 30 days. */
export const client_errors = pgTable(
  'client_errors',
  {
    id: uuid('id').primaryKey(),
    at: bigint('at', { mode: 'number' }).notNull(),
    message: text('message').notNull(),
    stack: text('stack'),
    path: text('path').notNull(),
    commit: text('commit'),
    user_agent: text('user_agent'),
  },
  (t) => [index('client_errors_at_idx').on(t.at)],
);
