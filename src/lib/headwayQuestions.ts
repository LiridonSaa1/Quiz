/**
 * Static question bank for Headway Pre-Intermediate Test Builder.
 * Format matches OUP Test Builder: fill-in-the-blank sentences with dropdown options.
 * Each question has: sentence with _____, 4 options, correct answer index (0-based), brief explanation.
 */

export interface HQuestion {
  text: string;
  options: string[];
  correct: number;
  explanation: string;
}

export interface HSection {
  topic: string;
  type: 'grammar' | 'vocabulary';
  questions: HQuestion[];
}

const PREINT: HSection[] = [
  {
    topic: 'Tenses',
    type: 'grammar',
    questions: [
      { text: 'My husband _____ about motorbikes all the time.', options: ['thinks', 'is thinking', 'thought', 'has thought'], correct: 0, explanation: 'Use Present Simple for habits and repeated actions.' },
      { text: 'Right now he _____ a motorbike magazine.', options: ['is reading', 'reads', 'read', 'has read'], correct: 0, explanation: 'Use Present Continuous for actions happening right now.' },
      { text: 'Yesterday she _____ a nice motorbike for sale.', options: ['saw', 'sees', 'is seeing', 'has seen'], correct: 0, explanation: 'Use Past Simple for completed actions in the past.' },
      { text: 'I _____ my homework yet.', options: ["haven't finished", "didn't finish", "don't finish", "wasn't finishing"], correct: 0, explanation: 'Use Present Perfect with "yet" for unfinished situations.' },
      { text: 'They _____ in this town since 2010.', options: ['have lived', 'lived', 'are living', 'were living'], correct: 0, explanation: 'Use Present Perfect with "since" for situations that started in the past and continue now.' },
      { text: 'While she _____, her phone rang.', options: ['was cooking', 'cooked', 'has cooked', 'is cooking'], correct: 0, explanation: 'Use Past Continuous for an action in progress when another happened.' },
    ],
  },
  {
    topic: 'Question words',
    type: 'grammar',
    questions: [
      { text: '_____ did you go last weekend?', options: ['Where', 'What', 'Who', 'Which'], correct: 0, explanation: '"Where" asks about place.' },
      { text: '_____ did you meet at the party?', options: ['Who', 'What', 'Which', 'Where'], correct: 0, explanation: '"Who" asks about a person.' },
      { text: '_____ does the train leave?', options: ['When', 'How', 'Why', 'Which'], correct: 0, explanation: '"When" asks about time.' },
      { text: '_____ long does it take to get there?', options: ['How', 'What', 'Which', 'Why'], correct: 0, explanation: '"How long" asks about duration.' },
      { text: '_____ is your favourite subject at school?', options: ['What', 'Who', 'How', 'When'], correct: 0, explanation: '"What" asks about things or subjects.' },
      { text: '_____ much did you pay for that jacket?', options: ['How', 'What', 'Why', 'Which'], correct: 0, explanation: '"How much" asks about price or quantity.' },
    ],
  },
  {
    topic: 'Present Simple/Present Continuous',
    type: 'grammar',
    questions: [
      { text: 'Look at that woman. She _____ a beautiful hat.', options: ['is wearing', 'wears', 'wore', 'has worn'], correct: 0, explanation: 'Use Present Continuous for actions happening at the moment of speaking.' },
      { text: 'Sam looks frightened. What _____?', options: ['is happening', 'happens', 'happened', 'has happened'], correct: 0, explanation: 'Use Present Continuous for situations happening now.' },
      { text: 'I usually drive but today my car _____.', options: ["isn't working", "doesn't work", "didn't work", "hasn't worked"], correct: 0, explanation: 'Use Present Continuous for a temporary situation.' },
      { text: '_____ to the radio when you get up?', options: ['Do you listen', 'Are you listening', 'Did you listen', 'Have you listened'], correct: 0, explanation: 'Use Present Simple for routines and habits.' },
      { text: 'She _____ tennis twice a week.', options: ['plays', 'is playing', 'played', 'has played'], correct: 0, explanation: 'Use Present Simple for regular activities.' },
      { text: 'He _____ French at university this year.', options: ['is studying', 'studies', 'studied', 'has studied'], correct: 0, explanation: 'Use Present Continuous for temporary activities happening around now.' },
    ],
  },
  {
    topic: 'Past Simple',
    type: 'grammar',
    questions: [
      { text: 'She _____ to Italy last summer.', options: ['went', 'goes', 'is going', 'has gone'], correct: 0, explanation: 'Use Past Simple for completed actions at a specific past time.' },
      { text: 'We _____ the film last night.', options: ["didn't enjoy", "don't enjoy", "aren't enjoying", "haven't enjoyed"], correct: 0, explanation: 'Use Past Simple negative with "didn\'t + base verb".' },
      { text: '_____ you see John at the meeting yesterday?', options: ['Did', 'Were', 'Have', 'Do'], correct: 0, explanation: 'Use "Did" to form Past Simple questions.' },
      { text: 'I _____ my keys this morning.', options: ['lost', 'lose', 'am losing', 'have lost'], correct: 0, explanation: 'Use Past Simple for completed actions earlier today (specified).' },
      { text: 'He _____ in London for ten years and then moved to Paris.', options: ['lived', 'has lived', 'was living', 'is living'], correct: 0, explanation: 'Use Past Simple for a finished period of time in the past.' },
    ],
  },
  {
    topic: 'Past Simple/Past Continuous',
    type: 'grammar',
    questions: [
      { text: 'I _____ TV when the phone rang.', options: ['was watching', 'watched', 'watch', 'had watched'], correct: 0, explanation: 'Use Past Continuous for an ongoing action interrupted by a Past Simple event.' },
      { text: 'When she arrived, they _____ dinner.', options: ['were having', 'had', 'have', 'are having'], correct: 0, explanation: 'Use Past Continuous for an action in progress at a past moment.' },
      { text: 'I saw Maria while I _____ to work.', options: ['was walking', 'walked', 'walk', 'am walking'], correct: 0, explanation: 'Use Past Continuous with "while" for a background action.' },
      { text: 'It _____ heavily when we left the house.', options: ['was raining', 'rained', 'rains', 'has rained'], correct: 0, explanation: 'Use Past Continuous to describe weather as background.' },
      { text: 'She _____ her keys while she _____ in her bag.', options: ['found / was looking', 'was finding / looked', 'found / is looking', 'finds / looked'], correct: 0, explanation: 'Past Simple (short action) + Past Continuous (longer background action).' },
    ],
  },
  {
    topic: 'some/any/a',
    type: 'grammar',
    questions: [
      { text: 'Would you like _____ coffee?', options: ['some', 'any', 'a', 'the'], correct: 0, explanation: 'Use "some" in offers and requests.' },
      { text: 'Is there _____ milk in the fridge?', options: ['any', 'some', 'a', 'an'], correct: 0, explanation: 'Use "any" in questions with uncountable nouns.' },
      { text: "I'm hungry. I'll make _____ sandwich.", options: ['a', 'some', 'any', 'the'], correct: 0, explanation: 'Use "a" with singular countable nouns.' },
      { text: "There aren't _____ chairs in the room.", options: ['any', 'some', 'a', 'the'], correct: 0, explanation: 'Use "any" in negative sentences.' },
      { text: 'She bought _____ apples from the market.', options: ['some', 'any', 'a', 'an'], correct: 0, explanation: 'Use "some" in affirmative sentences with plural nouns.' },
    ],
  },
  {
    topic: 'Articles',
    type: 'grammar',
    questions: [
      { text: 'She plays _____ piano every evening.', options: ['the', 'a', 'an', '-'], correct: 0, explanation: 'Use "the" with musical instruments.' },
      { text: 'He is _____ engineer.', options: ['an', 'a', 'the', '-'], correct: 0, explanation: 'Use "an" before vowel sounds.' },
      { text: '_____ sun rises in the east.', options: ['The', 'A', 'An', '-'], correct: 0, explanation: 'Use "the" for unique nouns.' },
      { text: 'I had _____ breakfast at seven.', options: ['-', 'a', 'the', 'an'], correct: 0, explanation: 'No article with meals used in a general sense.' },
      { text: "That's _____ most interesting book I've read.", options: ['the', 'a', 'an', '-'], correct: 0, explanation: 'Use "the" with superlatives.' },
      { text: 'She goes to _____ school by bus.', options: ['-', 'the', 'a', 'an'], correct: 0, explanation: 'No article with "school/work/home" when referring to their purpose.' },
    ],
  },
  {
    topic: 'Verb patterns',
    type: 'grammar',
    questions: [
      { text: 'I enjoy _____ to music.', options: ['listening', 'to listen', 'listen', 'listened'], correct: 0, explanation: '"Enjoy" is followed by a gerund (-ing).' },
      { text: 'She decided _____ a new job.', options: ['to find', 'finding', 'find', 'found'], correct: 0, explanation: '"Decide" is followed by an infinitive (to + verb).' },
      { text: 'Would you mind _____ the window?', options: ['closing', 'to close', 'close', 'closed'], correct: 0, explanation: '"Mind" is followed by a gerund (-ing).' },
      { text: 'They want _____ on holiday next month.', options: ['to go', 'going', 'go', 'gone'], correct: 0, explanation: '"Want" is followed by an infinitive (to + verb).' },
      { text: 'He stopped _____ when he was thirty.', options: ['smoking', 'to smoke', 'smoke', 'smoked'], correct: 0, explanation: '"Stop + gerund" means the action ends.' },
    ],
  },
  {
    topic: 'going to/will',
    type: 'grammar',
    questions: [
      { text: 'Look at those clouds! It _____ rain.', options: ["'s going to", "'ll", "goes to", 'is'], correct: 0, explanation: 'Use "going to" for predictions based on present evidence.' },
      { text: 'A: The phone is ringing! B: I _____ get it.', options: ["'ll", "'m going to", "go to", 'am'], correct: 0, explanation: 'Use "will" for spontaneous decisions.' },
      { text: 'They _____ move to London next year.', options: ["'re going to", "'ll", "goes to", 'move'], correct: 0, explanation: 'Use "going to" for plans and intentions.' },
      { text: "I promise I _____ call you tomorrow.", options: ["'ll", "'m going to", "am going", 'will have'], correct: 0, explanation: 'Use "will" for promises.' },
      { text: 'She _____ have a baby in June.', options: ["'s going to", "'ll", "goes to", 'is have'], correct: 0, explanation: 'Use "going to" for plans based on present evidence.' },
    ],
  },
  {
    topic: 'Comparatives/Superlatives',
    type: 'grammar',
    questions: [
      { text: 'This test is _____ the last one.', options: ['easier than', 'more easy than', 'the easiest', 'easy than'], correct: 0, explanation: 'Use comparative + "than" to compare two things.' },
      { text: 'She is _____ student in the class.', options: ['the most intelligent', 'more intelligent', 'intelligenter', 'the intelligenter'], correct: 0, explanation: 'Use superlative + "the" for multi-syllable adjectives.' },
      { text: 'Today is _____ day of the year so far.', options: ['the hottest', 'hotter', 'the most hot', 'most hottest'], correct: 0, explanation: 'Use "the + -est" for short adjectives in superlative.' },
      { text: 'He earns _____ money than his brother.', options: ['more', 'the most', 'much', 'most'], correct: 0, explanation: 'Use "more" with uncountable nouns for comparatives.' },
      { text: 'This is _____ film I have ever seen.', options: ['the worst', 'worse', 'the most bad', 'more bad'], correct: 0, explanation: '"Worst" is the irregular superlative of "bad".' },
    ],
  },
  {
    topic: 'Past Simple/Present Perfect 1',
    type: 'grammar',
    questions: [
      { text: 'I _____ to Rome twice in my life.', options: ['have been', 'was', 'went', 'am'], correct: 0, explanation: 'Use Present Perfect for experiences without a specific time.' },
      { text: 'She _____ the report yesterday.', options: ['finished', 'has finished', 'finishes', 'is finishing'], correct: 0, explanation: 'Use Past Simple with specific past time expressions like "yesterday".' },
      { text: '_____ you ever tried sushi?', options: ['Have', 'Did', 'Do', 'Were'], correct: 0, explanation: 'Use Present Perfect with "ever" to ask about life experiences.' },
      { text: 'He _____ his keys. He can\'t find them.', options: ['has lost', 'lost', 'loses', 'is losing'], correct: 0, explanation: 'Use Present Perfect when the result is relevant now.' },
      { text: 'They _____ married in 2005.', options: ['got', 'have got', 'get', 'are getting'], correct: 0, explanation: 'Use Past Simple with a specific date in the past.' },
    ],
  },
  {
    topic: 'Past Simple/Present Perfect 2',
    type: 'grammar',
    questions: [
      { text: 'I _____ just _____ lunch.', options: ["have / had", "did / have", "have / have", "had / had"], correct: 0, explanation: 'Use Present Perfect with "just" for recent completed actions.' },
      { text: 'She _____ already _____ that book.', options: ['has / read', 'did / read', 'is / reading', 'was / read'], correct: 0, explanation: 'Use Present Perfect with "already" for actions completed sooner than expected.' },
      { text: '_____ you _____ your homework yet?', options: ['Have / done', 'Did / do', 'Are / doing', 'Do / do'], correct: 0, explanation: 'Use Present Perfect with "yet" in questions.' },
      { text: "We _____ here for three hours already.", options: ['have been', 'were', 'are', 'have gone'], correct: 0, explanation: 'Use Present Perfect with "for" + time period.' },
      { text: "They _____ the project last Tuesday.", options: ['completed', 'have completed', 'complete', 'are completing'], correct: 0, explanation: 'Use Past Simple with a specific day in the past.' },
    ],
  },
  {
    topic: 'ever, never, for, since',
    type: 'grammar',
    questions: [
      { text: 'Have you _____ been to Australia?', options: ['ever', 'never', 'for', 'since'], correct: 0, explanation: '"Ever" is used in questions to ask about life experiences.' },
      { text: 'I have _____ tasted anything so delicious.', options: ['never', 'ever', 'for', 'since'], correct: 0, explanation: '"Never" is used in negative statements about experiences.' },
      { text: 'She has lived here _____ 2012.', options: ['since', 'for', 'ever', 'never'], correct: 0, explanation: 'Use "since" with a specific point in time.' },
      { text: "He has worked there _____ ten years.", options: ['for', 'since', 'ever', 'never'], correct: 0, explanation: 'Use "for" with a period of time.' },
      { text: 'Have you _____ eaten snails? — No, I\'ve _____ tried them.', options: ['ever / never', 'never / ever', 'for / since', 'since / for'], correct: 0, explanation: '"Ever" in questions, "never" in negative answers.' },
    ],
  },
  {
    topic: "(don't) have to/should",
    type: 'grammar',
    questions: [
      { text: 'You _____ wear a seatbelt. It\'s the law.', options: ['have to', 'should', "don't have to", "shouldn't"], correct: 0, explanation: '"Have to" expresses obligation or necessity.' },
      { text: 'You _____ eat more vegetables. It\'s good for you.', options: ['should', 'have to', "shouldn't", "must not"], correct: 0, explanation: '"Should" gives advice or recommendation.' },
      { text: 'Children _____ go to school. It\'s compulsory.', options: ['have to', 'should', "don't have to", "shouldn't"], correct: 0, explanation: '"Have to" expresses legal or external obligation.' },
      { text: 'It\'s Sunday. I _____ get up early.', options: ["don't have to", "shouldn't", "mustn't", "have to"], correct: 0, explanation: '"Don\'t have to" means it\'s not necessary.' },
      { text: 'You _____ tell anyone. It\'s a secret.', options: ["shouldn't", 'should', 'have to', "don't have to"], correct: 0, explanation: '"Shouldn\'t" advises against doing something.' },
    ],
  },
  {
    topic: 'so/such',
    type: 'grammar',
    questions: [
      { text: 'It was _____ a nice day that we went to the beach.', options: ['such', 'so', 'very', 'too'], correct: 0, explanation: 'Use "such" before a noun phrase (a/an + adjective + noun).' },
      { text: 'The music was _____ loud that I couldn\'t hear.', options: ['so', 'such', 'very', 'too'], correct: 0, explanation: 'Use "so" before an adjective or adverb.' },
      { text: 'She has _____ good ideas!', options: ['such', 'so', 'very', 'too'], correct: 0, explanation: 'Use "such" before a plural noun phrase.' },
      { text: 'He drove _____ fast that he got a ticket.', options: ['so', 'such', 'very', 'too'], correct: 0, explanation: 'Use "so" before an adverb.' },
      { text: 'It was _____ beautiful weather that we stayed outside all day.', options: ['such', 'so', 'very', 'too'], correct: 0, explanation: 'Use "such" before an uncountable noun phrase.' },
    ],
  },
  {
    topic: 'Passives 1',
    type: 'grammar',
    questions: [
      { text: 'The letter _____ every day.', options: ['is delivered', 'delivers', 'is delivering', 'has delivered'], correct: 0, explanation: 'Use Present Simple passive: is/are + past participle.' },
      { text: 'The car _____ last night.', options: ['was stolen', 'stole', 'is stolen', 'stolen'], correct: 0, explanation: 'Use Past Simple passive: was/were + past participle.' },
      { text: 'Three people _____ in the accident.', options: ['were injured', 'injured', 'are injured', 'have injured'], correct: 0, explanation: 'Use Past Simple passive for completed past events.' },
      { text: 'English _____ all over the world.', options: ['is spoken', 'speaks', 'is speaking', 'spoke'], correct: 0, explanation: 'Use Present Simple passive for general truths.' },
      { text: 'The windows _____ once a week.', options: ['are cleaned', 'clean', 'are cleaning', 'cleaned'], correct: 0, explanation: 'Use "are" for plural subjects in Present Simple passive.' },
    ],
  },
  {
    topic: 'Passives 2',
    type: 'grammar',
    questions: [
      { text: 'This castle _____ in the 12th century.', options: ['was built', 'built', 'is built', 'has built'], correct: 0, explanation: 'Use Past Simple passive for historical facts.' },
      { text: 'The new hospital _____ next year.', options: ['will be opened', 'will open', 'is opened', 'has been opened'], correct: 0, explanation: 'Use Future passive: will be + past participle.' },
      { text: 'These paintings _____ by Picasso.', options: ['were painted', 'painted', 'are painting', 'have painted'], correct: 0, explanation: 'Use Past Simple passive + "by" to show the agent.' },
      { text: 'The report _____ by Friday.', options: ['must be finished', 'must finish', 'is finishing', 'finished'], correct: 0, explanation: 'Use modal + be + past participle for modal passive.' },
      { text: 'A new shopping centre _____ near here.', options: ['is being built', 'is building', 'has built', 'was building'], correct: 0, explanation: 'Use Present Continuous passive for ongoing actions.' },
    ],
  },
  {
    topic: 'Present Perfect Simple/Continuous',
    type: 'grammar',
    questions: [
      { text: 'She _____ for hours — her eyes are red.', options: ['has been crying', 'has cried', 'is crying', 'cries'], correct: 0, explanation: 'Use Present Perfect Continuous to emphasise the duration of a recent activity.' },
      { text: 'I _____ three emails this morning.', options: ['have written', 'have been writing', 'wrote', 'am writing'], correct: 0, explanation: 'Use Present Perfect Simple to emphasise a completed result.' },
      { text: 'How long _____ you _____ here?', options: ['have / been working', 'did / work', 'are / working', 'were / working'], correct: 0, explanation: 'Use Present Perfect Continuous with "how long" for ongoing actions.' },
      { text: 'They _____ all the sandwiches. There\'s nothing left.', options: ['have eaten', 'have been eating', 'ate', 'are eating'], correct: 0, explanation: 'Use Present Perfect Simple when the result is visible.' },
      { text: 'He _____ that book all week but still hasn\'t finished it.', options: ['has been reading', 'has read', 'read', 'is reading'], correct: 0, explanation: 'Use Present Perfect Continuous for an ongoing action over a period of time.' },
    ],
  },
  {
    topic: 'Time and conditional clauses',
    type: 'grammar',
    questions: [
      { text: 'Call me when you _____ home.', options: ['get', 'will get', 'got', 'are getting'], correct: 0, explanation: 'Use Present Simple (not will) after "when" in future time clauses.' },
      { text: 'If it _____ tomorrow, we\'ll cancel the trip.', options: ['rains', 'will rain', 'rained', 'is raining'], correct: 0, explanation: 'Use Present Simple in the "if" clause of a first conditional.' },
      { text: 'I\'ll wait here until she _____.', options: ['arrives', 'will arrive', 'arrived', 'is arriving'], correct: 0, explanation: 'Use Present Simple after time conjunctions like "until".' },
      { text: 'As soon as the meeting _____, we can leave.', options: ['ends', 'will end', 'ended', 'has ended'], correct: 0, explanation: 'Use Present Simple after "as soon as".' },
      { text: 'Before you _____ to bed, switch off the lights.', options: ['go', 'will go', 'went', 'are going'], correct: 0, explanation: 'Use Present Simple after "before" in future time clauses.' },
    ],
  },
  {
    topic: 'Second conditional',
    type: 'grammar',
    questions: [
      { text: 'If I _____ a car, I\'d drive to work.', options: ['had', 'have', 'would have', 'will have'], correct: 0, explanation: 'Use Past Simple in the "if" clause of the second conditional.' },
      { text: 'If she _____ taller, she would be a model.', options: ['were', 'is', 'would be', 'has been'], correct: 0, explanation: 'Use "were" (not "was") in second conditional for all persons.' },
      { text: 'I _____ a better job if I spoke better English.', options: ['would get', 'will get', 'got', 'get'], correct: 0, explanation: 'Use "would + infinitive" in the result clause of the second conditional.' },
      { text: 'What would you do if you _____ a million euros?', options: ['won', 'win', 'would win', 'had won'], correct: 0, explanation: 'Use Past Simple after "if" in second conditional questions.' },
      { text: 'If he _____ harder, he\'d pass the exam.', options: ['studied', 'studies', 'would study', 'has studied'], correct: 0, explanation: 'Use Past Simple in the "if" clause.' },
    ],
  },
  {
    topic: 'would/might',
    type: 'grammar',
    questions: [
      { text: 'I _____ love to travel around the world.', options: ['would', 'might', 'will', 'should'], correct: 0, explanation: '"Would" expresses a wish or hypothetical preference.' },
      { text: 'It _____ rain later — take an umbrella.', options: ['might', 'would', 'will', 'must'], correct: 0, explanation: '"Might" expresses possibility (less certain than "will").' },
      { text: '_____ you like some more tea?', options: ['Would', 'Might', 'Do', 'Should'], correct: 0, explanation: '"Would you like" is a polite offer.' },
      { text: 'She _____ be at home — try calling her.', options: ['might', 'would', 'will', 'should'], correct: 0, explanation: '"Might" expresses uncertainty about a present situation.' },
      { text: 'I _____ rather stay at home tonight.', options: ['would', 'might', 'will', 'should'], correct: 0, explanation: '"Would rather" expresses preference.' },
    ],
  },
];

/** Map of level → sections */
export const HEADWAY_QUESTIONS: Record<string, HSection[]> = {
  'Pre-Intermediate': PREINT,
};

/**
 * Get questions for a specific level and section topic.
 * Returns up to `limit` questions (shuffled for variety).
 */
export function getQuestionsForSection(level: string, topic: string, limit = 5): HQuestion[] {
  const sections = HEADWAY_QUESTIONS[level];
  if (!sections) return [];
  const section = sections.find(s => s.topic === topic);
  if (!section) return [];
  const all = [...section.questions];
  // Shuffle for variety
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, limit);
}

/** Get all topics available for a given level */
export function getTopicsForLevel(level: string): HSection[] {
  return HEADWAY_QUESTIONS[level] ?? [];
}
