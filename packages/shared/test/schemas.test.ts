import { describe, expect, it } from 'vitest';
import {
  AccountSchema,
  InviteSchema,
  MembershipSchema,
  UserPublicSchema,
} from '../src/schemas/account.js';
import {
  ActivitySchema,
  ActivityStepSchema,
  RecurrenceSkipSchema,
} from '../src/schemas/activity.js';
import {
  CreateAccountBodySchema,
  CreateProfileBodySchema,
  ForgotPasswordBodySchema,
  GoogleAuthBodySchema,
  InviteBodySchema,
  LoginBodySchema,
  MeResponseSchema,
  PinBodySchema,
  ProvidersResponseSchema,
  RefreshBodySchema,
  RegisterBodySchema,
  ResetPasswordBodySchema,
  TokensResponseSchema,
} from '../src/schemas/auth.js';
import { AttitudeCheckSchema } from '../src/schemas/attitude.js';
import { ChipLedgerSchema } from '../src/schemas/chips.js';
import { hhmmSchema, isoDateSchema, SyncColumnsSchema, uuidSchema } from '../src/schemas/common.js';
import { LocationSchema } from '../src/schemas/location.js';
import { MediaSchema } from '../src/schemas/media.js';
import { ProfileSchema } from '../src/schemas/profile.js';
import { RewardSchema } from '../src/schemas/reward.js';
import { ScheduleItemSchema, StepCompletionSchema } from '../src/schemas/schedule.js';
import { ShareViewSchema } from '../src/schemas/share.js';
import { SocialStorySchema, StoryPageSchema } from '../src/schemas/story.js';
import {
  MutationSchema,
  SyncPullResponseSchema,
  SyncPushRequestSchema,
  SyncPushResponseSchema,
} from '../src/schemas/sync.js';

const id1 = 'df6bbc1d-2b21-403a-b1a7-ac4440dd64ab';
const id2 = '78adb98d-036c-4c47-91e7-76ace30e1528';
const id3 = 'ff635706-f37d-4758-8bce-1f70d222e275';
const now = 1_758_000_000_000;

const syncCols = {
  id: id1,
  profile_id: id2,
  version: 1,
  client_updated_at: now,
  updated_by: id3,
  deleted_at: null,
};

/** Round-trips a schema through a valid sample: parse succeeds and echoes it. */
function expectRoundTrip<T>(schema: { parse: (v: unknown) => T }, sample: unknown) {
  const parsed = schema.parse(sample);
  expect(parsed).toEqual(sample);
}

describe('common primitives', () => {
  it('accepts a well-formed uuid', () => {
    expectRoundTrip(uuidSchema, id1);
  });

  it('accepts a well-formed iso date', () => {
    expectRoundTrip(isoDateSchema, '2026-03-01');
  });

  it('rejects a malformed iso date', () => {
    expect(() => isoDateSchema.parse('03/01/2026')).toThrow();
  });

  it('accepts a well-formed HH:MM time', () => {
    expectRoundTrip(hhmmSchema, '08:30');
  });

  it('rejects an out-of-range time', () => {
    expect(() => hhmmSchema.parse('24:00')).toThrow();
  });

  it('round-trips sync columns', () => {
    expectRoundTrip(SyncColumnsSchema, syncCols);
  });
});

describe('account schemas', () => {
  it('round-trips an account', () => {
    expectRoundTrip(AccountSchema, { id: id1, kind: 'household', name: 'The Smiths', created_at: now });
  });

  it('round-trips a public user', () => {
    expectRoundTrip(UserPublicSchema, {
      id: id1,
      email: 'parent@example.com',
      display_name: 'Sam',
      pin_hash: 'pbkdf2$100000$c2FsdA$aGFzaA',
      email_verified_at: now,
      created_at: now,
      auth_provider: null,
    });
  });

  it('round-trips a membership', () => {
    expectRoundTrip(MembershipSchema, { account_id: id1, user_id: id2, role: 'admin' });
  });

  it('round-trips an invite', () => {
    expectRoundTrip(InviteSchema, {
      id: id1,
      account_id: id2,
      email: 'aunt@example.com',
      role: 'member',
      profile_ids: [id3],
      relationship_label: 'Aunt',
      token_hash: 'abcdef0123456789',
      expires_at: now,
      accepted_at: null,
      invited_by: id2,
    });
  });
});

describe('profile schema', () => {
  it('round-trips a profile', () => {
    expectRoundTrip(ProfileSchema, {
      id: id1,
      account_id: id2,
      name: 'Benny',
      avatar_emoji: '🦁',
      avatar_photo_id: null,
      share_token: null,
      first_then_activity_id: null,
      first_then_reward_id: null,
      settings: {},
      version: 1,
      client_updated_at: now,
      updated_by: id3,
      deleted_at: null,
    });
  });
});

describe('location schema', () => {
  it('round-trips a location', () => {
    expectRoundTrip(LocationSchema, {
      ...syncCols,
      name: 'Home',
      emoji: '🏠',
      photo_id: null,
      position: 0,
      chip_goal: 5,
      working_for_reward_id: null,
    });
  });
});

