# Chipperly UX and screen design plan

Written 17 Sept 2026. Companion to `rebuild-technical-plan.md`. No colors are specified here; the brand kit decides those. This document decides what screens exist, what is on each one, how a person moves between them, and the rules every screen follows.

## 1. What the reference UI has (baseline, then ignored)

For the record only. The new design does not start from it.

| Reference screen | Notes |
| --- | --- |
| Marketing: home, features, about, pricing | Stays on Vercel, out of scope |
| Sign up, sign in, verify email, password reset | Standard forms |
| Onboarding: "who is this for", create profile | Two steps, then PIN prompt |
| Dashboard | Grid of five cards (My Day, Chip Board, Timer, Social Stories, First-Then), lock button |
| My Day: day / month / year | Add via activity picker then time picker, move up/down, edit, delete. No check-off |
| Activity picker, time picker | Overlays |
| Chip Board | Location dropdown, "I am working for", star row, +/-, goal editor |
| Rewards, Activities, Locations lists | List + add form + delete |
| Timer | Six presets, ring, start/pause/reset |
| First-Then | Two cards linking to pickers |
| Social stories list and viewer | Read-only |
| Profiles, care team, settings, PIN setup, unlock modal | Management |
| Shared view `/s/:token` | Stub |
| Admin panel | Out of scope |

Nineteen screens, one navigation model (grid home, back arrows), no child-specific mode beyond hiding the settings gear.

## 2. Purpose and principles

Chipperly replaces laminated visual supports: a picture schedule on the fridge, a token board with velcro stars, a sand timer, a first-then card, a printed social story. The people who use those tools chose them because they are simple, predictable, and picture-first. The app must keep those three properties or it loses to the laminate.

Principles, in priority order:

