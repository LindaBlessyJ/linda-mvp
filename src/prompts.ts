export type PromptKind = 'truth' | 'dare'

export const prompts: Record<PromptKind, string[]> = {
  truth: [
    'What is one small thing that made you happy recently?',
    'What skill would you love to learn, and why?',
    'What is a kind thing someone did that you still remember?',
    'What is one goal you want to work toward this year?',
    'Which fictional world would you visit for one day?',
    'What is a mistake that taught you something useful?',
    'What is one quality you value in a friend?',
    'What song or sound instantly improves your mood?',
    'What is something you are proud of learning?',
    'If you could solve one everyday problem, what would it be?',
  ],
  dare: [
    'Describe your day like a sports commentator for 15 seconds.',
    'Invent a friendly handshake and teach it to the group.',
    'Make up a two-line song about your favourite snack.',
    'Say three encouraging words to the group.',
    'Draw a star in the air using your elbow.',
    'Give an imaginary product a funny but kind advertisement.',
    'Name five animals in ten seconds.',
    'Tell a short story using the words moon, bicycle, and mango.',
    'Do your best robot voice for one sentence.',
    'Give yourself a made-up superhero name and explain its power.',
  ],
}