describe('activity schemas', () => {
  it('round-trips an activity', () => {
    expectRoundTrip(ActivitySchema, {
      ...syncCols,
      name: 'Brush Teeth',
      emoji: '🪥',
      photo_id: null,
      chip_value: 1,
      location_id: null,
      recurrence: 'daily',
      recurrence_weekdays: null,
      recurrence_time: '08:00',
      position: 0,
    });
  });

  it('round-trips a weekly activity with several weekdays', () => {
    expectRoundTrip(ActivitySchema, {
      ...syncCols,
      name: 'Piano',
      emoji: '🎹',
      photo_id: null,
      chip_value: 1,
      location_id: null,
      recurrence: 'weekly',
      recurrence_weekdays: [1, 3],
      recurrence_time: null,
      position: 0,
    });
  });

  it('rejects unsorted or duplicate recurrence_weekdays', () => {
    const base = {
      ...syncCols,
      name: 'Piano',
      emoji: null,
      photo_id: null,
      chip_value: 1,
      location_id: null,
      recurrence: 'weekly' as const,
      recurrence_time: null,
      position: 0,
    };
    expect(ActivitySchema.safeParse({ ...base, recurrence_weekdays: [3, 1] }).success).toBe(false);
    expect(ActivitySchema.safeParse({ ...base, recurrence_weekdays: [1, 1] }).success).toBe(false);
  });

  it('round-trips a root activity step', () => {
    expectRoundTrip(ActivityStepSchema, {
      ...syncCols,
      activity_id: id2,
      parent_step_id: null,
      position: 0,
      name: 'Turn on tap',
      emoji: '🚰',
      photo_id: null,
      duration_minutes: null,
    });
  });

  it('round-trips a timed activity step', () => {
    expectRoundTrip(ActivityStepSchema, {
      ...syncCols,
      activity_id: id2,
      parent_step_id: null,
      position: 0,
      name: 'Brush teeth',
      emoji: '🪥',
      photo_id: null,
      duration_minutes: 5,
    });
  });

  it('round-trips a nested activity step (child of another step)', () => {
    expectRoundTrip(ActivityStepSchema, {
      ...syncCols,
      activity_id: id2,
      parent_step_id: id3,
      position: 1,
      name: 'Squeeze toothpaste',
      emoji: null,
      photo_id: null,
      duration_minutes: null,
    });
  });

  it('round-trips a recurrence skip', () => {
    expectRoundTrip(RecurrenceSkipSchema, { ...syncCols, activity_id: id2, date: '2026-03-01' });
  });
});

describe('schedule schemas', () => {
  it('round-trips a schedule item', () => {
    expectRoundTrip(ScheduleItemSchema, {
      ...syncCols,
      date: '2026-03-01',
      position: 0,
      activity_id: id2,
      start_time: null,
      part_of_day: 'morning',
      source: 'manual',
      completed_at: null,
      completed_by: null,
    });
  });

  it('round-trips a step completion', () => {
    expectRoundTrip(StepCompletionSchema, {
      ...syncCols,
      schedule_item_id: id2,
      activity_step_id: id3,
      completed_at: now,
      completed_by: id3,
    });
  });
});

describe('reward schema', () => {
  it('round-trips a reward', () => {
    expectRoundTrip(RewardSchema, {
      ...syncCols,
      name: 'Movie Time',
      emoji: '🎬',
      photo_id: null,
      chip_cost: 5,
      location_id: null,
      always_available: false,
      position: 0,
    });
  });
});

describe('chip ledger schema', () => {
  it('round-trips a ledger row', () => {
    expectRoundTrip(ChipLedgerSchema, {
      ...syncCols,
      location_id: id2,
      delta: 1,
      reason: 'task',
      ref_id: id3,
      created_at: now,
      created_by: id3,
    });
  });
});

describe('story schemas', () => {
  it('round-trips a social story', () => {
    expectRoundTrip(SocialStorySchema, {
      ...syncCols,
      title: 'Getting a Haircut',
      emoji: '💇',
      cover_photo_id: null,
      position: 0,
    });
  });

  it('round-trips a story page', () => {
    expectRoundTrip(StoryPageSchema, {
      ...syncCols,
      story_id: id2,
      position: 0,
      text: 'Today I am getting a haircut.',
      emoji: '💇',
      photo_id: null,
    });
  });
});

describe('attitude schema', () => {
  it('round-trips an attitude check', () => {
    expectRoundTrip(AttitudeCheckSchema, {
      ...syncCols,
      schedule_item_id: id2,
      value: 'good',
      created_at: now,
      created_by: id3,
    });
  });
});

describe('media schema', () => {
  it('round-trips a media row', () => {
    expectRoundTrip(MediaSchema, {
      id: id1,
      account_id: id2,
      kind: 'image',
      status: 'ready',
      storage_key: 'media/2026/03/photo.webp',
      content_type: 'image/webp',
      width: 800,
      height: 600,
      duration_ms: null,
      bytes: 12_345,
      original_bytes: 45_678,
      created_by: id3,
      created_at: now,
    });
  });
});