1. **The child's screen is a different product.** One list, big pictures, big check marks, nothing else. No navigation, no settings, no text-only controls. A caregiver locks the device into it.
2. **Pictures carry meaning; words confirm it.** Every activity, reward, location, and story page is a picture (emoji or photo) with a short name under it. Never a name alone.
3. **One primary action per screen.** It is big, it is at the bottom or in the list, and it is the same place every time.
4. **Never surprise.** No auto-populated content (the reference's first-then defaulted to "lunch" and confused people). No modals stacking on modals. No layout shifts. Completed things stay where they are.
5. **Do, then offer undo.** No "Are you sure?" for everyday actions. A toast with Undo for five seconds. Confirmation only for the three actions that cannot be undone (delete a child profile, remove a care team member, regenerate a share link).
6. **Offline is invisible.** The app never says "connecting". A small sync mark in the top bar says synced, pending, or offline. Nothing blocks on the network except sign-in, sending an invite, and the share link.
7. **Depth two, at most.** Tab, then a sheet or a page. Anything deeper is a sign the design is wrong.

## 3. Who is looking at the screen

| Mode | Who | How they get there | What they can do |
| --- | --- | --- | --- |
| Caregiver | Parent, therapist, teacher (account admin or member) | Sign in | Everything for the profiles they can see |
| Child | The individual | Caregiver taps "Lock to [name]" and sets a PIN | Check off tasks and steps, see chips, answer the attitude prompt, see a running timer. Optional: open free-time choices, see first-then |
| Viewer | Anyone with the share link | Opens `/share/<token>` | Look at today and the chip count. Nothing else |
| Signed out | New or returning user | `/` | Sign in, sign up, accept an invite |

A self-managed account ("just me") is caregiver mode where the profile is the user. Child mode is not offered there.

## 4. Navigation model

### Caregiver shell

Five tabs at the bottom, icon plus one-word label, always visible. They are the five tools the client names.

```text
┌──────────────────────────────────────┐
│ (avatar) Benny ▾        ⟳   ⚙        │  top bar: profile switcher, sync mark, settings
├──────────────────────────────────────┤
│                                      │
│           tab content                │
│                                      │
├──────────────────────────────────────┤
│  Today   Chips   Timer  First-Then  Stories │
└──────────────────────────────────────┘
```

- **Today**: the schedule. The default tab on open.
- **Chips**: the chip board, working-for reward, free-time choices, redeem.
- **Timer**: the countdown.
- **First-Then**: the two-panel prompt.
- **Stories**: social stories, view and author.

Everything that is setup rather than use (activities library, rewards library, locations, profiles, care team, account, sharing, lock) lives behind the settings gear, and is also reachable from where it is needed (a "Create new" tile at the top of every picker, an "Edit" link on any item sheet).

Two things deliberately not tabs: the attitude chart (it is a prompt on a task, with a small history page under the profile) and the library (setup, not daily use).

On screens 1024px and wider the tab bar becomes a left rail with the same five items. Content stays a single column, max width 640px, centered. No two-pane layouts. Simplicity beats density here.

### Child shell

No tabs. No top bar except the profile picture, the chip strip, and a small lock glyph. Back gestures do nothing. Described in section 6.

### Sheets and pages

- A **sheet** slides up from the bottom, covers most of the screen, has a drag handle and a Close. Used for pickers, item detail, and short forms. One sheet at a time; opening a picker from a sheet replaces the sheet's content and Back returns to it.
- A **page** replaces the tab content with a top bar Back. Used for long forms (edit activity, edit story) and lists under settings.

## 5. Screen inventory

| # | Screen | Mode | Type | Primary action |
| --- | --- | --- | --- | --- |
| S1 | Welcome / sign in | Signed out | page | Continue with Google |
| S2 | Create account | Signed out | page | Create account |
| S3 | Who is this for | Onboarding | page | Pick one of three |
| S4 | First profile | Onboarding | page | Continue |
| S5 | Ready | Onboarding | page | Go to Today |
| S6 | Today | Caregiver | tab | Check off / Add |
| S7 | Item sheet | Caregiver | sheet | Done |
| S8 | Picker (activities or rewards) | Caregiver | sheet | Tap a tile |
| S9 | Edit activity | Caregiver | page | Save |
| S10 | Chips | Caregiver | tab | + chip |
| S11 | Free-time choices | Caregiver, Child (optional) | sheet | Tap a tile |
| S12 | Chip history | Caregiver | page | none (read) |
| S13 | Timer | Caregiver | tab | Start |
| S14 | Timer full screen | Caregiver, Child | overlay | Pause |
| S15 | First-Then | Caregiver, Child (optional) | tab | Done (on First) |
| S16 | Stories | Caregiver | tab | Open a story / New |
| S17 | Story viewer | Caregiver, Child | overlay | Next |
| S18 | Edit story | Caregiver | page | Save |
| S19 | Edit reward | Caregiver | page | Save |
| S20 | Settings | Caregiver | page | none (menu) |
| S21 | Profiles | Caregiver | page | Add child |
| S22 | Edit profile | Caregiver | page | Save |
| S23 | Lock this device | Caregiver | sheet | Lock |
| S24 | PIN pad | Child → Caregiver | overlay | digits |
| S25 | Library: activities, routines, rewards, locations | Caregiver | page | Add |
| S26 | Care team | Caregiver (admin) | page | Invite |
| S27 | Invite form | Caregiver (admin) | sheet | Send |
| S28 | Share link | Caregiver (admin) | sheet | Copy |
| S29 | Attitude history | Caregiver | page | none (read) |
| S30 | Account | Caregiver | page | Sign out |
| S31 | Sync status | Caregiver | sheet | Sync now |
| S32 | Child today | Child | full screen | Check off |
| S33 | Accept invite | Signed out → Caregiver | page | Accept |
| S34 | Share viewer | Viewer | page | none (read) |
| S35 | Chipper Chart | Caregiver, Child (optional) | page (child: sheet) | +/- the mood level |
| S36 | Visual schedule | Caregiver, Child (optional) | overlay | Check off / Print |

Thirty-six, of which thirteen are sheets or overlays over an existing screen (fourteen counting S35 in child mode). A caregiver's daily loop touches S6, S7, S10, S13, S15 and nothing else.

Two more public, unnumbered pages sit alongside forgot/reset-password and verify: `/privacy/` and `/terms/`, plain-language draft policy and terms pages (SOW Q21), linked from the (public) footer and from S30.

## 6. Screen specifications

Each spec lists: what is on it, top to bottom; the one primary action; states; what it must not have.

### S1 Welcome / sign in

- App name and one line: "Neurodivergent life made easier." (the owner's tagline, 19 Sept 2026)
- Continue with Google (full width). Continue with Apple appears only when configured.
- Email and password fields, Sign in.
- Links: Create account, Forgot password.
- Must not have: marketing copy, feature carousel, anything below the fold.

### S2 Create account

Name, email, password, a required checkbox ("I'm a parent, guardian, or an authorised caregiver, and I'm 18 or older. I agree to the Terms and Privacy Policy," both linked), Create account. Google and Apple buttons above the form, disabled with a hint until the checkbox is checked. Create account itself stays disabled until it's checked too. Nothing else. Email verification is a banner on Today afterwards, not a blocking screen.

### S3 Who is this for

Three large tiles, picture plus label plus one line each:

- **Myself**: "I'll use the tools for my own day." (account kind: individual, self-managed)
- **My family**: "One or more children at home." (household)
- **My organization**: "Clients and staff." (agency)

Tapping one continues. No Next button.

### S4 First profile

Skipped for "Myself" (the profile is the user; name and picture come from the account).

- "Who is this for?" Name field.
- Picture: an emoji grid (24 friendly options) and "Use a photo" (camera or library). Emoji is default so nobody is blocked by a photo.
- Continue.

### S5 Ready

One screen, one sentence: "We added starter activities and rewards for [name]. Change anything later." Button: Go to Today. Below it, quiet text: "Sharing this device with [name]? You can lock it to their view from Settings." No forced PIN setup.

### S6 Today (caregiver)

```text
┌──────────────────────────────────────┐
│ (avatar) Benny ▾        ⟳   ⚙        │
│                                      │
│  ◀   Wednesday, Sept 17   ▶   Today  │  tap the date → native date input
│                                      │
│  ● ● ● ○ ○   Working for: 🎬 Movie   │  chip strip, tap → Chips tab
│                                      │
│  MORNING                             │  group headers only if any item has a part of day
│  ≡ [🛏️] Wake up                 (✓)  │
│  ≡ [🪥] Brush teeth   3 steps ▾  ( )  │  chevron expands steps inline
│  ≡ [🚌] Go to school  8:00      ( )  │
│                                      │
│  AFTERNOON                           │
│  ≡ [🧩] Therapy       Sam       ( )  │
│                                      │
│                              ( + )   │  add, bottom right
├──────────────────────────────────────┤
│  Today   Chips   Timer  First-Then  Stories │
└──────────────────────────────────────┘
```

Top to bottom:

- Date row: previous, date, next, and a "Today" jump that appears only when not on today. Tapping the date opens the platform date input. No month grid.
- Chip strip: filled and empty chips for the current location, the working-for reward picture and name. Tap goes to Chips. Hidden when no reward and no chips.
- The list. Each row: drag handle (left), picture tile, name, small secondary text (time, or step count, or a therapist's name if in the activity name), check circle (right, at least 48px). A row with a story attached (S7) gets a small book mark next to the secondary text. Rows with steps have a chevron; tapping it expands the steps inline, each with its own check circle. Checking every step checks the parent. Checking the parent with steps asks nothing; it checks all steps. A step can itself be broken into sub-steps (S9, S36); the expanded list shows level 1 always, with any deeper level collapsed behind its own step's chevron until tapped.
- Completed rows stay in place, dimmed, with a filled check. They do not move to the bottom.
- Add button, bottom right, above the tab bar. Opens S8 for activities.

Primary action: the check circle. Secondary: tap a row (not the check) opens S7.

States:

- Empty day: a picture, "Nothing planned for Wednesday", and three buttons: Add activity, Copy yesterday, Use weekday plan (or weekend plan). The plans are the profile's recurring activities; this button materializes them for the day.
- All done: a quiet celebration at the bottom of the list ("All done for today"). Not a takeover.
- Offline: no change. Adds and checks work locally.

Must not have: a time prompt when adding (client feedback), a month or year view, a "complete all" button, a search box.

### S7 Item sheet

Opens from a row tap.

- Picture, name.
- Time (optional, tap to set via platform time input, Clear).
- Part of day: none / morning / afternoon / evening (segmented).
- Steps, if any, listed with check circles as a tree: level 1 always shown, anything nested under a step collapsed behind that step's own chevron until tapped. A step with a duration also shows "N min" and a small Start timer button that starts the timer and opens S14. A step with sub-steps also gets a small Open button ("Open [step] as visual schedule") for just that step's own list (S36).
- An "Open as visual schedule" button under the steps, when the activity has any (S36, the full tree).
- Chips: "Earns 2 chips" if chip value > 0.
- Story row: the attached social story's picture and title, or "Attach a story" (the owner's dentist-visit example). Tapping opens a picker sheet over this one, listing the profile's stories plus a Create new tile and, once one is attached, a Remove story action. Picking or removing returns to this sheet.
- Buttons: Done (checks it and closes), Remove from today. For a recurring item, Remove asks "Just today" or "Every day" in place, not in a new dialog.
- Quiet link: Edit activity (goes to S9).

### S8 Picker

Shared between activities and rewards. One component, two data sources.

- Title: "Add to Wednesday" or "Working for..." depending on caller.
- Search field (filters as you type; hidden until the list exceeds 12 items).
- Grid of tiles, 3 across on phones, 4 on tablets. Each tile: picture, name, and for activities a tiny step count badge. First tile is always **Create new** (dashed outline).
- Sections: Recent (last 8 used), then, for activities, **Activities** (no steps, alphabetical) and **Routines** (has steps, alphabetical, with a dashed **New routine** tile at the end). For rewards, one **All** section, alphabetical. An activity IS a routine once it has a step (docs/technical-plan.md section 5); there is no separate routines table.
- Tap adds immediately and closes. No time prompt, no confirm. A toast: "Added Brush teeth. Undo."
- For rewards, tiles show the chip cost. Tiles not available at the current location are hidden, not greyed.

### S9 Edit activity (and S19 Edit reward, same shape)

A page. Fields in this order, each a single row that expands when tapped:

1. Name.
2. Picture: emoji (grid), photo (library), camera, paste image. One row, four choices, current picture shown large above.
3. Chips: stepper 0 to 10. (Reward: cost stepper 1 to 20, or "Always available" toggle which hides the cost.)
4. Where: chips for each location plus "Everywhere" (default).
5. Repeat: none / every day / weekdays / weekends / weekly. Weekly reveals seven day toggle buttons (multi-select, at least one required); the summary reads "Weekly on Tue, Thu". Optional time.
6. Steps: list of rows (picture + short text), add step, drag to reorder, swipe to delete. Empty by default. Each row also has a small **From activity** button, opening the activities picker (no routines offered) to copy that activity's name, emoji and photo into the step, and a small "min" number field (1-120, empty = untimed) for an optional step timer. A small **Break down** button on each row adds an indented sub-step under it, up to three levels deep (deeper is fine once it exists, the button just stops offering a fourth); sub-steps reorder with the same drag/move controls, only among their own siblings, and removing a step removes its sub-steps with it (one undo restores the whole thing). **From activity** and **Break down** both work at any level.
7. Save (sticky bottom). Delete at the very bottom, plain text, with undo toast.

Routine mode: entered via `?routine=1` (from the picker's "New routine" tile) or by editing an activity that already has steps. The page title reads "New routine" / "Edit routine" instead of "...activity", and the Steps section starts expanded (new routine: one empty step row, focused).

A **Print visual schedule** button sits in the header once the activity has any named steps, opening S36 read-only so a caregiver can print a step list before it is even added to a day.

Must not have: tabs within the form, required fields beyond name, a preview pane.

### S10 Chips

```text
┌──────────────────────────────────────┐
│ (avatar) Benny ▾        ⟳   ⚙        │
│                                      │
│   [ Home ]  [ Dad's ]  [ School ]    │  location, segmented (dropdown if > 3)
│                                      │
│   ┌──────────────────────────────┐   │
│   │  Working for                 │   │
│   │      🎬  Movie time          │   │  tap → S8 rewards
│   │      3 of 5 chips            │   │
│   └──────────────────────────────┘   │
│                                      │
│      ●   ●   ●   ○   ○               │  chips, large, read-only
│                                      │
│   ┌────────┐            ┌────────┐   │
│   │   −    │            │   +    │   │  the two big buttons
│   └────────┘            └────────┘   │
│                                      │
│   [ Free time choices ]  [ History ] │
├──────────────────────────────────────┤
│  Today   Chips   Timer  First-Then  Stories │
└──────────────────────────────────────┘
```

- Location selector at top. The device remembers the last one per profile.
- Working-for card: reward picture, name, "3 of 5 chips". Tap opens the rewards picker filtered to this location. When no reward is chosen the card reads "Choose a reward" and the board uses the location's manual goal (a small "Goal: 5" link under the chips lets the caregiver change it; hidden once a reward is chosen).
- Chips: as many circles as the cost or goal, filled from the ledger balance. Read-only; the reference's tap-to-set caused accidental changes.
- Attitude-bonus idea, first slice (off by default, per profile in Edit profile, S22): when on, each filled chip is colored red, yellow or green by the Chipper Chart level it was earned with, with an aria-label per chip ("chip 3, earned with a positive attitude"). The bonus reward itself is a proposal for a later round.
- Minus and plus: the primary actions, large, equal weight. Plus animates the next chip filling and plays the chip sound.
- When full: the plus button becomes **Redeem 🎬**. Tap: celebration, ledger entry for the cost, the working-for card clears to "Choose a reward". Undo toast.
- Free time choices: opens S11.
- History: opens S12.

### S11 Free-time choices

Sheet. Grid of large tiles: every reward marked always-available for this location. Tap a tile highlights it (this is the choice board; nothing is written except an optional ledger note "chose Free choice"). Create new tile at the start. Available to the child if the caregiver turned it on.

### S12 Chip history

Plain list, newest first, grouped by day: "+1 Brush teeth (Sam)", "+1 (Mom)", "−5 Movie time". Filter by location. That is all.

### S13 Timer

- Ring with time in the middle. Tap the time to type a duration (minutes and seconds, numeric keypad).
- Presets under the ring: 1, 2, 5, 10, 15, 30 minutes. Tap sets and does not start.
- Start (large). Pause replaces it while running. Reset, small, appears only when there is time to reset.
- Two options rows below: "Reveal a picture" (pick a reward or photo; it fades in as time passes) and "Sound at the end" (toggle).
- Tap the ring while running: S14 full screen.
- A running timer shows as a pill above the tab bar on every other tab. Tap returns here.

### S14 Timer full screen

Ring fills the screen. The picture reveal if set. Tap anywhere: Pause / Resume. Small ✕ top corner to leave. Screen stays awake while running (Wake Lock, with graceful fallback).

### S15 First-Then

Two equal panels, stacked on phones, side by side in landscape and on tablets.

- FIRST panel: label, picture, name. Empty state: "Choose an activity". Tap: activities picker.
- THEN panel: same for a reward.
- When both are set: a Done check on the FIRST panel. Tapping it dims FIRST and enlarges THEN with a small celebration. Chips, if the activity earns them, are awarded through the ledger.
- Overflow (⋯): Clear both.

Must not have: any default content. It starts empty every time it is cleared and stays as set otherwise.

### S16 Stories

- Grid of story covers (picture + title). New story tile first.
- Tap a cover: S17.
- Long-press or ⋯ on a cover: Edit, Duplicate, Delete (undo toast).
- Empty state: "No stories yet" and four starter templates: Haircut, Doctor visit, New place, Big day. Tapping one creates an editable story with pre-written pages and emoji pictures.

### S17 Story viewer

Full screen. One page at a time: picture fills the top two-thirds, one or two sentences below in large type. Previous and Next as large tap zones on the left and right halves of the screen, plus arrow buttons for clarity. Page dots. Optional "Read aloud" button using the platform speech API. ✕ to close. Works identically in caregiver and child mode.

### S18 Edit story

Page. Title and cover picture at top. Then the pages as a vertical list: each row is a picture tile and a text field. Add page at the bottom. Drag to reorder. Swipe to delete a page (undo). Preview button opens S17. Save sticky at the bottom.

### S20 Settings

A menu page. Sections and rows:

- **[Profile name]**: Edit profile, Lock this device to [name], Attitude history, Share link.
- **Library**: Activities, Routines, Rewards, Locations.
- **Care team** (admin only).
- **Profiles**: switch, add.
- **Account**: name, email, sign-in methods, device PIN, switch account (if more than one), sign out.
- **This device**: sync status, sounds on/off, reduce motion (follows the system by default), clear local data.

### S21 Profiles and S22 Edit profile

S21: list of profiles the user can see, avatar and name, current one marked. Add child at the bottom (respects the account limit; when reached, the button explains why). S22: name, picture, "After a reward" (Subtract the cost / Start over, SOW Q1, decided), "Colour chips by attitude" switch (attitude-bonus idea, first slice, off by default, see S10), and Delete profile at the bottom (this one confirms).

### S23 Lock this device

Sheet. "Lock this device to Benny's view. You'll need your PIN to get back." If no PIN exists yet: set a 4 to 6 digit PIN here, twice. Toggles: "Show free-time choices", "Show First-Then", "Ask how it went after each task" (the attitude prompt, off by default now that S35 replaces it), "Show steps expanded", "Show Chipper Chart" (on by default), "Let Benny switch location" (SOW Q3, decided; off by default), "Let the child start step timers" (SOW Q6, decided; off by default). Button: Lock.

### S24 PIN pad

Overlay from the lock glyph in child mode. Large digit pad, dots for entered digits, no keyboard. Wrong PIN shakes once (no shake under reduced motion) and clears. Five wrong attempts: thirty-second wait. Works offline against the locally cached hash.

### S25 Library

Four simple lists (activities, routines, rewards, locations) with pictures, an Add at the top, tap to edit, swipe to delete with undo. Activities lists activities with no steps; Routines lists activities with at least one step (secondary text "N steps") and Add opens the activity form in routine mode (`?routine=1`) — same underlying table, two lists. Locations edit sheet: name, picture, goal. Renaming a location keeps everything attached (it is an id underneath).

### S26 Care team, S27 Invite

S26: members with name, role, and which profiles they see; pending invites with Resend and Cancel. Invite button. Remove a member confirms and explains that their created items stay.
S27: email, role (Admin / Member), and for Member a checklist of profiles plus an optional relationship label ("Speech therapist"). Send. Requires network; if offline the button says so and the invite queues.

### S28 Share link

Sheet. Toggle "Share a read-only link". When on: the link, Copy, and Regenerate (confirms). One line under it: "Anyone with this link can see today's list and chip count. Nothing else."

### S29 Attitude history

List by day: count of good and grumpy, expandable to see which task. Read only.

### S30 Account

Name, email, connected sign-ins (Google connected / connect), change password, PIN, switch account, "Download my data" (fetches everything the account can see and saves it as one JSON file), sign out, delete account (confirms, explains). A small one-line Privacy policy / Terms link sits under the list.

### S31 Sync status

Sheet from the ⟳ mark. "Up to date, 2 minutes ago" or "3 changes waiting" or "Offline. Changes are saved on this device." Sync now button. Photos waiting to upload, if any.

### S32 Child today

```text
┌──────────────────────────────────────┐
│  (avatar)  Benny        ● ● ● ○ ○  🎬     🔒 │
│                                      │
│  ┌──────────────────────────────┐    │
│  │  [🛏️]   Wake up          (✓) │    │  rows are tall, pictures big
│  └──────────────────────────────┘    │
│  ┌──────────────────────────────┐    │
│  │  [🪥]   Brush teeth      ( ) │    │
│  │    [🚰] Turn on tap     ( )  │    │  steps shown expanded
│  │    [🧼] Soap            ( )  │    │
│  │    [💧] Rinse           ( )  │    │
│  └──────────────────────────────┘    │
│  ┌──────────────────────────────┐    │
│  │  [🚌]   Go to school     ( ) │    │
│  └──────────────────────────────┘    │
│                                      │
│  ( 🎈 Free time )   ( ⏱ 04:32 )       │  only if enabled / running
└──────────────────────────────────────┘
```

- Header: avatar, name, chip strip with the working-for picture, lock glyph. Nothing is tappable except the lock (S24) and the chip strip — which, when the caregiver's "Let [name] choose the reward" toggle is on (default yes), shows from the start even at zero chips and opens a sheet of this location's earnable rewards, each a 64px row with its picture, name and cost, tap one to work for it; with the toggle off it opens the old read-only view of S10 with just the chips and the reward, no buttons — plus, only when the caregiver's "Let [name] switch location" toggle (S23) is on, the location name itself: a 64px button opening a sheet of the profile's locations as big picture tiles, tap one to switch (SOW Q3, decided). The chip strip and board follow the chosen location like they do on S10.
- Today only. No date navigation.
- Rows are tall (at least 72px), picture at least 56px, check circle at least 64px. Steps show expanded by default under their parent, the whole tree at once, no collapsing; the caregiver can hide them entirely in S23 if that is too much. A row with steps also gets a "Steps" button, behind the "Let [name] open a step list" toggle (S23, default on), opening that item's tree as S36, still locked.
- Check: fills, chip sound if it earns a chip, the chip strip updates. Then, if enabled, the attitude prompt appears inline under the row: "How did it go?" with two large tiles, a smiling face and a grumpy face, and no text beyond the labels. Tap either, or ignore it; it fades after ten seconds.
- A step with a duration shows "N min" and, only when the caregiver's "Let the child start step timers" toggle (S23) is on, a Start timer button that starts the timer full screen (S14, SOW Q6, decided).
- A row whose item has a story attached (set from S7) gets one more 64px button under the row name: book icon, "Read story". It opens the story full screen (S17), same viewer as the caregiver's, and Close returns to this row. The child never edits the story or picks which one is attached.
- All done: the list ends with a large "All done!" picture. The screen does not change otherwise.
- Free time (S11) lists the always-available choices and, under them, this location's earnable rewards with their cost; one the child can afford has a Redeem button (caregiver toggle "Let [name] redeem rewards", default yes) that asks "Redeem X for N chips?" first. Chips are never taken away except by a redeem, so saving up works by itself.
- Bottom: a Free time button if enabled (opens S11) and the timer pill if a timer is running (opens S14). First-Then, if enabled, is a third button. Chipper Chart, if enabled (default on), is a fourth button opening S35 as a sheet reduced to bar, face, and minus/plus only.
- Screen stays awake while a timer runs.

Must not have: back navigation, settings, the tab bar, any text-only button, any destructive action.

### S33 Accept invite

From the email link. Shows who invited them and to which children. If signed out: Continue with Google or create account, then Accept. Lands on Today for the first assigned profile.

### S34 Share viewer

A page, no sign-in. Profile picture and name, the chip strip, today's list with check states, "Updated 3 minutes ago" with a refresh. Footer: "Shared from Chipperly". `noindex`. Nothing tappable except refresh.

### S35 Chipper Chart

A daily mood meter, matching the client's beta exactly (SOW Q5, resolved in favor of the beta's design; the per-task attitude prompt of S32 stays as an off-by-default toggle rather than being removed). Page header: Back, "Chipper Chart" and 😊.

White card: a "Basic" theme select and the sound mute toggle (🔊/🔇, the app-wide sounds setting) on one row; the meter row (round minus, a red-to-orange-to-green bar with tick marks at -3, -1, 1 and 3 and a round face marker, round plus); a big emoji for the current level; the paragraph "Approach your day with a chipperly attitude! Give yourself a plus when you did things with a positive mindset. Give yourself a minus for having a bad attitude."

Under the card: "Today" as words ("+2") and the last seven days (date, emoji, level, plus/minus tap counts).

The level runs -5 to +5, starts at 0, and is stored per day (`mood_events`, append-only): tapping minus/plus moves it by one, tapping the bar jumps straight to that point. A tone plays on every change (660Hz up, 330Hz down) unless muted.

Reached from a face button next to Today's chip strip (caregiver) and, if the lock option is on (default yes), a "Chipper Chart" button in S32's bottom row (opens this screen as a sheet, bar/face/minus-plus only, no theme, mute, blurb or history).

### S36 Visual schedule

The client's ask, direct: "everything can be broken down even further into steps as needed... when we need a visual schedule we can open that visual schedule up so those steps are the only thing on the screen." A visual schedule is an ordered list of steps, never a calendar.

Any step (S9) can itself be broken into sub-steps, to whatever depth the family needs; the step editor shows up to three levels and lets a step nest one level deeper each time, and a routine's steps show as a tree everywhere they appear (S6, S7, S32) rather than a flat list.

S36 is a full-screen overlay, not a route: it opens over whatever screen asked for it and closes back to it.

- Header: the activity's (or the one step's) picture and name, large.
- One row per step, in order, indented under its parent: picture, name, a large check circle. Nested steps show already expanded; there is nothing to tap open here, since this screen's whole point is to have every step on screen at once.
- Two icon buttons, top corner: Print and Close.
- Checking a step here is the same check as everywhere else (S6/S7/S32) and cascades the same way: checking a step with sub-steps checks them all, and completing every sub-step checks its parent.
- Print produces one page: the same picture-and-name rows at a larger size, no header buttons, no check circles, a page break never falls inside a row. It works offline like the rest of the app; there is nothing to fetch.

Opened from:

- S7's "Open as visual schedule" button, for the item's whole step tree, whenever the activity has steps.
- A small Open button on any step row in S7 that has its own sub-steps, showing just that step's own list.
- S32's "Steps" button on a row with steps, behind a lock option ("Let [name] open a step list", default on, S23). The child checks steps the same way, still locked.
- S9's "Print visual schedule" button, whenever the activity has steps: opens the same overlay read-only, for printing a clean copy before it is even added to a day (the client's cubby/desk/bathroom copies).

