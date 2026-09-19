# Roadmap: the owner's notes, line by line

The owner's "Notes on App So Far" (Google Doc, link in the team channel) turned into a checklist, in her order and her words, with what the rebuild does about each line. Status as of 19 Sept 2026. Legend: **built** (in the app and covered by tests), **partly** (some of it), **not built**, **skipped on purpose** (with the reason). Screen numbers (S6, S32...) are `docs/ux-plan.md`.

## Dashboard

| # | She wrote | Status | Where / why |
| --- | --- | --- | --- |
| 1 | "Is there an ability to have more than one account? ... does the name become a drop-down menu" | built | The child's name in the top bar is the profile switcher; an account holds several children and a person can belong to several accounts (S3, S29). |
| 2 | "grey out with Coming Soon the parts of the dashboard that aren't flushed out yet" | skipped on purpose | Nothing unfinished is shown. There is no dashboard; five tabs, all working. |
| 3 | "Chip board emoji is kind of abstract, maybe a star instead?" | built | Her twelve-ray star is the chip on the board and in the top strip, and the check mark on a done task (`components/ui/ChipStar.tsx`). |
| 4 | "Where should we add the Chipper Chart?" | built | In the child's view, bottom bar (S32/S35): a -5 to +5 meter with sounds, saved per child per day. Chips remember the level they were earned at; a profile setting colours the board by it. |

## My Day, for the admin

