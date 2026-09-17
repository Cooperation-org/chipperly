export interface StoryTemplatePage {
  readonly text: string;
  readonly emoji: string;
}

export interface StoryTemplate {
  readonly title: string;
  readonly emoji: string;
  readonly pages: readonly StoryTemplatePage[];
}

export type StoryTemplateKey = 'haircut' | 'doctor' | 'new_place' | 'big_day';

/** Starter pages for S16's four empty-state templates. */
export const STORY_TEMPLATES: Record<StoryTemplateKey, StoryTemplate> = {
  haircut: {
    title: 'Getting a Haircut',
    emoji: '💇',
    pages: [
      { text: 'Today I am getting a haircut.', emoji: '💇' },
      { text: 'We go to the hair salon.', emoji: '🏢' },
      { text: 'I sit in a big chair.', emoji: '💺' },
      { text: 'A cape goes around my neck.', emoji: '🧣' },
      { text: 'I hear scissors snipping.', emoji: '✂️' },
      { text: 'It feels a little tickly.', emoji: '😊' },
      { text: 'My hair looks great!', emoji: '✨' },
    ],
  },
  doctor: {
    title: 'Visiting the Doctor',
    emoji: '🩺',
    pages: [
      { text: 'Today I am seeing the doctor.', emoji: '🩺' },
      { text: 'We wait in the waiting room.', emoji: '🪑' },
      { text: 'A nurse checks my height.', emoji: '📏' },
      { text: 'The doctor listens to my heart.', emoji: '❤️' },
      { text: 'I can ask questions too.', emoji: '💬' },
      { text: 'Then we are all done.', emoji: '✅' },
    ],
  },
  new_place: {
    title: 'Going Somewhere New',
    emoji: '🗺️',
    pages: [
      { text: 'Today we are going somewhere new.', emoji: '🗺️' },
      { text: 'New places can feel different.', emoji: '🤔' },
      { text: 'I can look around slowly.', emoji: '👀' },
      { text: 'I can stay close to my grown-up.', emoji: '🤝' },
      { text: 'It is okay to feel unsure at first.', emoji: '💛' },
      { text: 'Soon this place will feel familiar.', emoji: '🌟' },
    ],
  },
  big_day: {
    title: 'A Big Day',
    emoji: '🎉',
    pages: [
      { text: 'Today is a big day.', emoji: '🎉' },
      { text: 'Big days can feel exciting.', emoji: '😄' },
      { text: 'Big days can feel tiring too.', emoji: '😮‍💨' },
      { text: 'I can take breaks if I need to.', emoji: '🧘' },
      { text: 'I can take slow, deep breaths.', emoji: '🌬️' },
      { text: 'I am ready for today.', emoji: '💪' },
    ],
  },
};