Each flow is counted in taps from the caregiver's Today tab.

| Flow | Taps | Path |
| --- | --- | --- |
| Check off a task | 1 | S6 check circle |
| Add an activity to today | 2 | + → tile |
| Create a new activity and add it | 4 + typing | + → Create new → name, picture → Save (it is added to today on save) |
| Give a chip | 2 | Chips tab → + |
| Choose the reward to work for | 3 | Chips → working-for card → tile |
| Redeem | 2 | Chips → Redeem |
| Start a 5-minute timer | 3 | Timer → 5 → Start |
| Show first-then | 3 | First-Then → tile → tile |
| Open a story | 2 | Stories → cover |
| Lock the device for the child | 3 | ⚙ → Lock this device → Lock |
| Unlock | 1 + PIN | 🔒 → digits |
| Switch child | 2 | avatar → name |
| Invite a therapist | 4 + typing | ⚙ → Care team → Invite → Send |

First run to a usable Today: sign in (1), who is this for (1), name and picture (typing + 1), ready (1). Four screens, no PIN, no tutorial.

## 8. Global patterns

- **Pictures**: the picture picker offers, in this order, emoji grid, photo library, camera, paste. Emoji first because it never fails offline and never needs permission. Photos are resized on device before storing. A missing photo (not yet synced) shows the emoji fallback if one was set, otherwise a neutral placeholder tile, never a broken image.
- **Toast with undo**: bottom, above the tab bar, five seconds, one at a time. Used for add, remove, check (in caregiver mode), redeem, delete.
- **Confirm sheet**: only for delete profile, remove member, regenerate share link, delete account, and "clear local data". Plain sentence, two buttons, the destructive one named for what it does ("Delete Benny's profile"), never "OK".
- **Empty states**: a picture, one sentence, one to three buttons that do the thing. Never a paragraph.
- **Errors**: inline, under the control that failed, plain language, a Retry where retry makes sense. Network errors are never shown for local actions because local actions cannot fail on the network.
- **Sync mark**: ⟳ in the top bar with three states (synced, pending with a small count, offline). Tap opens S31. It never animates continuously.
- **Loading**: none for local data. The only skeleton screen is the first sync of a newly visible profile.
- **Sound**: two sounds, chip earned and timer finished. Play only after a user gesture (platform rule). Global toggle in Settings, default on. Child mode follows the same toggle.
- **Motion**: 150 to 250 ms, ease-out, and only for state changes the user caused. Celebrations under 1.2 s. `prefers-reduced-motion` turns every animation into an instant state change with the same end result, and the attitude "good" celebration becomes a static badge.
- **Haptics**: a light tap on check and chip, where the platform allows. Never on errors.

