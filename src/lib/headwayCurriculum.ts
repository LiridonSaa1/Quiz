export interface HeadwayLesson {
  title: string;
  type: 'video' | 'text';
  description: string;
}

export interface HeadwayUnit {
  title: string;
  description: string;
  lessons: HeadwayLesson[];
}

const UNIT_LESSONS: HeadwayLesson[] = [
  { title: 'Grammar',         type: 'video', description: 'Grammar focus and practice exercises for this unit.' },
  { title: 'Vocabulary',      type: 'video', description: 'Key vocabulary words and usage for this unit.' },
  { title: 'Reading',         type: 'text',  description: 'Reading comprehension text and activities.' },
  { title: 'Listening',       type: 'video', description: 'Listening exercises with audio and comprehension tasks.' },
  { title: 'Speaking',        type: 'video', description: 'Speaking practice and pronunciation activities.' },
  { title: 'Writing',         type: 'text',  description: 'Writing task with model answers and guided practice.' },
  { title: 'Everyday English',type: 'video', description: 'Real-life conversational English in context.' },
];

function makeLessons(unitTitle: string): HeadwayLesson[] {
  return UNIT_LESSONS.map(l => ({
    ...l,
    title: `${unitTitle} — ${l.title}`,
  }));
}

export const HEADWAY_CURRICULUM: Record<string, HeadwayUnit[]> = {
  'Beginner': [
    { title: 'Unit 1 — Hello!',                 description: 'Greetings, introductions and basic personal information.', lessons: makeLessons('Unit 1') },
    { title: 'Unit 2 — Your world',              description: 'Countries, nationalities and describing where you are from.', lessons: makeLessons('Unit 2') },
    { title: 'Unit 3 — All about you!',          description: 'Personal information, jobs and family.', lessons: makeLessons('Unit 3') },
    { title: 'Unit 4 — Family and friends',      description: 'Talking about family members and describing people.', lessons: makeLessons('Unit 4') },
    { title: "Unit 5 — It's my life!",           description: 'Daily routines, likes and dislikes.', lessons: makeLessons('Unit 5') },
    { title: 'Unit 6 — Every day',               description: 'Everyday activities and telling the time.', lessons: makeLessons('Unit 6') },
    { title: 'Unit 7 — Places I like',           description: 'Describing places and talking about towns and cities.', lessons: makeLessons('Unit 7') },
    { title: 'Unit 8 — Clothes and colours',     description: 'Shopping for clothes, colours and describing what people wear.', lessons: makeLessons('Unit 8') },
    { title: 'Unit 9 — Food and drink',          description: 'Ordering food, talking about meals and cooking.', lessons: makeLessons('Unit 9') },
    { title: 'Unit 10 — I can do it!',           description: 'Talking about abilities and making requests.', lessons: makeLessons('Unit 10') },
    { title: 'Unit 11 — The past',               description: 'Talking about past events and telling life stories.', lessons: makeLessons('Unit 11') },
    { title: 'Unit 12 — Thank you and goodbye!', description: 'Making plans, saying goodbye and reviewing the course.', lessons: makeLessons('Unit 12') },
  ],

  'Elementary': [
    { title: 'Unit 1 — Getting to know you',          description: 'Meeting people and sharing personal information.', lessons: makeLessons('Unit 1') },
    { title: 'Unit 2 — Work hard, play hard!',        description: 'Jobs, routines and leisure activities.', lessons: makeLessons('Unit 2') },
    { title: "Unit 3 — It's a wonderful world!",      description: 'Countries, languages and world knowledge.', lessons: makeLessons('Unit 3') },
    { title: 'Unit 4 — Eat, drink and be merry!',     description: 'Food, drink and eating out.', lessons: makeLessons('Unit 4') },
    { title: 'Unit 5 — A sense of history',           description: 'Historical events and biographies.', lessons: makeLessons('Unit 5') },
    { title: 'Unit 6 — Time off',                     description: 'Free time, hobbies and weekend activities.', lessons: makeLessons('Unit 6') },
    { title: 'Unit 7 — Passions!',                    description: 'Talking about things you love and feel strongly about.', lessons: makeLessons('Unit 7') },
    { title: 'Unit 8 — How things began',             description: 'Inventions and the history of everyday things.', lessons: makeLessons('Unit 8') },
    { title: 'Unit 9 — Changing times',               description: 'Changes in society, life and technology.', lessons: makeLessons('Unit 9') },
    { title: 'Unit 10 — How does that make you feel?',description: 'Emotions, feelings and expressing opinions.', lessons: makeLessons('Unit 10') },
    { title: 'Unit 11 — In my life',                  description: 'Personal experiences and important life events.', lessons: makeLessons('Unit 11') },
    { title: 'Unit 12 — Looking ahead',               description: 'Future plans, hopes and ambitions.', lessons: makeLessons('Unit 12') },
  ],

  'Pre-Intermediate': [
    { title: 'Unit 1 — No place like home',       description: 'Homes, houses and living spaces.', lessons: makeLessons('Unit 1') },
    { title: 'Unit 2 — Whatever makes you happy!',description: 'Happiness, lifestyle and what matters to people.', lessons: makeLessons('Unit 2') },
    { title: 'Unit 3 — What happened next?',      description: 'Telling stories and narrative past tenses.', lessons: makeLessons('Unit 3') },
    { title: 'Unit 4 — Doing the right thing',    description: 'Rules, obligations and moral dilemmas.', lessons: makeLessons('Unit 4') },
    { title: 'Unit 5 — On the road',              description: 'Travel, transport and holiday experiences.', lessons: makeLessons('Unit 5') },
    { title: "Unit 6 — Life's great events",      description: 'Celebrations, milestones and life events.', lessons: makeLessons('Unit 6') },
    { title: 'Unit 7 — Learning for life',        description: 'Education, learning styles and schools.', lessons: makeLessons('Unit 7') },
    { title: 'Unit 8 — A matter of opinion',      description: 'Giving opinions, agreeing and disagreeing.', lessons: makeLessons('Unit 8') },
    { title: 'Unit 9 — Buying and selling',       description: 'Shopping, money and consumer culture.', lessons: makeLessons('Unit 9') },
    { title: 'Unit 10 — All things high-tech',    description: 'Technology, gadgets and the digital world.', lessons: makeLessons('Unit 10') },
    { title: 'Unit 11 — What a story!',           description: 'News stories, media and storytelling.', lessons: makeLessons('Unit 11') },
    { title: "Unit 12 — It's never too late!",    description: 'Ambitions, second chances and life goals.', lessons: makeLessons('Unit 12') },
  ],

  'Intermediate': [
    { title: 'Unit 1 — A world of difference',        description: 'Comparing cultures and ways of life around the world.', lessons: makeLessons('Unit 1') },
    { title: 'Unit 2 — Buying and selling',           description: 'The world of commerce, advertising and consumerism.', lessons: makeLessons('Unit 2') },
    { title: 'Unit 3 — What is beauty?',              description: 'Concepts of beauty, art and aesthetic judgement.', lessons: makeLessons('Unit 3') },
    { title: 'Unit 4 — Never stop learning',          description: 'Lifelong learning, education systems and study skills.', lessons: makeLessons('Unit 4') },
    { title: 'Unit 5 — A short history of sport',     description: 'Sports history, famous athletes and competition.', lessons: makeLessons('Unit 5') },
    { title: 'Unit 6 — The right person for the job', description: 'Work, careers, job applications and interviews.', lessons: makeLessons('Unit 6') },
    { title: 'Unit 7 — Cultures meeting',             description: 'Cross-cultural communication and global society.', lessons: makeLessons('Unit 7') },
    { title: "Unit 8 — It's a crime",                 description: 'Crime, justice and the law.', lessons: makeLessons('Unit 8') },
    { title: 'Unit 9 — Travel the world',             description: 'Travel experiences, tourism and world destinations.', lessons: makeLessons('Unit 9') },
    { title: 'Unit 10 — Our future',                  description: 'Environmental issues, predictions and global challenges.', lessons: makeLessons('Unit 10') },
    { title: 'Unit 11 — Telling stories',             description: 'Literature, fiction and the art of storytelling.', lessons: makeLessons('Unit 11') },
    { title: 'Unit 12 — Music of the night',          description: 'Music, entertainment and cultural expression.', lessons: makeLessons('Unit 12') },
  ],

  'Upper-Intermediate': [
    { title: 'Unit 1 — My world',                       description: 'Personal identity, background and modern life.', lessons: makeLessons('Unit 1') },
    { title: 'Unit 2 — All in the mind?',               description: 'Psychology, memory and the human brain.', lessons: makeLessons('Unit 2') },
    { title: 'Unit 3 — Getting and spending',           description: 'Money, economics and consumerism.', lessons: makeLessons('Unit 3') },
    { title: 'Unit 4 — It depends how you look at it',  description: 'Different perspectives and critical thinking.', lessons: makeLessons('Unit 4') },
    { title: 'Unit 5 — Clues to the past',              description: 'History, archaeology and ancient civilizations.', lessons: makeLessons('Unit 5') },
    { title: 'Unit 6 — Writing and speaking',           description: 'Communication skills — written and spoken English.', lessons: makeLessons('Unit 6') },
    { title: 'Unit 7 — Success and failure',            description: 'Ambition, achievement and learning from mistakes.', lessons: makeLessons('Unit 7') },
    { title: 'Unit 8 — First world problems?',          description: 'Modern society, inequality and global issues.', lessons: makeLessons('Unit 8') },
    { title: 'Unit 9 — Places and communities',         description: 'Urban and rural life, community and belonging.', lessons: makeLessons('Unit 9') },
    { title: 'Unit 10 — Science and technology',        description: 'Scientific discoveries and technological innovation.', lessons: makeLessons('Unit 10') },
    { title: 'Unit 11 — Language and communication',    description: 'How language works and how we communicate.', lessons: makeLessons('Unit 11') },
    { title: 'Unit 12 — The big picture',               description: 'Global issues, the future and big ideas.', lessons: makeLessons('Unit 12') },
  ],

  'Advanced': [
    { title: 'Unit 1 — Meeting people and places',  description: 'First impressions, social interactions and places.', lessons: makeLessons('Unit 1') },
    { title: 'Unit 2 — Getting on and getting away',description: 'Relationships, travel and escaping everyday life.', lessons: makeLessons('Unit 2') },
    { title: "Unit 3 — What's in the news?",        description: 'Media literacy, news reporting and current events.', lessons: makeLessons('Unit 3') },
    { title: 'Unit 4 — Hard times',                 description: 'Challenges, adversity and resilience.', lessons: makeLessons('Unit 4') },
    { title: 'Unit 5 — Divided loyalties',          description: 'Conflicting values, ethics and moral choices.', lessons: makeLessons('Unit 5') },
    { title: 'Unit 6 — I love literature',          description: 'English literature, books and literary analysis.', lessons: makeLessons('Unit 6') },
    { title: 'Unit 7 — Talking business',           description: 'Business English, the economy and entrepreneurship.', lessons: makeLessons('Unit 7') },
    { title: 'Unit 8 — Looking at language',        description: 'Linguistics, language evolution and usage.', lessons: makeLessons('Unit 8') },
    { title: 'Unit 9 — It takes all sorts...',      description: 'Personality types, human behaviour and society.', lessons: makeLessons('Unit 9') },
    { title: 'Unit 10 — Nothing but the truth',     description: 'Truth, deception, trust and honesty.', lessons: makeLessons('Unit 10') },
    { title: 'Unit 11 — Over to you!',              description: 'Independent learning, projects and presentations.', lessons: makeLessons('Unit 11') },
    { title: 'Unit 12 — Life goes on',              description: 'Reflecting on language learning, the future and change.', lessons: makeLessons('Unit 12') },
  ],
};

export const HEADWAY_LEVELS = Object.keys(HEADWAY_CURRICULUM);

export function getHeadwayCurriculum(level: string): HeadwayUnit[] | null {
  return HEADWAY_CURRICULUM[level] ?? null;
}
