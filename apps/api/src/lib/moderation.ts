/** Only the shape it needs, so it compiles before UserPublic gains `is_support`. */
export interface ModerationFlags {
  readonly is_super_admin?: boolean;
  readonly is_support?: boolean;
}

/** The one moderation check. Every moderation route goes through it. */
export function canModerate(user: ModerationFlags): boolean {
  return user.is_super_admin === true || user.is_support === true;
}