## 9. Component inventory

Built once, used everywhere. Names are what the code will call them.

| Component | Used by | Rules |
| --- | --- | --- |
| TopBar | all caregiver screens | avatar chip, title or date, sync mark, gear |
| TabBar / TabRail | caregiver shell | five items, icon + label, current item marked by shape as well as by color |
| PictureTile | rows, pickers, panels, story covers | emoji or photo, square, three sizes (list 48, tile 96, child 56 to 120), alt text = name |
| CheckCircle | rows, steps | 48 px minimum, 64 in child mode, animated fill, `aria-checked` |
| ListRow | Today, library, history | handle, tile, name, secondary text, trailing control |
| StepRow | expanded steps | indented ListRow, no handle in child mode |
| ChipStrip | Today header, child header, share viewer | filled/empty chips plus reward tile |
| ChipBoard | Chips | large chips, read-only |
| BigButton | +, −, Start, Done, Lock | full-width or paired, 56 px tall minimum |
| Sheet | pickers, item detail, invite, share, lock, sync | drag handle, Close, one at a time |
| Picker | activities, rewards | search, Create new tile, Recent, All |
| PicturePicker | edit forms, profile | emoji grid, photo, camera, paste |
| Stepper | chips, cost, goal | − value + with a large value |
| Segmented | location, part of day, role | up to 4 items, falls back to a select |
| DateNav | Today | prev, label, next, Today jump, native date input |
| TimerRing | Timer, full screen, pill | SVG ring, time text, optional reveal image |
| StoryPage | viewer | picture, text, prev/next zones, dots, read-aloud |
| PinPad | unlock, set PIN | digits, dots, no keyboard |
| Toast | global | message, Undo, 5 s |
| EmptyState | Today, Stories, lists | picture, sentence, buttons |
| Celebration | check, redeem, first-then, all done | one implementation, respects reduced motion |
| SyncMark | TopBar | three states |