describe('auth schemas', () => {
  it('round-trips a register body', () => {
    expectRoundTrip(RegisterBodySchema, {
      email: 'parent@example.com',
      password: 'correct-horse',
      display_name: 'Sam',
      consented_at: 1_700_000_000_000,
    });
  });

  it('round-trips a login body', () => {
    expectRoundTrip(LoginBodySchema, { email: 'parent@example.com', password: 'correct-horse' });
  });

  it('round-trips a google auth body', () => {
    expectRoundTrip(GoogleAuthBodySchema, { id_token: 'header.payload.signature' });
  });

  it('round-trips a refresh body', () => {
    expectRoundTrip(RefreshBodySchema, { refresh_token: 'a-very-long-random-token' });
  });

  it('round-trips a forgot password body', () => {
    expectRoundTrip(ForgotPasswordBodySchema, { email: 'parent@example.com' });
  });

  it('round-trips a reset password body', () => {
    expectRoundTrip(ResetPasswordBodySchema, { token: 'reset-token', password: 'new-password1' });
  });

  it('round-trips a pin body', () => {
    expectRoundTrip(PinBodySchema, { pin: '4242' });
  });

  it('round-trips a tokens response', () => {
    expectRoundTrip(TokensResponseSchema, {
      access_token: 'access',
      refresh_token: 'refresh',
      token_type: 'Bearer',
      expires_in: 900,
    });
  });

  it('round-trips a providers response', () => {
    expectRoundTrip(ProvidersResponseSchema, { google: true, apple: false, invite_code_required: true });
  });

  it('round-trips a create-account body', () => {
    expectRoundTrip(CreateAccountBodySchema, { kind: 'household', name: 'The Smiths' });
  });

  it('round-trips a create-profile body', () => {
    expectRoundTrip(CreateProfileBodySchema, { name: 'Benny', emoji: '🦁', photo_id: null });
  });

  it('round-trips an invite body', () => {
    expectRoundTrip(InviteBodySchema, {
      email: 'aunt@example.com',
      role: 'member',
      profile_ids: [id1],
      relationship_label: 'Aunt',
    });
  });

  it('round-trips a me response', () => {
    const account = { id: id1, kind: 'household', name: 'The Smiths', created_at: now };
    const user = {
      id: id2,
      email: 'parent@example.com',
      display_name: 'Sam',
      pin_hash: null,
      email_verified_at: null,
      created_at: now,
      auth_provider: null,
    };
    const profile = {
      id: id3,
      account_id: id1,
      name: 'Benny',
      avatar_emoji: '🦁',
      avatar_photo_id: null,
      share_token: null,
      first_then_activity_id: null,
      first_then_reward_id: null,
      settings: {},
      version: 1,
      client_updated_at: now,
      updated_by: id2,
      deleted_at: null,
    };
    expectRoundTrip(MeResponseSchema, {
      user,
      accounts: [{ account, role: 'admin' }],
      profiles: [profile],
    });
  });
});

describe('sync schemas', () => {
  it('round-trips an upsert mutation', () => {
    expectRoundTrip(MutationSchema, {
      table: 'activities',
      id: id1,
      op: 'upsert',
      row: { id: id1, name: 'Brush Teeth' },
      client_updated_at: now,
    });
  });

  it('round-trips a delete mutation with no row', () => {
    expectRoundTrip(MutationSchema, {
      table: 'activities',
      id: id1,
      op: 'delete',
      client_updated_at: now,
    });
  });

  it('round-trips a push request', () => {
    expectRoundTrip(SyncPushRequestSchema, {
      profile_id: id1,
      mutations: [{ table: 'locations', id: id2, op: 'upsert', row: { id: id2 }, client_updated_at: now }],
    });
  });

  it('round-trips a push response', () => {
    expectRoundTrip(SyncPushResponseSchema, {
      applied: [id1],
      rejected: [{ id: id2, table: 'activities', reason: 'stale', server_row: { id: id2 } }],
      version: 42,
    });
  });

  it('round-trips a pull response', () => {
    expectRoundTrip(SyncPullResponseSchema, {
      changes: { locations: [{ id: id1 }], activities: [] },
      version: 42,
      has_more: false,
    });
  });
});

describe('share schema', () => {
  it('round-trips a share view', () => {
    expectRoundTrip(ShareViewSchema, {
      profile_name: 'Benny',
      profile_emoji: '🦁',
      profile_avatar_photo_id: null,
      items: [
        {
          id: id1,
          activity_name: 'Brush Teeth',
          activity_emoji: '🪥',
          activity_photo_id: null,
          start_time: '08:00',
          part_of_day: 'morning',
          completed_at: now,
          steps: [{ name: 'Turn on tap', emoji: '🚰', completed: true }],
        },
      ],
      chip_balance: 3,
      working_for_reward: { name: 'Movie Time', emoji: '🎬', chip_cost: 5 },
      updated_at: now,
    });
  });
});
