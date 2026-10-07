import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { FeedbackBodySchema, FeedbackStatusBodySchema, type FeedbackItem, type FeedbackList } from '@chipperly/shared/schemas/feedback';
import { db } from '../db/client.js';
import { accounts, users } from '../db/schema/accounts.js';
import { feedback } from '../db/schema/feedback.js';
import { env } from '../env.js';
import { renderEmail, siteOrigin } from '../lib/emailTemplate.js';
import { sendMail } from '../lib/mailer.js';
import { requireUser } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { requireSuperAdmin } from './admin.js';

const KIND_LABEL = { bug: 'Something is broken', idea: 'An idea', question: 'A question', love: 'Something they love' } as const;

/**
 * Feedback from the beta, in the app. Open to guests too (a person trying the demo has opinions),
 * so it is capped and rate limited. Signed in, it also records who and what kind of account.
 * Stored for the admin inbox, and mailed to FEEDBACK_EMAIL_TO when that is set.
 */
export default async function feedbackRoutes(app: FastifyInstance): Promise<void> {
  app.post('/feedback', { bodyLimit: 16 * 1024, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = FeedbackBodySchema.parse(request.body);
    const userId = request.user?.id ?? null;
    const [user] = userId ? await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1) : [];
    const [account] = request.accountId ? await db.select({ kind: accounts.kind }).from(accounts).where(eq(accounts.id, request.accountId)).limit(1) : [];
    const contactEmail = body.contact_ok ? (user?.email ?? body.contact_email ?? null) : null;

    await db.insert(feedback).values({
      id: uuidv7(),
      created_at: Date.now(),
      user_id: userId,
      kind: body.kind,
      message: body.message,
      rating: body.rating ?? null,
      contact_ok: body.contact_ok,
      contact_email: contactEmail,
      page: body.page ?? null,
      app_version: body.app_version ?? null,
      user_agent: String(request.headers['user-agent'] ?? '').slice(0, 200) || null,
      account_kind: account?.kind ?? null,
      price_bargain: body.price_bargain ?? null,
      price_expensive: body.price_expensive ?? null,
      price_too_expensive: body.price_too_expensive ?? null,
    });

    const to = (env.FEEDBACK_EMAIL_TO ?? '').split(',').map((e) => e.trim()).filter(Boolean);
    if (to.length > 0) {
      const who = userId ? `${user?.email ?? 'A signed-in person'}${account ? ` (${account.kind} account)` : ''}` : 'A guest';
      const mail = renderEmail({
        heading: `New feedback: ${KIND_LABEL[body.kind]}`,
        paragraphs: [
          body.message,
          `${who}${body.rating ? `, rated it ${body.rating} of 5` : ''}${body.page ? `, from ${body.page}` : ''}.`,
          contactEmail ? `They said you may write back: ${contactEmail}` : 'They did not leave a way to write back.',
        ],
        action: { label: 'Open the feedback inbox', url: `${siteOrigin()}/settings/admin/feedback/` },
      });
      for (const address of to) await sendMail({ to: address, subject: `Chipperly feedback: ${KIND_LABEL[body.kind]}`, ...mail });
    }
    return reply.code(201).send({ ok: true });
  });

  const guard = { preHandler: [requireUser, requireSuperAdmin] };

  app.get('/admin/feedback', guard, async (): Promise<FeedbackList> => {
    const rows = await db.select().from(feedback).orderBy(desc(feedback.created_at)).limit(300);
    const items: FeedbackItem[] = rows.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      kind: r.kind,
      message: r.message,
      rating: r.rating,
      contact_email: r.contact_email,
      page: r.page,
      account_kind: r.account_kind,
      signed_in: r.user_id !== null,
      price_bargain: r.price_bargain,
      price_expensive: r.price_expensive,
      price_too_expensive: r.price_too_expensive,
      status: r.status,
    }));
    return { items };
  });

  app.patch('/admin/feedback/:id', guard, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { status } = FeedbackStatusBodySchema.parse(request.body);
    const updated = await db.update(feedback).set({ status }).where(eq(feedback.id, id)).returning({ id: feedback.id });
    if (updated.length === 0) throw new AppError(404, 'not_found', 'No such feedback');
    return { ok: true };
  });
}