## 10. Type, spacing, and size rules

No colors here. Sizes and rhythm only.

- Base size 16 px in caregiver mode, 20 px in child mode, both scaling with the platform text-size setting (rem units, never px for text).
- Type scale: one body size, one secondary (0.875×), one heading (1.25×), one display for the timer and child names (2× or more). Four sizes, no more.
- Line length capped at 60 characters. Story text capped at 40 characters per line.
- Spacing on an 8 px grid. Row padding 16. Section gaps 24. Sheet padding 24.
- Touch targets: 48 × 48 minimum everywhere, 64 × 64 for check circles in child mode, 8 px between adjacent targets.
- Content max width 640 px. Child mode max width 720 px with tiles scaled up rather than more columns.
- Two brand typefaces: Altone for headings and display, Code Pro LC for body and labels, two weights each. Licensed files come from the client; Outfit and Montserrat stand in until then and in the Stitch mockups.
- Icons: one outline set, single stroke weight, always paired with a text label except inside the check circle and the picture tiles. Emoji are content (activities, rewards), never UI icons.
- Contrast: text 4.5:1 against its background, UI parts and focus rings 3:1, whatever the palette. State is never shown by color alone: checked has a check mark, current tab has a filled shape, offline has a glyph.

## 11. Accessibility

Baseline WCAG 2.2 AA. Specifics that matter for this audience:

