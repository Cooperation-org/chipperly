import type { IconName } from '../components/Icon';
import { screens } from './screens';

// Copy carried over from the previous chipperlyapp.com (Aug 2026), so the
// owner's words and the phrases the old pages ranked for stay the same.

export const TOOLS: {
  id: string;
  icon: IconName;
  title: string;
  short: string;
  long: string;
  screen: (typeof screens)[keyof typeof screens];
  alt: string;
}[] = [
  {
    id: 'visual-schedule',
    icon: 'schedule',
    title: 'Visual Schedule',
    short: 'A picture-based daily plan that reduces anxiety and keeps everyone on the same page.',
    long: "See what's happening today with a simple picture-based breakdown of activities. Break routines into steps as needed, track rewards and goals, and give everyone a clear roadmap for the day. Helps with comprehension, motivation, and reduces anxiety.",
    screen: screens.today,
    alt: "Chipperly's Today screen: a morning routine, lunch, going home and homework, each with a picture and a time.",
  },
  {
    id: 'chip-board',
    icon: 'chips',
    title: 'Chip Board',
    short: 'Earn chips for positive behaviors and redeem customizable rewards, including built-in screentime control.',
    long: 'Earn chips for positive behaviors and redeem them for customizable rewards. Built-in screentime control turns a common challenge into a powerful motivator: screen time becomes something to earn, not argue about.',
    screen: screens.chips,
    alt: 'The chip board, working for a donut hole reward, with a Redeem button.',
  },
  {
    id: 'visual-timer',
    icon: 'timer',
    title: 'Visual Timer',
    short: 'Make transitions easier with a clear visual countdown that reduces surprises.',
    long: 'Help with transitions and the anxiety of not knowing "how much longer." A clear visual countdown makes the passage of time concrete and predictable, reducing meltdowns at transition time.',
    screen: screens.timer,
    alt: 'A visual timer counting down from five minutes, with preset buttons from one to thirty minutes.',
  },
  {
    id: 'social-stories',
    icon: 'stories',
    title: 'Social Stories',
    short: 'Prepare for new or stressful situations with simple visual narratives created in minutes.',
    long: 'Prepare for upcoming events (doctor visits, haircuts, new schools) with simple visual narratives you create in minutes. Practicing situations mentally before experiencing them builds confidence and reduces fear of the unknown.',
    screen: screens.stories,
    alt: 'The social stories library with two stories, "A Big Day" and "Fall Break!".',
  },
  {
    id: 'first-then',
    icon: 'firstThen',
    title: 'First – Then',
    short: 'A simple visual prompt: do the less-preferred task first, then get the reward.',
    long: 'A simple but powerful visual prompt: do the less-preferred task first, then get the reward. Removes negotiation from the equation and makes the link between effort and reward clear.',
    screen: screens.firstThen,
    alt: 'A First-Then board: first Bath Time, then Free Choice.',
  },
];

export const CARE_TEAM: { icon: IconName; title: string; text: string }[] = [
  { icon: 'team', title: 'Shared access', text: 'Invite therapists, teachers, and family members so everyone uses the same tools and stays consistent.' },
  { icon: 'lock', title: 'PIN-protected mode', text: 'Lock the app to a single profile for shared devices, so the individual sees only their own tools.' },
  { icon: 'link', title: 'Share links', text: 'Generate a read-only share link for any profile. The person you send it to does not need an account.' },
  { icon: 'offline', title: 'Works offline', text: 'Schedules, chips and timers keep working without a connection and sync when you are back online.' },
];

export const AUDIENCES = [
  { title: 'Families', text: 'Parents and caregivers who want clear, consistent visual supports at home without the craft project.' },
  { title: 'Educators & therapists', text: 'Teachers, therapists, and aides who need tools that work across settings and are easy to share.' },
  { title: 'Neurodivergent individuals', text: 'People who thrive with structure, visual cues, and positive reinforcement built into their day.' },
];

export const FAQS = [
  {
    question: 'Who is Chipperly for?',
    answer: 'Neurodivergent children and adults, and everyone who supports them: parents, caregivers, teachers, therapists and aides. It works for anyone who does better with structure and visual cues.',
  },
  {
    question: 'What are visual supports?',
    answer: 'Pictures and visual tools that show what is happening, what comes next and how long something lasts: picture schedules, token boards, timers, first-then boards and social stories. Chipperly puts all of them in one app instead of a stack of laminated cards.',
  },
  {
    question: 'Can the whole care team use the same schedules?',
    answer: 'Yes. Invite family members, teachers and therapists to a household so everyone works from the same schedules, chips and rewards. You can also send a read-only share link that needs no account.',
  },
  {
    question: 'Can I lock a shared tablet to one child?',
    answer: 'Yes. PIN-protected mode locks the device to one profile, so the child sees only their own tools and a caregiver PIN is needed to leave.',
  },
  {
    question: 'Does Chipperly work without internet?',
    answer: 'Yes. The app keeps working offline and syncs changes across devices when the connection comes back.',
  },
  {
    question: 'What devices does it run on?',
    answer: 'Chipperly runs in the browser on phones, tablets and computers, and can be added to the home screen like an app.',
  },
];
