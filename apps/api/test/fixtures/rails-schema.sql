-- Minimal Rails-shaped schema for apps/api/test/import-rails.test.ts. Not a
-- full copy of E:\Chipperly\reference-lovable\db\schema.rb: only the columns
-- the importer reads (see apps/api/src/import/source.ts), plus a handful of
-- rows that exercise every mapping in docs/import-rails.md.

create table accounts (
  id bigint primary key,
  account_type integer not null,
  created_at timestamp not null,
  updated_at timestamp not null
);

create table users (
  id bigint primary key,
  email_address text not null,
  first_name text,
  last_name text,
  email_verified_at timestamp,
  created_at timestamp not null,
  updated_at timestamp not null
);

create table account_memberships (
  account_id bigint not null,
  user_id bigint not null,
  role integer not null default 0
);

create table profile_assignments (
  user_id bigint not null,
  profile_id bigint not null,
  relationship_label text
);

create table profiles (
  id bigint primary key,
  account_id bigint not null,
  name text not null,
  emoji text,
  first_then_state jsonb not null default '{}',
  token_board_state jsonb not null default '{}',
  created_at timestamp not null,
  updated_at timestamp not null
);

create table location_photos (
  profile_id bigint not null,
  location_name text not null
);

create table activities (
  id bigint primary key,
  profile_id bigint not null,
  name text not null,
  emoji text,
  chip_value integer,
  location text,
  recurrence text,
  recurrence_time timestamp,
  skipped_dates jsonb not null default '[]',
  created_at timestamp not null,
  updated_at timestamp not null
);

create table routines (
  id bigint primary key,
  profile_id bigint not null,
  name text,
  emoji text,
  recurrence text,
  recurrence_time timestamp,
  skipped_dates jsonb not null default '[]',
  created_at timestamp not null,
  updated_at timestamp not null
);

create table routine_steps (
  id bigint primary key,
  routine_id bigint not null,
  activity_id bigint not null,
  position integer,
  updated_at timestamp not null
);

create table events (
  id bigint primary key,
  profile_id bigint not null,
  activity_id bigint,
  routine_id bigint,
  scheduled_date date not null,
  start_time timestamp,
  position integer,
  completed_at timestamp,
  updated_at timestamp not null
);

create table routine_step_completions (
  id bigint primary key,
  event_id bigint not null,
  routine_step_id bigint not null,
  created_at timestamp not null,
  updated_at timestamp not null
);

create table rewards (
  id bigint primary key,
  account_id bigint,
  profile_id bigint,
  name text not null,
  emoji text,
  chip_cost integer,
  location text,
  created_at timestamp not null,
  updated_at timestamp not null
);

create table choice_options (
  id bigint primary key,
  profile_id bigint not null,
  name text not null,
  emoji text,
  created_at timestamp not null,
  updated_at timestamp not null
);

create table social_stories (
  id bigint primary key,
  title text not null,
  emoji text,
  position integer,
  updated_at timestamp not null
);

create table social_story_pages (
  id bigint primary key,
  social_story_id bigint not null,
  position integer not null,
  caption text,
  emoji text,
  updated_at timestamp not null
);

create table invites (
  id bigint primary key,
  account_id bigint,
  email_address text not null,
  role integer not null default 0,
  profile_ids jsonb not null default '[]',
  relationship_label text,
  accepted_at timestamp,
  archived_at timestamp,
  expires_at timestamp not null
);

-- One household account: an admin and a care-team member.
insert into accounts (id, account_type, created_at, updated_at) values
  (1, 1, '2026-01-05 09:00:00', '2026-09-01 09:00:00');

insert into users (id, email_address, first_name, last_name, email_verified_at, created_at, updated_at) values
  (1, 'Rails-Parent@Example.com', 'Pat', 'Rivera', '2026-01-05 09:05:00', '2026-01-05 09:00:00', '2026-01-05 09:05:00'),
  (2, 'rails-aunt@example.com', 'Robin', null, null, '2026-02-01 10:00:00', '2026-02-01 10:00:00');

