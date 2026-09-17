# UI primitives

Every component here reads color, spacing, radius and motion from `app/styles/tokens.css` and nothing else. No hard-coded hex or px outside the token files. `'use client'` is only on components that hold state or attach an event handler; purely presentational ones (`Field`, `EmptyState`) stay server-renderable.

**Icon** (`name`, `size = 24`, `title?`) — the app's one outline icon set (check, plus, minus, chevron, more, clock, star, lock, gear, sync, camera, image, trash, drag, close, play, pause, arrowLeft, arrowRight, share, users, home, book, timer, split, chips) as inline SVG, 24px viewBox, stroke 2, round caps. `aria-hidden` unless you pass `title`, so pair it with visible text or an `aria-label` on the parent control.

**Button** (`variant: primary | secondary | ghost | danger`, `size: md | lg`, `fullWidth?`, `loading?`, `icon?`) — the standard button for forms, dialogs and secondary actions. `loading` disables it and sets `aria-busy`. Use `danger` only for destructive confirms.

**BigButton** (`variant: primary | secondary | accent`, `fullWidth?`, `icon?`) — the single big obvious action on a screen: +, −, Start, Done, Lock, Redeem. 56px minimum, display font. Don't put more than one or two on a screen.

**IconButton** (`icon`, `aria-label` required, `variant: plain | solid | muted`, `size = 24`) — a 48×48 tap target holding one icon and nothing else. Always needs a real `aria-label`; there is no visible fallback label.

**Sheet** (`SheetHost`, `useSheet()`, `Confirm`) — the bottom-sheet system. Mount `<SheetHost/>` once near the app root. Anywhere else, call `useSheet()` to get `{ open(content, opts?), replace(content, opts?), back(), close(), isOpen }`; `opts` is `{ title?, onClose? }`. `open` pushes onto a stack (only the top renders), `back` pops one level, `close` clears the whole stack. Traps focus, locks body scroll, closes on Escape or a >120px downward drag, returns focus on close, and centers itself at 560px wide on screens ≥1024px. `Confirm` (`title`, `body`, `confirmLabel`, `danger?`, `onConfirm`, `onCancel`) is a ready-made content component for the delete/remove/regenerate confirm pattern — pass it straight to `open()`.

**toast / ToastHost** (`apps/web/lib/toast.tsx`) — `toast(message, { undo?, action?, onAction?, duration_ms = 5000 })` shows one message at a time above the tab bar for 5 seconds with an optional 48px action button (`undo` is shorthand for an "Undo" action). Mount `<ToastHost/>` once near the app root, same as `SheetHost`.

**CheckCircle** (`checked`, `onChange?`, `name`, `size: md | lg`, `disabled?`) — a real `role="checkbox"` styled as a circle, with `aria-checked` and an `aria-label` of "`name`, checked/not checked". `md` uses the `--tap` token, so it's 48px in caregiver mode and 64px in child mode automatically; `lg` is always 64px. The check mark draws in over 220ms unless motion is reduced.

**PictureTile** (`emoji?`, `photo_id?`, `photoUrl?`, `name`, `size: list | grid | child`) — the square picture used everywhere: rows, pickers, story covers. Shows the photo when `photoUrl` resolves, a skeleton while a `photo_id` is set but not yet resolved, the emoji when there's no photo, and a neutral placeholder icon when there's nothing at all. `alt`/`aria-label` is always `name`.

**ListRow** (`handle?`, `tile`, `name`, `secondary?`, `trailing?`, `dimmed?`, `onTap?`) — the row used on Today, library lists and history: drag handle, picture, name, secondary text, trailing control. The whole row is tappable except the `handle` and `trailing` slots, which are pulled out of the tap target on purpose (drag handles and a trailing check circle need their own hit target). `dimmed` is for completed items that stay in place.

**StepRow** (`tile`, `name`, `checked`, `onChange`) — an indented `ListRow` with no handle and its own `CheckCircle` as the trailing control, for steps expanded under a parent activity.

**ChipStrip** (`filled`, `total`, `reward?: { emoji?, photo_id?, photoUrl?, name }`, `onTap?`, `size: md | lg`) — the compact chip row plus working-for reward used in the Today header, the child header and the share viewer. Renders as a button when `onTap` is given, otherwise a read-only `role="img"`.

**ChipBoard** (`filled`, `total`) — the large, read-only, wrapping chip grid on the Chips tab. The most recently earned chip pops in over 220ms; older chips don't re-animate.

**Stepper** (`value`, `min`, `max`, `onChange`, `step = 1`, `label`) — a − / big value / + control with `role="spinbutton"` and `aria-valuenow`/`min`/`max`. Used for chip cost, reward cost and the manual goal.

**Segmented** (`items: { value, label }[]`, `value`, `onChange`, `label`) — up to 4 items as a `role="radiogroup"`; automatically falls back to a native `<select>` above 4 items so location, part-of-day and role pickers stay usable at any length.

**EmptyState** (`picture?`, `sentence`, `actions?` up to 3) — a picture slot, one sentence, up to three action buttons. Used for an empty Today, empty Stories, empty library lists. Never render a paragraph here.

**Celebration** (`kind: check | redeem | all_done | first_then`, `onDone`) — a soft, decorative burst of dots around a badge, 1.2s, calling `onDone` when it's finished (300ms instead of 1.2s, and no dots, under reduced motion — the badge alone is the celebration then). It's `aria-hidden`; the real state change should already be announced by whatever caused it (a checked box, a redeemed reward).

**SyncMark** (`state: synced | pending | offline | error`, `pending?`, `onTap?`) — the ⟳ glyph in the top bar with an optional pending count badge. Never animates continuously; state is shown by icon color and the count, not motion.

**TopBar** (`profile: { name, emoji?, photo_id?, photoUrl? } | null`, `onProfileTap?`, `title?`, `sync`, `onSyncTap?`, `onSettingsTap?`) — the 56px caregiver header: avatar chip + profile name (tap to switch) or a plain title, a `SyncMark`, and a settings gear.

**TabBar** / **TabRail** (`items: { href, label, icon }[]`) — the five-tab navigation. `TabBar` is the fixed bottom bar below 1024px (`height: var(--tabbar-h)`, safe-area padding); `TabRail` is the fixed 88px-wide left rail shown only at 1024px and up. Both read the current route from `usePathname()` and mark the active item with a filled pill as well as color, never color alone.

**TextField** (`label`, `hint?`, `error?`, plus standard `<input>` props like `type`, `autoComplete`, `inputMode`) — a single 48px labeled input built on `Field`, with `aria-invalid`/`aria-describedby` wired to the error or hint text.

**Field** (`label`, `htmlFor?`, `hint?`, `error?`, `messageId?`, `children`) — the generic label + control + hint/error wrapper `TextField` is built on. Reach for it directly when the control isn't a plain `<input>` (a `Segmented`, a `Stepper`, a custom picker).

**Skeleton** (`width?`, `height?`, `radius?`) — a shimmering placeholder block. Only used for the one skeleton screen in the app: first sync of a newly visible profile.

**VisuallyHidden** (`as?`, `children`) — content read by screen readers but never shown, for labeling controls that already have a clear visual purpose without spare room for text (the `Segmented` select fallback, icon-only buttons that already pass `aria-label` some other way).