- Every interactive element has a visible label or an `aria-label` equal to its visible meaning. Picture tiles announce the name.
- Check circles are real toggles (`role="checkbox"`, `aria-checked`) and announce "Brush teeth, checked".
- Expandable steps use `aria-expanded` on the chevron; steps are a nested list.
- Focus order follows reading order; focus ring is visible and 3:1.
- Sheets trap focus and return it on close. One sheet at a time makes this simple.
- No time limits on any interaction except the timer itself, which is the point.
- `prefers-reduced-motion` and `prefers-contrast` are honored automatically; both also have manual toggles in Settings because caregivers set up devices for someone else.
- Text scales with the OS setting up to 200% without horizontal scrolling. Tiles wrap; nothing truncates a name to one line without a full-name tooltip or wrap.
- The PIN pad is usable with a screen reader and does not rely on the shake.
- Read-aloud in the story viewer uses the platform speech API; no custom voices.
- Nothing flashes more than three times a second. Celebrations are soft.

## 12. Responsive rules

- Phone portrait is the design target. Everything above is drawn for it.
- Landscape phones and tablets: same single column, wider tiles, First-Then side by side, story viewer picture left and text right.
- 1024 px and up: tab bar becomes a left rail; content stays centered at 640 px. No dashboards, no side panels.
- Child mode on a tablet: bigger, not more. Row height 96, tiles 120, one column.
- Print: Today and any story print cleanly (one page each, pictures and names, no chrome). This is the "printable visual support" the reference planned and never built, and CSS gives it nearly for free.
- Print: a visual schedule (S36) prints cleanly too, at a larger size than Today, since these are the ones a caregiver actually hands to a teacher for a cubby, a desk, or the bathroom (client request). Opening it sets a print attribute on the page while it's open, so nothing else on the page (tab bar, top bar, any sheet underneath) shows up in the printed copy, only the schedule itself.