| # | She wrote | Status | Where / why |
| --- | --- | --- | --- |
| 0 | "It's pretty tough starting from nothing with a plus button" | built | A starter day plan is seeded with the first profile (wake up, breakfast ... sleep; school items on weekdays). Every item can be removed for the day or for good. |
| 1 | "preprogrammed activities and routines, as well as customizable ... repeated daily or weekly, with ... variations for weekends vs weekdays" | built | Library of activities and routines, custom ones with a picture, repeat daily / weekdays / weekends / weekly on chosen days, with an optional time (S6, S8, S9, S25). |
| 2 | "copy and paste images from internet, upload images or take photos" | built | Picture picker: paste, upload, camera, or emoji, on activities, steps, rewards, locations, profiles, story pages. Uploads are compressed to WebP on the server. |
| 3 | "Schedule can be time-based but shouldn't have to be ... steps to a routine ... having to put a time to each ... is unnecessary" | built | Time is optional; ordering is by hand, with an optional morning / afternoon / evening grouping. Steps have no time unless you give one a number of minutes to start a timer. |
| 4 | "change the order of activities without having to delete and start over" | built | Reorder from the item sheet (S7). |
| 5 | "assign chip value to certain tasks as well as to rewards" | built | `chip_value` on activities and steps, `chip_cost` on rewards; the board goal follows the chosen reward's cost. |
| 6 | "prompted daily, weekly or monthly to update the schedule" | not built | Proposal: a settings choice (off / weekly / monthly) that shows a calm banner on Today when the plan has not changed in that long. Small; waiting on her to say she wants it. |
| 7 | "location based free time ... choices always available, with location-based rewards that have to be earned only showing as available if ... earned enough" | built | Rewards and free-time choices are one list per location, each either costing chips or always available (her Reward Library suggestion). Free time shows the always-available ones; earned ones show with their cost and can be redeemed when affordable (see EI 6). |
| 8 | "incorporate the chipper chart ... visual timers and social stories ... a dentist appointment ... a social story that Benny could click on" | built | Chipper Chart: above. Timers: any step can carry minutes and start the timer. A social story can be attached to any Today item; the child sees a "Read story" button on it (19 Sept 2026). |
| 9 | "set a goal and a reward for each part of the schedule, and ... view by the day or by the routine ... pizza ... donut hole" | built | Each routine can carry a goal ("get to camp on time") and a reward; the day has a standing goal, reward and optional chip budget; the Chips tab shows Place / Routine / Day (19 Sept 2026). |
| 10 | "information at the top about relevant things for him to prepare for that day, and at the bottom after bedtime it would prepare him for the next day" | built | Child's Today has a band at the top (day, the caregiver's note for today, what he is working for) and one at the bottom (tomorrow's note and first things). Caregivers write the note from Today (19 Sept 2026). |

## My Day, for the Empowered Individual

| # | She wrote | Status | Where / why |
| --- | --- | --- | --- |
| 1 | "View my day at a glance, with the option of viewing schedule by week or by routine" | partly | Day view, routines expand in place. No week view in the child's view; the caregiver's Today moves day by day. Proposal: a seven-day strip above the child's list. |
| 2 | "select what reward I'm currently working for" | built | Tapping the working-for area in the child's view opens this location's rewards; a caregiver switch turns it off (19 Sept 2026). |
| 3 | "check off activities ... visually very rewarding" | built | The check becomes her star, a chip pops onto the strip, a soft sound plays, "All done!" when the day is complete. |
| 4 | "progress bar that shows me how close I am to being able to collect my reward" | built | Chip strip in the child header (earned of goal, reward picture); the board on the Chips tab. |
| 5 | "Routines ... collapsed into one activity that can be checked off as a whole, or opened into a series of steps" | built | Steps toggle on a routine row; checking the row completes every step; steps can nest one level for the Visual Schedule. |
| 6 | "select choice or reward during free time, depending on how many chips ... (Should be able to save chips for later too)" | built | Free time lists the always-available choices and the earned rewards with their cost; an affordable one can be redeemed by the child (caregiver switch). Chips carry over; redeem subtracts (or resets, a setting) (19 Sept 2026). |

## Chip board

| # | She wrote | Status | Where / why |
| --- | --- | --- | --- |
| 1 | "custom rewards with option to take images from internet, with a camera or as a file upload" | built | Reward editor with the picture picker (S19). |
| 2 | "when the location is selected ... the reward board matches that location's reward board" | built | Board, balance and rewards are per location; locations are real records, so renaming one keeps its board. |
| 3 | "A blank chip board shows a blank image in the middle, with 5 blank chips underneath. When the user clicks on the blank image, it takes them to a location-based rewards page" | built | "Working for: Choose a reward" opens this location's rewards; the goal becomes the reward's cost (S10). |
| 4 | "Once the reward is selected, blank chips appear that represent how many chips need to be earned" | built | Same. |
| 5 | "pretty messy interface, could be made cleaner" | built | Redesigned to the brand kit; checked at phone, tablet and desktop for overflow and 48px targets. |

## Choice board

| She wrote | Status | Where / why |
| --- | --- | --- |
| "make this location based, and prompt people to take pictures of things that are available whenever a person has free time ... a plus button with option to take or upload a picture" | built | Free-time choices are rewards marked "always available", per location, with the camera picker; the child opens them from the Free time button (S11). |

## My timer

| She wrote | Status | Where / why |
| --- | --- | --- |
| "no way to adjust the time manually by typing it in" | built | Typed minutes plus presets (S13). |
| "a photograph in the middle that could be revealed as the time passes" | built | Optional picture that reveals as the ring empties (S14). |
| "the app we use ... called countdown" | skipped on purpose | Ours is the ring with reveal; no attempt to copy that app's look. |

## Social stories

| She wrote | Status | Where / why |
| --- | --- | --- |
| "no way to add a new social story or edit an existing social story ... a good social story template" | built | Caregivers write stories per child: pages with a photo or emoji and a sentence, templates to start from (S20-S23). The four preset stories are gone. |
| "upload the social stories she's already created" | not built | PDF or image-set import is not in; stories are rebuilt page by page with her photos. Would need a PDF-to-pages step; ask whether the BCBA's stories are PDFs or slides. |
| Reading Rainbow story | n/a | Story videos have nowhere to go in the new app; photos and text move over with the importer. |

## First-then

| She wrote | Status | Where / why |
| --- | --- | --- |
| "the first is autopopulated with lunch which was confusing" | built | Starts empty (S15). |
| "a custom first and custom then ... a plus box at the end that would give the ability to add photos" | built | Both sides pick from the library, with "Create new" at the top of every picker. |

## Reward library

| She wrote | Status | Where / why |
| --- | --- | --- |
| "combine the choice and rewards, and just indicate whether this is something that is always available during free time or if there need to be chips earned ... where a location could be added ... customize new rewards with images, and indicate how many chips a reward costs" | built | Exactly this: one list, always-available flag, location, picture, chip cost (S25). She confirmed the merge on 18 Sept. |

## Care team

| She wrote | Status | Where / why |
| --- | --- | --- |
| "I've tried inviting Chris via the email system and it is not working yet" | built, with a caveat | Invites work by email when a mail key is set, and always by link: the invite sheet shows the accept link to copy and send by text (S26/S27). The demo has no mail key yet, so on the demo the link is the way (see MAIN.md). |

## Settings

| She wrote | Status | Where / why |
| --- | --- | --- |
| "doesn't do much yet but I like that it exists" | built | Profiles, care team, share link, account, per-child settings: redeem mode, chips coloured by attitude, per-task attitude prompt, child can choose the reward, child can redeem. |

## Not in her doc, waiting on her

- Railway database dump and R2 / Spaces credentials, to import the beta families (`docs/import-rails.md`).
- Licensed Altone / Code Pro LC web fonts, or keep Alegreya (shipped now).
- Google client id for Google sign-in; Apple only if store apps happen.
- Counsel review of the privacy and terms drafts; HIPAA expectations, if any.
- Hosting decision for production (our dedicated VM or her account).
- The attitude-bonus reward (proposal in the 18 Sept meeting note): not started.