insert into account_memberships (account_id, user_id, role) values
  (1, 1, 0),
  (1, 2, 1);

insert into profiles (id, account_id, name, emoji, first_then_state, token_board_state, created_at, updated_at) values
  (1, 1, 'Riley', '🧒',
   '{"activity_id": 1, "reward_id": 1}',
   '{"Home": {"goal": 10, "earned": 4, "reward_id": 1}, "Dads": {"goal": 5, "earned": 0, "reward_id": null}}',
   '2026-01-05 09:10:00', '2026-09-10 12:00:00');

insert into profile_assignments (user_id, profile_id, relationship_label) values
  (2, 1, 'Aunt');

insert into location_photos (profile_id, location_name) values
  (1, 'Home');

insert into activities (id, profile_id, name, emoji, chip_value, location, recurrence, recurrence_time, skipped_dates, created_at, updated_at) values
  (1, 1, 'Brush teeth', '🪥', 1, 'Home', 'daily', null, '[]', '2026-01-06 08:00:00', '2026-01-06 08:00:00'),
  (2, 1, 'Pack bag', '🎒', 0, null, 'weekly', '2000-01-01 07:30:00', '["2026-09-10"]', '2026-01-10 07:00:00', '2026-08-01 07:00:00'),
  (3, 1, 'Make bed', null, 2, 'Dads', null, null, '[]', '2026-01-06 08:01:00', '2026-01-06 08:01:00');

insert into routines (id, profile_id, name, emoji, recurrence, recurrence_time, skipped_dates, created_at, updated_at) values
  (1, 1, 'Morning routine', '🌞', 'weekdays', null, '["2026-09-11"]', '2026-01-07 07:00:00', '2026-08-15 07:00:00');

insert into routine_steps (id, routine_id, activity_id, position, updated_at) values
  (1, 1, 1, 1, '2026-01-07 07:00:00'),
  (2, 1, 3, 2, '2026-01-07 07:00:00');

insert into events (id, profile_id, activity_id, routine_id, scheduled_date, start_time, position, completed_at, updated_at) values
  (1, 1, 2, null, '2026-09-17', null, 1, '2026-09-17 08:00:00', '2026-09-17 08:00:00'),
  (2, 1, null, 1, '2026-09-17', null, 2, null, '2026-09-17 07:00:00');

insert into routine_step_completions (id, event_id, routine_step_id, created_at, updated_at) values
  (1, 2, 1, '2026-09-17 08:05:00', '2026-09-17 08:05:00');

insert into rewards (id, account_id, profile_id, name, emoji, chip_cost, location, created_at, updated_at) values
  (1, null, 1, 'Extra story', '📖', 10, 'Home', '2026-01-06 09:00:00', '2026-01-06 09:00:00'),
  (2, 1, null, 'Orphan reward', null, 5, null, '2026-01-06 09:01:00', '2026-01-06 09:01:00');

insert into choice_options (id, profile_id, name, emoji, created_at, updated_at) values
  (1, 1, 'Free draw time', '🎨', '2026-01-08 09:00:00', '2026-01-08 09:00:00');

insert into social_stories (id, title, emoji, position, updated_at) values
  (1, 'Going to the dentist', '🦷', 1, '2026-01-02 00:00:00');

insert into social_story_pages (id, social_story_id, position, caption, emoji, updated_at) values
  (1, 1, 1, 'We will see the dentist.', '🦷', '2026-01-02 00:00:00');

insert into invites (id, account_id, email_address, role, profile_ids, relationship_label, accepted_at, archived_at, expires_at) values
  (1, 1, 'rails-pending@example.com', 3, '[1]', 'Uncle', null, null, '2027-01-01 00:00:00'),
  (2, 1, 'rails-already-accepted@example.com', 0, '[1]', null, '2026-02-01 00:00:00', null, '2026-03-01 00:00:00');
