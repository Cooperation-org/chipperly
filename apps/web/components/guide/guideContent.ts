/**
 * Copy for the "How to use Chipperly" guide (/settings/guide/).
 * DRAFT wording: the owner and client should review it before it ships.
 * Edit text here; GuideScreen only renders it.
 */

export interface GuideStory {
  title: string;
  pages: string[];
}

export interface GuideSection {
  /** Anchor id, also used by "More tips" links (/settings/guide/#id). */
  id: string;
  title: string;
  /** Short paragraphs, rendered in order. */
  paragraphs: string[];
  /** Optional tips list shown after the paragraphs. */
  bullets?: string[];
  example?: GuideStory;
  /** Optional button under the section. */
  action?: { label: string; href: string };
}

export const GUIDE_INTRO =
  'Chipperly is a set of small tools. Use the ones that help and leave the rest. Your child can have a say in all of it.';

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'start-small',
    title: 'Start small',
    paragraphs: [
      'One routine or one goal is enough to begin. You do not need to plan a whole day.',
      'Pick a moment that is already a bit hard or already works well, like getting dressed or winding down at night. Set up just that, try it for a week, then add more if you want to.',
    ],
  },
  {
    id: 'schedule',
    title: 'Picture schedule',
    paragraphs: [
      'A picture schedule shows what comes next, so your child can see the day instead of guessing at it. Many children find that calming.',
      'To introduce it, sit down together and look at it first. Say what each picture is. Let your child tap the check when something is done. That part is often their favourite.',
    ],
    bullets: [
      'Keep the order the same from day to day when you can.',
      'Use real photos if your child connects with them more than drawings.',
      'If a step does not work, change it. The schedule is there to help, not to be followed perfectly.',
    ],
  },
  {
    id: 'chips',
    title: 'Chips and rewards',
    paragraphs: [
      'There are two kinds of rewards. Free choices are always available, like a favourite song or a quiet corner. Earned rewards cost chips, and your child collects chips by finishing steps.',
      'Keep earned rewards small and quick. A reward that arrives soon after the effort is easier to connect with it. A big reward that takes weeks to reach is hard to hold on to.',
      'Let your child help pick the rewards. What they like is the best guide.',
    ],
  },
  {
    id: 'first-then',
    title: 'First-Then',
    paragraphs: [
      'First-Then shows two pictures: what to do first, and what happens after. It works well for a single step that is hard to start, like putting on shoes before going to the park.',
      'Say it out loud as you show it: "First shoes, then park." Keep the second picture something your child really likes, and always follow through.',
    ],
  },
  {
    id: 'timer',
    title: 'Timer',
    paragraphs: [
      'The timer shows time running out as a shape that shrinks, so your child does not need to read a clock.',
      'Use it for waiting, for how long an activity lasts, or for how long until something ends. Tell your child before you start it, and give a warning before time is up if transitions are tricky.',
    ],
  },
  {
    id: 'stories',
    title: 'Social stories',
    paragraphs: [
      'A social story is a short story with pictures about a situation your child is about to face. It is written in plain, literal, reassuring language.',
      'It helps because it lets your child preview something new or hard ahead of time. They find out what will happen, who will be there and what they can do, without the pressure of being in the moment.',
      'How to write one:',
    ],
    bullets: [
      'Keep it short. Four to six pages is plenty.',
      'Write in first person ("I will sit in the chair") or in a neutral voice ("Sam sits in the chair"). Use whichever sounds right for your child.',
      'Say what happens, who is there, how other people might feel, and what your child can do.',
      'Keep the tone positive and calm. Say what to do rather than what not to do.',
      'One idea per page.',
      'Add a real photo of the place or person when you can.',
      'Read it together beforehand, on a calm day. Do not wait until the moment is stressful.',
    ],
    example: {
      title: 'Going to the dentist',
      pages: [
        'Sometimes I go to the dentist. The dentist helps keep my teeth healthy.',
        'We go in the car. I wait in a room with chairs. Mum or Dad stays with me.',
        'The dentist says hello. They wear a mask and gloves. That is how they keep things clean.',
        'I sit in a big chair that goes back. The dentist looks at my teeth with a small mirror. Some children find the light bright or the sounds loud. I can ask for a break, or hold my favourite toy.',
        'When it is finished, the dentist says well done. We go home. Afterwards I can choose something I like.',
      ],
    },
    action: { label: 'Write a story', href: '/story/edit/' },
  },
  {
    id: 'sharing',
    title: 'Share with a therapist or family member',
    paragraphs: [
      'Other people can help set things up and see how it is going. Go to Settings, then Team, then Invite. Choose their role and which profile they can see, and send the invite.',
      'Everyone ends up working from the same routines and stories, so a therapist and a grandparent can both use the same wording.',
    ],
  },
  {
    id: 'shared-device',
    title: 'Using the app on a shared device',
    paragraphs: [
      'If your child uses the same phone or tablet as you, lock it to their view. Use the lock button at the top of the screen. Your child sees their own day and nothing else, and you need your PIN to get back to the caregiver side.',
      'In Settings you can choose what your child can see in that view, like free time, First-Then or the Chipper Chart.',
    ],
  },
];
