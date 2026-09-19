import type { FastifyRequest } from 'fastify';
import { env } from '../env.js';

/**
 * Absolute base for a link we mail or hand to a caregiver to pass on
 * (verify, reset, invite). `APP_ORIGIN` wins when it is set; otherwise the
 * origin comes from the request, because a relative link is useless the
 * moment it leaves the app: the invite sheet shows it for copying exactly
 * on servers with no mail provider, which are also the ones least likely to
 * have APP_ORIGIN configured.
 *
 * `x-forwarded-*` is trusted here and nowhere else: every deployment of this
 * API sits behind our own nginx, which sets both (deploy/vm200/*.conf), and
 * the worst a spoofed header can do is put a wrong host in a link the
 * sender reads before using.
 */
export function linkBase(request: FastifyRequest): string {
  if (env.APP_ORIGIN) return `${env.APP_ORIGIN}${env.BASE_PATH}`;
  const first = (value: string | string[] | undefined): string | undefined =>
    (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim() || undefined;
  const proto = first(request.headers['x-forwarded-proto']) ?? request.protocol;
  const host = first(request.headers['x-forwarded-host']) ?? first(request.headers.host);
  return host ? `${proto}://${host}${env.BASE_PATH}` : env.BASE_PATH;
}