## 13. Content and microcopy

- Labels are one to three words, verbs where the control does something: Add, Done, Lock, Redeem, Send.
- No jargon on screen: "chips", not "tokens"; "working for", not "goal"; "how did it go", not "attitude".
- Sentences on empty states and confirmations are under twelve words.
- Names of people and things are always shown as the caregiver typed them.
- No exclamation marks except "All done!"
- Error text says what happened and what to do, in that order: "Couldn't send the invite. Check the email address and try again."

## 14. Open UX questions

These map to the SOW questions and are the only places the design branches.

| Question | Default in this plan | If the answer differs |
| --- | --- | --- |
| What can the child do beyond check-off (SOW Q4) | Check off, steps, attitude prompt, see chips; free time, first-then, timer view behind caregiver toggles | Add or remove buttons from S32's bottom row |
| Where the attitude prompt lives (SOW Q5) | After check-off, inline, dismissible | A smiley on every row instead, or a Today-level "how is today going" card |
| Who picks the location (SOW Q3) — decided | Caregiver on Chips by default; device remembers. A lock option ("Let [name] switch location", S23, off by default) lets the child pick from their own header (S32) instead | — |
| Redeem resets or subtracts (SOW Q1) — decided | Both are available: a setting per child (Edit profile, S22) chooses whether redeeming subtracts the cost from the balance or starts the board over at zero | — |
| Store apps (SOW Q12) | PWA install prompt on first visit | Adds an "Open in the app" banner and Apple sign-in on S1 |

## 15. What is deliberately not designed

A dashboard. A month calendar. A rewards "store" the child browses. Charts of progress. Notifications beyond the timer. A tutorial or coach marks (the empty states teach). Themes and avatar customization beyond one picture. Comments or chat between care team members. Anything that adds a screen to the child's view.
