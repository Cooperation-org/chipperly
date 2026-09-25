// Three starter posts, written as plain Lexical JSON so the seed needs no
// editor runtime. The owner should rewrite or unpublish them.

type Node = Record<string, unknown>;

const text = (t: string, format = 0): Node => ({ type: 'text', text: t, format, version: 1, detail: 0, mode: 'normal', style: '' });
const block = (type: string, children: Node[], extra: Node = {}): Node => ({
  type,
  children,
  direction: 'ltr',
  format: '',
  indent: 0,
  version: 1,
  ...extra,
});
const p = (t: string) => block('paragraph', [text(t)], { textFormat: 0, textStyle: '' });
const h2 = (t: string) => block('heading', [text(t)], { tag: 'h2' });
const ul = (items: string[]) =>
  block(
    'list',
    items.map((t, i) => block('listitem', [text(t)], { value: i + 1 })),
    { listType: 'bullet', start: 1, tag: 'ul' },
  );
const doc = (...children: Node[]) => ({ root: block('root', children) }) as never;

export const POSTS = [
  {
    title: 'What is a visual schedule, and how do you start one?',
    slug: 'what-is-a-visual-schedule',
    faqs: [
      { question: "How many pictures should a visual schedule have?", answer: "Start with four to six for one part of the day, like the morning. Add more once that routine feels easy. Too many steps at once is harder to follow than no schedule at all." },
      { question: "Should I use photos or icons?", answer: "Either works. Photos of your own things (your sink, your child's shoes) are easiest to recognise at first; simple icons are quicker to make. Keep the same picture for the same activity every day." },
      { question: "What age is a visual schedule for?", answer: "Any age. Toddlers use two or three pictures; teenagers and adults often prefer a short list with small icons. Chipperly lets each profile have its own schedule." },
    ],
    excerpt: 'A visual schedule shows the day in pictures, in order. Here is why it helps and a simple way to set up your first one.',
    categories: ['visual-supports'],
    publishedAt: '2026-09-22T09:00:00.000Z',
    content: doc(
      p('A visual schedule is the day laid out in pictures, one activity after another: wake up, breakfast, get dressed, school. Instead of holding the plan in their head, a child (or adult) can look at it, see what is happening now and what comes next.'),
      h2('Why it helps'),
      p('Many neurodivergent people find uncertainty tiring. Not knowing what comes next, or when something ends, can turn an ordinary change into a hard moment. A schedule makes the plan visible and predictable, so there is less to guess and less to argue about.'),
      ul([
        'It answers "what now?" and "what next?" without a spoken reminder every time.',
        'It gives a sense of control: the person can check the plan themselves.',
        'It shows the whole care team the same plan, at home and at school.',
      ]),
      h2('Starting your first schedule'),
      p('Start small. Pick one part of the day that is often hard, like the morning, and break it into four to six steps. Use a picture for each step, whether that is a photo of your own bathroom sink or a simple icon. Go through the steps together the first few times and mark each one done as you go.'),
      p('Once that routine feels easy, add another part of the day. Keep the pictures the same from day to day so they become familiar.'),
      h2('Paper or app?'),
      p('Paper schedules work, but pieces get lost and every change means printing and laminating again. In Chipperly, a schedule is built from pictures in a few taps, a routine can be broken into smaller steps, and everyone on the care team sees the same plan on their own device.'),
    ),
  },
  {
    title: 'Five ways to make transitions easier',
    slug: 'five-ways-to-make-transitions-easier',
    faqs: [
      { question: "How early should I warn before a transition?", answer: "Five minutes is a good start for most children, with a second reminder at one or two minutes. A visual timer makes the countdown easier to follow than words alone." },
      { question: "What if my child still melts down at transitions?", answer: "Keep the routine the same every day and make the next step visible before it starts. Breaking the change into smaller steps, and praising the effort, helps more over weeks than any single trick." },
    ],
    excerpt: 'Stopping one thing and starting another is hard for many kids. These five small changes can make it calmer.',
    categories: ['routines', 'visual-supports'],
    publishedAt: '2026-09-23T09:00:00.000Z',
    content: doc(
      p('Leaving the playground, turning off a show, getting into the car: transitions are some of the hardest moments of the day for many neurodivergent children. A few habits can take a lot of the stress out of them.'),
      h2('1. Warn before the change'),
      p('A sudden stop feels unfair. A warning a few minutes ahead ("five more minutes, then shoes") gives time to finish up and get ready.'),
      h2('2. Make time visible'),
      p('"Five minutes" is abstract. A visual timer that shrinks as time passes makes it concrete, and the timer, not the adult, becomes the one who says it is time.'),
      h2('3. Use First, Then'),
      p('Pair the less-preferred task with what comes after it: first shoes, then park. Seeing the reward next to the task makes the reason to move clear.'),
      h2('4. Keep the plan in view'),
      p('When the day is on a visual schedule, a transition is just the next picture. It was already expected.'),
      h2('5. Notice the effort'),
      p('Praise or a chip for a smooth transition shows that the hard part was seen. Over time, the effort becomes the habit.'),
    ),
  },
  {
    title: 'Why we built Chipperly',
    slug: 'why-we-built-chipperly',
    faqs: [
      { question: "Who made Chipperly?", answer: "Taymar Pixleysmith, a mom in Tucson, Arizona, built Chipperly for her son Benny after finding no single app with all the visual supports he needed." },
      { question: "When does Chipperly launch?", answer: "Soon. Join the waitlist at the bottom of any page and we will email you the moment it opens." },
    ],
    excerpt: 'Chipperly started with one family, a stack of laminated cards and four different apps that each did one thing.',
    categories: ['news'],
    publishedAt: '2026-09-24T09:00:00.000Z',
    content: doc(
      p('Chipperly began with Taymar Pixleysmith and her son Benny. Visual supports helped Benny, but the tools did not help Taymar: laminated cards got lost, crafting new ones took evenings, and the apps she tried were expensive and each covered only one or two pieces of what he needed.'),
      p('One day she realized the problem was not her. The tools were failing both of them. So she set out to build one app with everything in it: a visual schedule, a chip board with screen time built in, a visual timer, first-then boards and social stories, shared with everyone who supports Benny.'),
      h2('What comes next'),
      p('Chipperly is launching soon. If you want to hear the moment it opens, join the waitlist at the bottom of this page.'),
    ),
  },
];
