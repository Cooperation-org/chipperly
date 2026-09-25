import { abs } from './site';

// Shared opening of /llms.txt and /llms-full.txt (https://llmstxt.org).
export const LLMS_INTRO = `# Chipperly

> Visual supports app for neurodivergent individuals and their families. Visual
> schedules, timers, chip boards, first-then boards and social stories in one
> dashboard, shareable with a whole care team.

Chipperly is made by Chipperly LLC, founded in Tucson, Arizona, by Taymar
Pixleysmith. It was built after she watched her son struggle with everyday
routines and transitions, and found that existing tools were low-tech,
expensive, or each solved only one piece of the problem.

The product replaces three or four separate apps or laminated paper tools:

- **Visual schedule**: a picture-based breakdown of the day, with routines
  broken into steps.
- **Chip board**: earn chips for positive behaviors and redeem them for
  customizable rewards, including screen time.
- **Visual timer**: a countdown that makes the passage of time concrete and
  predictable, easing transitions.
- **First-Then board**: pairs a task with the reward that follows it.
- **Social stories**: short picture stories that prepare someone for an
  upcoming event.

It is multi-user (family, teachers and therapists share one household), has a
PIN-locked child mode for shared devices, read-only share links, and works
offline in the browser on phones, tablets and computers.

## Pages

- [Home](${abs('/')}): What Chipperly is, with screens from the app.
- [Features](${abs('/features')}): The visual support tools in detail, plus FAQ.
- [About](${abs('/about')}): The story behind Chipperly.
- [Blog](${abs('/blog')}): Articles on visual supports and routines.
- [Full text](${abs('/llms-full.txt')}): Every page and blog post in one Markdown file.
`;
