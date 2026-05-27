/**
 * Static question bank for Headway Test Builder — ALL 6 levels.
 * Format: fill-in-the-blank sentences, 4 options, correct index (0-based), explanation.
 * getQuestionsForSection() returns a shuffled subset so questions vary on each run.
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

// ─── BEGINNER ────────────────────────────────────────────────────────────────
const BEGINNER: HSection[] = [
  {
    topic: 'am / are / is',
    type: 'grammar',
    questions: [
      { text: 'She _____ a doctor.', options: ['is', 'are', 'am', 'be'], correct: 0, explanation: 'Use "is" with he/she/it.' },
      { text: 'They _____ from Spain.', options: ['are', 'is', 'am', 'be'], correct: 0, explanation: 'Use "are" with they/we/you.' },
      { text: 'I _____ a student.', options: ['am', 'is', 'are', 'be'], correct: 0, explanation: 'Use "am" with I.' },
      { text: 'He _____ at work today.', options: ['is', 'am', 'are', 'be'], correct: 0, explanation: 'Use "is" with he/she/it.' },
      { text: 'We _____ very happy.', options: ['are', 'is', 'am', 'be'], correct: 0, explanation: 'Use "are" with we/they/you.' },
      { text: 'My name _____ Maria.', options: ['is', 'are', 'am', 'be'], correct: 0, explanation: 'Use "is" for singular subjects.' },
      { text: '_____ you a teacher?', options: ['Are', 'Is', 'Am', 'Be'], correct: 0, explanation: 'Use "Are" for questions with you.' },
      { text: 'The children _____ in the garden.', options: ['are', 'is', 'am', 'be'], correct: 0, explanation: 'Use "are" with plural subjects.' },
    ],
  },
  {
    topic: 'Present Simple',
    type: 'grammar',
    questions: [
      { text: 'She _____ to school every day.', options: ['goes', 'go', 'going', 'is go'], correct: 0, explanation: 'Add -s/-es with he/she/it in Present Simple.' },
      { text: 'They _____ football on Saturdays.', options: ['play', 'plays', 'playing', 'are play'], correct: 0, explanation: 'No -s with they/we/you in Present Simple.' },
      { text: 'He _____ coffee for breakfast.', options: ['drinks', 'drink', 'drinking', 'is drink'], correct: 0, explanation: 'Add -s with he/she/it.' },
      { text: 'I _____ in London.', options: ['live', 'lives', 'living', 'am live'], correct: 0, explanation: 'No -s with I in Present Simple.' },
      { text: 'She _____ speak French.', options: ["doesn't", "don't", "isn't", "aren't"], correct: 0, explanation: 'Use "doesn\'t" with he/she/it in negatives.' },
      { text: '_____ they live near you?', options: ['Do', 'Does', 'Are', 'Is'], correct: 0, explanation: 'Use "Do" with they/we/you in questions.' },
      { text: 'He _____ up at 7 every morning.', options: ['gets', 'get', 'got', 'getting'], correct: 0, explanation: 'Third person singular takes -s in Present Simple.' },
    ],
  },
  {
    topic: 'Present Simple 1',
    type: 'grammar',
    questions: [
      { text: 'My sister _____ a nurse.', options: ['is', 'are', 'am', 'be'], correct: 0, explanation: '"Is" with he/she/it.' },
      { text: 'The train _____ at 8 o\'clock.', options: ['leaves', 'leave', 'leaving', 'is leave'], correct: 0, explanation: 'Third person singular: add -s/-es.' },
      { text: 'We _____ like fish.', options: ["don't", "doesn't", "aren't", "isn't"], correct: 0, explanation: 'Use "don\'t" with we/they/I/you.' },
      { text: '_____ she work on Sundays?', options: ['Does', 'Do', 'Is', 'Are'], correct: 0, explanation: 'Use "Does" for third person singular questions.' },
      { text: 'He _____ Italian.', options: ['speaks', 'speak', 'speaking', 'spoke'], correct: 0, explanation: 'Third person singular takes -s.' },
    ],
  },
  {
    topic: 'Present Simple 2',
    type: 'grammar',
    questions: [
      { text: 'She _____ breakfast every morning.', options: ['has', 'have', 'having', 'had'], correct: 0, explanation: '"Have" becomes "has" in third person singular.' },
      { text: 'My parents _____ in a small town.', options: ['live', 'lives', 'living', 'lived'], correct: 0, explanation: 'Use base form with plural subjects.' },
      { text: 'He _____ TV every evening.', options: ['watches', 'watch', 'watching', 'watched'], correct: 0, explanation: 'Add -es after -ch/-sh in third person.' },
      { text: '_____ you work at the weekend?', options: ['Do', 'Does', 'Are', 'Is'], correct: 0, explanation: '"Do" for I/you/we/they.' },
      { text: 'She _____ early on weekdays.', options: ["doesn't get up", "don't get up", "isn't get up", "aren't get up"], correct: 0, explanation: '"Doesn\'t" for third person singular negative.' },
    ],
  },
  {
    topic: 'Questions and answers',
    type: 'grammar',
    questions: [
      { text: 'A: _____ you married? B: Yes, I am.', options: ['Are', 'Is', 'Do', 'Have'], correct: 0, explanation: 'Short answer with "am/is/are" matches the question auxiliary.' },
      { text: 'A: _____ she like pizza? B: Yes, she _____.', options: ['Does / does', 'Do / does', 'Is / is', 'Has / has'], correct: 0, explanation: 'Use "does" for third person singular questions and short answers.' },
      { text: '_____ your brother a student?', options: ['Is', 'Are', 'Do', 'Does'], correct: 0, explanation: 'Use "is" with singular subjects in be-questions.' },
      { text: 'A: Do they live here? B: No, they _____.', options: ["don't", "doesn't", "aren't", "isn't"], correct: 0, explanation: 'Short negative answer with "do": "don\'t".' },
      { text: '_____ your parents speak English?', options: ['Do', 'Does', 'Are', 'Is'], correct: 0, explanation: 'Use "Do" with plural subjects.' },
    ],
  },
  {
    topic: 'Questions and short answers',
    type: 'grammar',
    questions: [
      { text: 'A: Is he a doctor? B: Yes, he _____.', options: ['is', 'are', 'does', 'has'], correct: 0, explanation: 'Short answer echoes the auxiliary verb in the question.' },
      { text: 'A: Are they French? B: No, they _____.', options: ["aren't", "isn't", "don't", "doesn't"], correct: 0, explanation: 'Negative short answer with "are" → "aren\'t".' },
      { text: '_____ she from Italy?', options: ['Is', 'Are', 'Do', 'Does'], correct: 0, explanation: 'Use "is" with she/he/it.' },
      { text: 'A: Do you work here? B: Yes, I _____.', options: ['do', 'does', 'am', 'have'], correct: 0, explanation: 'Short answer with "do": "Yes, I do."' },
      { text: '_____ they at home?', options: ['Are', 'Is', 'Do', 'Does'], correct: 0, explanation: 'Use "are" with plural subjects.' },
    ],
  },
  {
    topic: 'Possessives',
    type: 'grammar',
    questions: [
      { text: 'This is _____ book. (Tom)', options: ["Tom's", 'Toms', 'Tom is', 'of Tom'], correct: 0, explanation: 'Add apostrophe + s to show possession.' },
      { text: 'That is _____ car. (my mother)', options: ["my mother's", 'my mothers', 'of my mother', "mother's my"], correct: 0, explanation: 'Possessive \'s after the owner\'s name.' },
      { text: '_____ name is Maria. (she)', options: ['Her', 'His', 'Their', 'Its'], correct: 0, explanation: 'Use "her" as possessive adjective for she.' },
      { text: '_____ house is very big. (they)', options: ['Their', 'His', 'Her', 'Its'], correct: 0, explanation: 'Use "their" as possessive adjective for they.' },
      { text: 'Is this _____ phone?', options: ['your', 'you', 'yours', "you're"], correct: 0, explanation: '"Your" is a possessive adjective used before a noun.' },
    ],
  },
  {
    topic: 'can / can\'t',
    type: 'grammar',
    questions: [
      { text: 'She _____ swim very well.', options: ['can', 'cans', 'could', 'is able'], correct: 0, explanation: '"Can" expresses ability; no -s in third person.' },
      { text: 'I _____ play the piano. I\'ve never learned.', options: ["can't", "don't can", "am not can", "hasn't"], correct: 0, explanation: '"Can\'t" expresses inability.' },
      { text: '_____ you drive?', options: ['Can', 'Do', 'Are', 'Have'], correct: 0, explanation: '"Can" comes before the subject in questions.' },
      { text: 'He _____ speak three languages.', options: ['can', 'cans', 'is able', 'could'], correct: 0, explanation: '"Can" + base verb for ability, no -s.' },
      { text: 'They _____ come tonight. They\'re busy.', options: ["can't", "don't can", "haven't", "aren't can"], correct: 0, explanation: '"Can\'t" for impossibility or inability.' },
    ],
  },
  {
    topic: 'was / were',
    type: 'grammar',
    questions: [
      { text: 'I _____ at school yesterday.', options: ['was', 'were', 'am', 'be'], correct: 0, explanation: 'Use "was" with I/he/she/it in the past.' },
      { text: 'They _____ very tired after the trip.', options: ['were', 'was', 'are', 'be'], correct: 0, explanation: 'Use "were" with they/we/you in the past.' },
      { text: '_____ she at home last night?', options: ['Was', 'Were', 'Is', 'Did'], correct: 0, explanation: '"Was" for she/he/it in past questions.' },
      { text: 'We _____ not ready on time.', options: ['were', 'was', 'are', 'be'], correct: 0, explanation: '"Were" with we for past tense.' },
      { text: 'He _____ born in 1985.', options: ['was', 'were', 'is', 'has'], correct: 0, explanation: '"Was" for he/she/it in past simple.' },
    ],
  },
  {
    topic: 'Past Simple irregular',
    type: 'grammar',
    questions: [
      { text: 'She _____ a great film last night. (see)', options: ['saw', 'seed', 'seen', 'sees'], correct: 0, explanation: '"See" → "saw" in Past Simple (irregular).' },
      { text: 'We _____ dinner at 7. (have)', options: ['had', 'haved', 'having', 'has'], correct: 0, explanation: '"Have" → "had" in Past Simple.' },
      { text: 'He _____ to Paris last year. (go)', options: ['went', 'goed', 'gone', 'goes'], correct: 0, explanation: '"Go" → "went" in Past Simple (irregular).' },
      { text: 'She _____ me a present. (give)', options: ['gave', 'gived', 'given', 'gives'], correct: 0, explanation: '"Give" → "gave" in Past Simple.' },
      { text: 'They _____ up very late. (get)', options: ['got', 'getted', 'gotten', 'gets'], correct: 0, explanation: '"Get" → "got" in Past Simple (irregular).' },
    ],
  },
  {
    topic: 'Past Simple 1',
    type: 'grammar',
    questions: [
      { text: 'She _____ to bed early last night.', options: ['went', 'goes', 'is going', 'gone'], correct: 0, explanation: 'Use Past Simple for completed actions in the past.' },
      { text: 'They _____ a new car last month.', options: ['bought', 'buy', 'are buying', 'buyed'], correct: 0, explanation: '"Buy" → "bought" (irregular past).' },
      { text: '_____ you watch TV yesterday?', options: ['Did', 'Do', 'Are', 'Were'], correct: 0, explanation: 'Use "Did" to form past simple questions.' },
      { text: 'He _____ call me. I waited all evening.', options: ["didn't", "doesn't", "isn't", "wasn't"], correct: 0, explanation: '"Didn\'t + base verb" for past simple negative.' },
      { text: 'We _____ the museum in the morning.', options: ['visited', 'visit', 'are visiting', 'have visited'], correct: 0, explanation: 'Regular past simple: base verb + -ed.' },
    ],
  },
  {
    topic: 'Present Continuous',
    type: 'grammar',
    questions: [
      { text: 'Look! She _____ a red dress.', options: ['is wearing', 'wears', 'wore', 'wear'], correct: 0, explanation: 'Use Present Continuous for actions happening right now.' },
      { text: 'They _____ football at the moment.', options: ['are playing', 'play', 'played', 'plays'], correct: 0, explanation: '"Are + -ing" for ongoing actions now.' },
      { text: 'Be quiet! The baby _____.', options: ['is sleeping', 'sleeps', 'slept', 'sleep'], correct: 0, explanation: 'Present Continuous for a current situation.' },
      { text: 'I _____ for my keys right now.', options: ['am looking', 'look', 'looked', 'looks'], correct: 0, explanation: '"Am + -ing" with I.' },
      { text: 'He _____ a book this week.', options: ['is reading', 'reads', 'read', 'readed'], correct: 0, explanation: 'Present Continuous for a temporary activity.' },
    ],
  },
  {
    topic: 'Present Continuous for future',
    type: 'grammar',
    questions: [
      { text: 'I _____ my friend tonight. We arranged it yesterday.', options: ['am meeting', 'meet', 'will meet', 'met'], correct: 0, explanation: 'Present Continuous for fixed future arrangements.' },
      { text: 'They _____ to Paris next week.', options: ['are flying', 'fly', 'flew', 'will flying'], correct: 0, explanation: '"Are + -ing" for arranged future plans.' },
      { text: 'She _____ a new job next month.', options: ['is starting', 'starts', 'start', 'will starting'], correct: 0, explanation: 'Present Continuous for confirmed future plans.' },
      { text: 'We _____ a party on Saturday.', options: ['are having', 'have', 'will having', 'had'], correct: 0, explanation: 'Present Continuous for future arrangements.' },
      { text: '_____ you doing anything this evening?', options: ['Are', 'Do', 'Were', 'Have'], correct: 0, explanation: 'Present Continuous question for future plans.' },
    ],
  },
  {
    topic: 'Future plans',
    type: 'grammar',
    questions: [
      { text: 'I _____ going to travel next summer.', options: ['am', 'is', 'are', 'be'], correct: 0, explanation: '"Am going to" for personal future plans.' },
      { text: 'They _____ going to buy a new house.', options: ['are', 'is', 'am', 'be'], correct: 0, explanation: '"Are going to" with they/we/you.' },
      { text: 'She _____ going to study medicine.', options: ['is', 'are', 'am', 'be'], correct: 0, explanation: '"Is going to" with he/she/it.' },
      { text: 'Are you going _____ visit them?', options: ['to', 'and', 'for', 'that'], correct: 0, explanation: '"Going to + infinitive" for future intention.' },
      { text: 'We _____ to move soon.', options: ['are going', 'go', 'going', 'is going'], correct: 0, explanation: '"Are going to + verb" for plans.' },
    ],
  },
  {
    topic: 'like / would like',
    type: 'grammar',
    questions: [
      { text: 'I _____ coffee. I drink it every morning. (enjoy generally)', options: ['like', 'would like', "'d like", 'am liking'], correct: 0, explanation: '"Like" for general preferences.' },
      { text: '_____ you like some more cake?', options: ['Would', 'Do', 'Are', 'Did'], correct: 0, explanation: '"Would you like" for polite offers.' },
      { text: 'She _____ a glass of water, please.', options: ["'d like", 'likes', 'is liking', 'like'], correct: 0, explanation: '"Would like" (\'d like) for polite requests.' },
      { text: 'Do you _____ swimming?', options: ['like', 'would like', "' d like", 'liked'], correct: 0, explanation: '"Like + -ing" for general preferences.' },
      { text: 'They _____ to visit Rome one day.', options: ["'d like", 'like', 'likes', 'are liking'], correct: 0, explanation: '"Would like to + infinitive" for wishes.' },
    ],
  },
  {
    topic: 'some / any',
    type: 'grammar',
    questions: [
      { text: 'There are _____ eggs in the fridge.', options: ['some', 'any', 'a', 'the'], correct: 0, explanation: 'Use "some" in affirmative sentences with plural nouns.' },
      { text: 'Is there _____ milk?', options: ['any', 'some', 'a', 'an'], correct: 0, explanation: 'Use "any" in questions with uncountable nouns.' },
      { text: 'We don\'t have _____ bread.', options: ['any', 'some', 'a', 'the'], correct: 0, explanation: 'Use "any" in negative sentences.' },
      { text: 'Would you like _____ tea?', options: ['some', 'any', 'a', 'an'], correct: 0, explanation: 'Use "some" in offers.' },
      { text: 'She didn\'t buy _____ fruit.', options: ['any', 'some', 'a', 'the'], correct: 0, explanation: '"Any" in negative sentences.' },
    ],
  },
  {
    topic: 'There is / There are',
    type: 'grammar',
    questions: [
      { text: '_____ a bank near here.', options: ['There is', 'There are', 'Is there', 'Are there'], correct: 0, explanation: '"There is" with singular nouns.' },
      { text: '_____ three bedrooms in my flat.', options: ['There are', 'There is', 'Are there', 'Is there'], correct: 0, explanation: '"There are" with plural nouns.' },
      { text: '_____ a problem with the computer.', options: ['There is', 'There are', 'It is', 'They are'], correct: 0, explanation: '"There is" introduces a singular subject.' },
      { text: '_____ any shops near your house?', options: ['Are there', 'Is there', 'There are', 'There is'], correct: 0, explanation: '"Are there" for plural questions.' },
      { text: '_____ a lot of students in the class.', options: ['There are', 'There is', 'Are there', 'Is there'], correct: 0, explanation: '"There are" with "a lot of + plural noun".' },
    ],
  },
  {
    topic: 'Question words',
    type: 'grammar',
    questions: [
      { text: '_____ is your name?', options: ['What', 'Who', 'Where', 'When'], correct: 0, explanation: '"What" asks about things, names, or identity.' },
      { text: '_____ do you live?', options: ['Where', 'When', 'Why', 'Who'], correct: 0, explanation: '"Where" asks about place.' },
      { text: '_____ old are you?', options: ['How', 'What', 'Which', 'Why'], correct: 0, explanation: '"How old" asks about age.' },
      { text: '_____ does the lesson start?', options: ['When', 'Where', 'What', 'How'], correct: 0, explanation: '"When" asks about time.' },
      { text: '_____ did you buy that jacket?', options: ['Where', 'What', 'Who', 'How'], correct: 0, explanation: '"Where" asks about the place of purchase.' },
      { text: '_____ much is this?', options: ['How', 'What', 'Why', 'Which'], correct: 0, explanation: '"How much" asks about price.' },
    ],
  },
];

// ─── ELEMENTARY ──────────────────────────────────────────────────────────────
const ELEMENTARY: HSection[] = [
  {
    topic: 'am / are / is',
    type: 'grammar',
    questions: [
      { text: 'She _____ 25 years old.', options: ['is', 'are', 'am', 'be'], correct: 0, explanation: '"Is" with he/she/it.' },
      { text: 'My friends _____ very funny.', options: ['are', 'is', 'am', 'be'], correct: 0, explanation: '"Are" with plural subjects.' },
      { text: 'I _____ not happy today.', options: ['am', 'is', 'are', 'be'], correct: 0, explanation: '"Am" with I.' },
      { text: 'It _____ a beautiful day.', options: ['is', 'am', 'are', 'be'], correct: 0, explanation: '"Is" with it.' },
      { text: '_____ they from the UK?', options: ['Are', 'Is', 'Am', 'Do'], correct: 0, explanation: '"Are" for they/we/you questions.' },
      { text: 'The film _____ very long.', options: ['is', 'are', 'am', 'be'], correct: 0, explanation: '"Is" with singular subjects.' },
    ],
  },
  {
    topic: "Possessive 's",
    type: 'grammar',
    questions: [
      { text: 'That is _____ coat. (Anna)', options: ["Anna's", 'Annas', 'Anna is', 'of Anna'], correct: 0, explanation: 'Add \'s to show possession.' },
      { text: "_____ car is new. (my father)", options: ["My father's", 'My fathers', 'My father is', 'Of my father'], correct: 0, explanation: "Use apostrophe + s after the owner's name." },
      { text: "This is _____ room. (the children)", options: ["the children's", "the childrens'", "the children is", "of the children"], correct: 0, explanation: "For irregular plurals (not ending in s), add 's." },
      { text: "Is that _____ book? (you)", options: ['your', 'yours', 'you', "you're"], correct: 0, explanation: '"Your" is the possessive adjective.' },
      { text: "We went to _____ party. (Sarah)", options: ["Sarah's", "Sarahs", "Sarah is", "of Sarah"], correct: 0, explanation: "Possessive 's for names." },
    ],
  },
  {
    topic: 'Present Simple 1',
    type: 'grammar',
    questions: [
      { text: 'She _____ a lot.', options: ['reads', 'read', 'reading', 'is read'], correct: 0, explanation: 'Third person singular: add -s.' },
      { text: 'My parents _____ near the city centre.', options: ['live', 'lives', 'living', 'is live'], correct: 0, explanation: 'Plural subject: base form.' },
      { text: '_____ she like cooking?', options: ['Does', 'Do', 'Is', 'Has'], correct: 0, explanation: '"Does" for he/she/it questions.' },
      { text: 'I _____ usually eat meat.', options: ["don't", "doesn't", "am not", "haven't"], correct: 0, explanation: '"Don\'t" for I/you/we/they negatives.' },
      { text: 'He _____ the bus to work.', options: ['takes', 'take', 'taking', 'took'], correct: 0, explanation: 'Add -s with he/she/it.' },
    ],
  },
  {
    topic: 'Present Simple 2',
    type: 'grammar',
    questions: [
      { text: 'She _____ tennis on Tuesdays.', options: ['plays', 'play', 'is playing', 'played'], correct: 0, explanation: 'Present Simple: third person singular + -s.' },
      { text: 'My brother _____ to music every day.', options: ['listens', 'listen', 'is listening', 'listened'], correct: 0, explanation: 'Add -s for third person singular.' },
      { text: '_____ you enjoy reading?', options: ['Do', 'Does', 'Are', 'Have'], correct: 0, explanation: '"Do" for you/I/we/they questions.' },
      { text: 'She _____ work on Sundays.', options: ["doesn't", "don't", "isn't", "hasn't"], correct: 0, explanation: '"Doesn\'t" for third person singular.' },
      { text: 'He _____ to the gym three times a week.', options: ['goes', 'go', 'going', 'gone'], correct: 0, explanation: '"Go" → "goes" in third person singular.' },
    ],
  },
  {
    topic: 'Present Simple 3',
    type: 'grammar',
    questions: [
      { text: 'The museum _____ at nine.', options: ['opens', 'open', 'is opening', 'opened'], correct: 0, explanation: 'Scheduled events use Present Simple.' },
      { text: 'She _____ three languages.', options: ['speaks', 'speak', 'is speaking', 'spoke'], correct: 0, explanation: 'Third person singular: add -s.' },
      { text: '_____ he often travel for work?', options: ['Does', 'Do', 'Is', 'Has'], correct: 0, explanation: '"Does" for third person questions.' },
      { text: 'Water _____ at 100°C.', options: ['boils', 'boil', 'is boiling', 'boiled'], correct: 0, explanation: 'Facts and scientific truths use Present Simple.' },
      { text: 'We _____ meat — we\'re vegetarian.', options: ["don't eat", "doesn't eat", "aren't eating", "haven't eaten"], correct: 0, explanation: '"Don\'t + base verb" for we/they/I/you negative.' },
    ],
  },
  {
    topic: 'Adverbs of frequency',
    type: 'grammar',
    questions: [
      { text: 'She _____ goes to bed before midnight.', options: ['always', 'ever', 'yet', 'still'], correct: 0, explanation: '"Always" means 100% of the time.' },
      { text: 'I _____ eat fish. Maybe once a year.', options: ['rarely', 'usually', 'always', 'often'], correct: 0, explanation: '"Rarely" means almost never.' },
      { text: 'He is _____ late. He misses the bus every day.', options: ['always', 'never', 'rarely', 'sometimes'], correct: 0, explanation: '"Always" for something that happens every time.' },
      { text: 'We _____ go to the cinema — about twice a month.', options: ['sometimes', 'never', 'always', 'rarely'], correct: 0, explanation: '"Sometimes" for occasional actions.' },
      { text: 'She _____ drinks alcohol. She doesn\'t like it.', options: ['never', 'always', 'often', 'usually'], correct: 0, explanation: '"Never" = 0% of the time.' },
    ],
  },
  {
    topic: 'Comparatives and superlatives',
    type: 'grammar',
    questions: [
      { text: 'London is _____ than my hometown.', options: ['bigger', 'more big', 'biggest', 'the biggest'], correct: 0, explanation: 'Short adjectives: add -er for comparatives.' },
      { text: 'This is _____ film I\'ve ever seen.', options: ['the best', 'better', 'the most good', 'the more good'], correct: 0, explanation: '"Best" is the irregular superlative of "good".' },
      { text: 'She is _____ than her brother.', options: ['more intelligent', 'intelligenter', 'the most intelligent', 'most intelligent'], correct: 0, explanation: 'Long adjectives: "more + adjective" for comparatives.' },
      { text: 'January is _____ month of the year.', options: ['the coldest', 'colder', 'the most cold', 'most cold'], correct: 0, explanation: 'Superlative: "the + -est" for short adjectives.' },
      { text: 'My bag is _____ than yours.', options: ['heavier', 'more heavy', 'heaviest', 'the heaviest'], correct: 0, explanation: 'Adjectives ending in -y: change to -ier in comparative.' },
    ],
  },
  {
    topic: 'Superlatives',
    type: 'grammar',
    questions: [
      { text: 'This is _____ restaurant in the city.', options: ['the most expensive', 'more expensive', 'the expensivest', 'most expensive'], correct: 0, explanation: 'Long adjectives: "the most + adjective" for superlative.' },
      { text: 'That was _____ day of my life.', options: ['the worst', 'worse', 'the most bad', 'the badest'], correct: 0, explanation: '"Worst" is the superlative of "bad".' },
      { text: 'She is _____ student in the class.', options: ['the most hardworking', 'more hardworking', 'the hardworkingest', 'hardworkingest'], correct: 0, explanation: 'Superlative of long adjectives: "the most + adjective".' },
      { text: 'This is _____ mountain in Europe.', options: ['the highest', 'higher', 'the most high', 'most high'], correct: 0, explanation: '"Highest" is the superlative of "high".' },
      { text: 'He is _____ player on the team.', options: ['the fastest', 'faster', 'the most fast', 'most fast'], correct: 0, explanation: '"Fastest" is the superlative of "fast".' },
    ],
  },
  {
    topic: 'Present Continuous',
    type: 'grammar',
    questions: [
      { text: 'She _____ to music right now.', options: ['is listening', 'listens', 'listened', 'listen'], correct: 0, explanation: '"Is + -ing" for actions happening now.' },
      { text: 'They _____ a house at the moment.', options: ['are building', 'build', 'built', 'builds'], correct: 0, explanation: 'Present Continuous for ongoing actions.' },
      { text: 'I _____ this book. It\'s great!', options: ['am enjoying', 'enjoy', 'enjoyed', 'enjoys'], correct: 0, explanation: '"Am + -ing" with I for current actions.' },
      { text: '_____ you working from home today?', options: ['Are', 'Do', 'Did', 'Have'], correct: 0, explanation: '"Are" for Present Continuous questions.' },
      { text: 'He _____ his sister this weekend.', options: ['is visiting', 'visits', 'visited', 'visit'], correct: 0, explanation: 'Present Continuous for a future arrangement.' },
    ],
  },
  {
    topic: 'going to and Past Simple',
    type: 'grammar',
    questions: [
      { text: 'Look at those clouds! It _____ rain.', options: ["'s going to", "'ll", 'rains', 'rained'], correct: 0, explanation: '"Going to" for predictions based on evidence.' },
      { text: 'She _____ buy a new laptop next month.', options: ["'s going to", "'ll", 'buys', 'bought'], correct: 0, explanation: '"Going to" for planned future intentions.' },
      { text: 'We _____ to Spain last summer.', options: ['went', 'go', 'are going', 'were going'], correct: 0, explanation: 'Past Simple for completed past actions.' },
      { text: 'He _____ a film last night.', options: ['watched', 'watches', 'is watching', 'was watching'], correct: 0, explanation: 'Past Simple with time expression "last night".' },
      { text: 'They _____ visit their grandparents at the weekend.', options: ["are going to", "went", "go", "will going to"], correct: 0, explanation: '"Are going to" for arranged future plans.' },
    ],
  },
  {
    topic: 'Present Perfect 1',
    type: 'grammar',
    questions: [
      { text: 'I _____ to New York three times.', options: ['have been', 'went', 'was', 'go'], correct: 0, explanation: 'Present Perfect for experiences without a specific time.' },
      { text: 'She _____ her wallet. She can\'t find it.', options: ['has lost', 'lost', 'loses', 'is losing'], correct: 0, explanation: 'Present Perfect when the result affects the present.' },
      { text: '_____ you ever tried Japanese food?', options: ['Have', 'Did', 'Do', 'Were'], correct: 0, explanation: '"Have + ever" for life experiences.' },
      { text: 'He _____ just _____ the report.', options: ['has / finished', 'did / finish', 'was / finishing', 'is / finishing'], correct: 0, explanation: '"Has + just + past participle" for recent actions.' },
      { text: 'They _____ never _____ to Asia.', options: ['have / been', 'did / go', 'are / going', 'were / be'], correct: 0, explanation: '"Have + never + past participle" for negative experiences.' },
    ],
  },
  {
    topic: 'Present Perfect 2',
    type: 'grammar',
    questions: [
      { text: 'I _____ already _____ that film.', options: ['have / seen', 'did / see', 'was / seeing', 'am / seeing'], correct: 0, explanation: '"Have + already + past participle" for completed actions.' },
      { text: 'Have you finished your homework _____?', options: ['yet', 'already', 'just', 'never'], correct: 0, explanation: '"Yet" in questions means "by now".' },
      { text: 'She _____ lived here for five years.', options: ['has', 'did', 'is', 'was'], correct: 0, explanation: '"Has + past participle + for" for duration up to now.' },
      { text: 'They _____ arrived at the hotel.', options: ["haven't", "didn't", "aren't", "weren't"], correct: 0, explanation: '"Haven\'t + past participle" for present perfect negative.' },
      { text: 'He has _____ his exam!', options: ['passed', 'pass', 'passing', 'been passing'], correct: 0, explanation: 'Present Perfect uses past participle.' },
    ],
  },
  {
    topic: 'can / could, was / were',
    type: 'grammar',
    questions: [
      { text: 'She _____ swim when she was five.', options: ['could', 'can', 'is able', 'was able to'], correct: 0, explanation: '"Could" expresses past ability.' },
      { text: 'When I was young, I _____ run very fast.', options: ['could', 'can', 'will', 'am able'], correct: 0, explanation: '"Could" for past ability.' },
      { text: 'He _____ a teacher before he became a doctor.', options: ['was', 'is', 'were', 'be'], correct: 0, explanation: '"Was" with he/she/it for past.' },
      { text: 'They _____ at the party last night.', options: ['were', 'was', 'are', 'be'], correct: 0, explanation: '"Were" with they/we/you for past.' },
      { text: '_____ you speak any other languages when you were a child?', options: ['Could', 'Can', 'Were', 'Do'], correct: 0, explanation: '"Could" for past ability questions.' },
    ],
  },
];

// ─── PRE-INTERMEDIATE ─────────────────────────────────────────────────────────
const PREINT: HSection[] = [
  {
    topic: 'Tenses',
    type: 'grammar',
    questions: [
      { text: 'My husband _____ about motorbikes all the time.', options: ['thinks', 'is thinking', 'thought', 'has thought'], correct: 0, explanation: 'Use Present Simple for habits and repeated actions.' },
      { text: 'Right now he _____ a motorbike magazine.', options: ['is reading', 'reads', 'read', 'has read'], correct: 0, explanation: 'Use Present Continuous for actions happening right now.' },
      { text: 'Yesterday she _____ a nice motorbike for sale.', options: ['saw', 'sees', 'is seeing', 'has seen'], correct: 0, explanation: 'Use Past Simple for completed actions in the past.' },
      { text: 'I _____ my homework yet.', options: ["haven't finished", "didn't finish", "don't finish", "wasn't finishing"], correct: 0, explanation: 'Use Present Perfect with "yet" for unfinished situations.' },
      { text: 'They _____ in this town since 2010.', options: ['have lived', 'lived', 'are living', 'were living'], correct: 0, explanation: 'Use Present Perfect with "since" for situations that continue.' },
      { text: 'While she _____, her phone rang.', options: ['was cooking', 'cooked', 'has cooked', 'is cooking'], correct: 0, explanation: 'Past Continuous for an action interrupted by another.' },
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
      { text: '_____ much did you pay for that jacket?', options: ['How', 'What', 'Why', 'Which'], correct: 0, explanation: '"How much" asks about price.' },
    ],
  },
  {
    topic: 'Present Simple/Present Continuous',
    type: 'grammar',
    questions: [
      { text: 'Look at that woman. She _____ a beautiful hat.', options: ['is wearing', 'wears', 'wore', 'has worn'], correct: 0, explanation: 'Use Present Continuous for actions happening at the moment.' },
      { text: 'Sam looks frightened. What _____?', options: ['is happening', 'happens', 'happened', 'has happened'], correct: 0, explanation: 'Use Present Continuous for situations happening now.' },
      { text: 'I usually drive but today my car _____.', options: ["isn't working", "doesn't work", "didn't work", "hasn't worked"], correct: 0, explanation: 'Use Present Continuous for a temporary situation.' },
      { text: '_____ to the radio when you get up?', options: ['Do you listen', 'Are you listening', 'Did you listen', 'Have you listened'], correct: 0, explanation: 'Use Present Simple for routines and habits.' },
      { text: 'She _____ tennis twice a week.', options: ['plays', 'is playing', 'played', 'has played'], correct: 0, explanation: 'Present Simple for regular activities.' },
      { text: 'He _____ French at university this year.', options: ['is studying', 'studies', 'studied', 'has studied'], correct: 0, explanation: 'Present Continuous for temporary activities around now.' },
    ],
  },
  {
    topic: 'Present Simple / Continuous',
    type: 'grammar',
    questions: [
      { text: 'She _____ her sister every Sunday.', options: ['visits', 'is visiting', 'visited', 'has visited'], correct: 0, explanation: 'Present Simple for regular habits.' },
      { text: 'I _____ a new book this week.', options: ['am reading', 'read', 'reads', 'have read'], correct: 0, explanation: 'Present Continuous for a current temporary activity.' },
      { text: 'He _____ English to tourists right now.', options: ['is explaining', 'explains', 'explained', 'has explained'], correct: 0, explanation: 'Present Continuous for actions in progress now.' },
      { text: '_____ you usually have lunch at home?', options: ['Do', 'Are', 'Did', 'Have'], correct: 0, explanation: 'Present Simple question with "Do".' },
      { text: 'They _____ a new office this month.', options: ['are building', 'build', 'built', 'have built'], correct: 0, explanation: 'Present Continuous for a temporary ongoing activity.' },
    ],
  },
  {
    topic: 'Past Simple',
    type: 'grammar',
    questions: [
      { text: 'She _____ to Italy last summer.', options: ['went', 'goes', 'is going', 'has gone'], correct: 0, explanation: 'Past Simple for completed actions at a specific past time.' },
      { text: 'We _____ the film last night.', options: ["didn't enjoy", "don't enjoy", "aren't enjoying", "haven't enjoyed"], correct: 0, explanation: "Past Simple negative with 'didn't + base verb'." },
      { text: '_____ you see John at the meeting yesterday?', options: ['Did', 'Were', 'Have', 'Do'], correct: 0, explanation: '"Did" for Past Simple questions.' },
      { text: 'I _____ my keys this morning.', options: ['lost', 'lose', 'am losing', 'have lost'], correct: 0, explanation: 'Past Simple for completed earlier actions.' },
      { text: 'He _____ in London for ten years and then moved to Paris.', options: ['lived', 'has lived', 'was living', 'is living'], correct: 0, explanation: 'Past Simple for a finished period in the past.' },
    ],
  },
  {
    topic: 'Past Simple or Continuous',
    type: 'grammar',
    questions: [
      { text: 'I _____ TV when the phone rang.', options: ['was watching', 'watched', 'watch', 'had watched'], correct: 0, explanation: 'Past Continuous for an action interrupted by another.' },
      { text: 'When she arrived, they _____ dinner.', options: ['were having', 'had', 'have', 'are having'], correct: 0, explanation: 'Past Continuous for an action in progress at a past moment.' },
      { text: 'I saw Maria while I _____ to work.', options: ['was walking', 'walked', 'walk', 'am walking'], correct: 0, explanation: 'Past Continuous with "while" for a background action.' },
      { text: 'It _____ heavily when we left the house.', options: ['was raining', 'rained', 'rains', 'has rained'], correct: 0, explanation: 'Past Continuous for background description.' },
    ],
  },
  {
    topic: 'Past Simple/Past Continuous',
    type: 'grammar',
    questions: [
      { text: 'I _____ TV when the phone rang.', options: ['was watching', 'watched', 'watch', 'had watched'], correct: 0, explanation: 'Past Continuous for an ongoing action interrupted by another.' },
      { text: 'When she arrived, they _____ dinner.', options: ['were having', 'had', 'have', 'are having'], correct: 0, explanation: 'Past Continuous for an action in progress at a past moment.' },
      { text: 'I saw Maria while I _____ to work.', options: ['was walking', 'walked', 'walk', 'am walking'], correct: 0, explanation: 'Past Continuous with "while".' },
      { text: 'It _____ heavily when we left the house.', options: ['was raining', 'rained', 'rains', 'has rained'], correct: 0, explanation: 'Past Continuous for weather as background.' },
      { text: 'She _____ her keys while she _____ in her bag.', options: ['found / was looking', 'was finding / looked', 'found / is looking', 'finds / looked'], correct: 0, explanation: 'Past Simple (short) + Past Continuous (background).' },
    ],
  },
  {
    topic: 'some/any/a',
    type: 'grammar',
    questions: [
      { text: 'Would you like _____ coffee?', options: ['some', 'any', 'a', 'the'], correct: 0, explanation: '"Some" in offers and requests.' },
      { text: 'Is there _____ milk in the fridge?', options: ['any', 'some', 'a', 'an'], correct: 0, explanation: '"Any" in questions with uncountable nouns.' },
      { text: "I'm hungry. I'll make _____ sandwich.", options: ['a', 'some', 'any', 'the'], correct: 0, explanation: '"A" with singular countable nouns.' },
      { text: "There aren't _____ chairs in the room.", options: ['any', 'some', 'a', 'the'], correct: 0, explanation: '"Any" in negative sentences.' },
      { text: 'She bought _____ apples from the market.', options: ['some', 'any', 'a', 'an'], correct: 0, explanation: '"Some" in affirmative sentences with plural nouns.' },
    ],
  },
  {
    topic: 'Articles',
    type: 'grammar',
    questions: [
      { text: 'She plays _____ piano every evening.', options: ['the', 'a', 'an', '-'], correct: 0, explanation: '"The" with musical instruments.' },
      { text: 'He is _____ engineer.', options: ['an', 'a', 'the', '-'], correct: 0, explanation: '"An" before vowel sounds.' },
      { text: '_____ sun rises in the east.', options: ['The', 'A', 'An', '-'], correct: 0, explanation: '"The" for unique nouns.' },
      { text: 'I had _____ breakfast at seven.', options: ['-', 'a', 'the', 'an'], correct: 0, explanation: 'No article with meals in a general sense.' },
      { text: "That's _____ most interesting book I've read.", options: ['the', 'a', 'an', '-'], correct: 0, explanation: '"The" with superlatives.' },
      { text: 'She goes to _____ school by bus.', options: ['-', 'the', 'a', 'an'], correct: 0, explanation: 'No article with "school/work/home" for their purpose.' },
    ],
  },
  {
    topic: 'Count / Uncount nouns',
    type: 'grammar',
    questions: [
      { text: 'Can I have _____ information about the course?', options: ['some', 'a', 'an', 'many'], correct: 0, explanation: '"Information" is uncountable; use "some".' },
      { text: 'I need to buy _____ furniture for my flat.', options: ['some', 'a', 'many', 'few'], correct: 0, explanation: '"Furniture" is uncountable; use "some" not "a".' },
      { text: 'She gave me _____ good advice.', options: ['some', 'a', 'an', 'many'], correct: 0, explanation: '"Advice" is uncountable.' },
      { text: 'There is _____ traffic on the roads today.', options: ['a lot of', 'many', 'a', 'few'], correct: 0, explanation: 'Uncountable nouns use "a lot of" not "many".' },
      { text: 'I have _____ questions for you.', options: ['a few', 'a little', 'much', 'a piece of'], correct: 0, explanation: '"A few" with countable plural nouns.' },
    ],
  },
  {
    topic: 'Verb patterns',
    type: 'grammar',
    questions: [
      { text: 'I enjoy _____ to music.', options: ['listening', 'to listen', 'listen', 'listened'], correct: 0, explanation: '"Enjoy" is followed by a gerund (-ing).' },
      { text: 'She decided _____ a new job.', options: ['to find', 'finding', 'find', 'found'], correct: 0, explanation: '"Decide" is followed by an infinitive.' },
      { text: 'Would you mind _____ the window?', options: ['closing', 'to close', 'close', 'closed'], correct: 0, explanation: '"Mind" is followed by a gerund.' },
      { text: 'They want _____ on holiday next month.', options: ['to go', 'going', 'go', 'gone'], correct: 0, explanation: '"Want" is followed by an infinitive.' },
      { text: 'He stopped _____ when he was thirty.', options: ['smoking', 'to smoke', 'smoke', 'smoked'], correct: 0, explanation: '"Stop + gerund" means the action ends.' },
    ],
  },
  {
    topic: 'going to/will',
    type: 'grammar',
    questions: [
      { text: 'Look at those clouds! It _____ rain.', options: ["'s going to", "'ll", "goes to", 'is'], correct: 0, explanation: '"Going to" for predictions based on present evidence.' },
      { text: 'A: The phone is ringing! B: I _____ get it.', options: ["'ll", "'m going to", "go to", 'am'], correct: 0, explanation: '"Will" for spontaneous decisions.' },
      { text: 'They _____ move to London next year.', options: ["'re going to", "'ll", "goes to", 'move'], correct: 0, explanation: '"Going to" for plans and intentions.' },
      { text: "I promise I _____ call you tomorrow.", options: ["'ll", "'m going to", "am going", 'will have'], correct: 0, explanation: '"Will" for promises.' },
      { text: 'She _____ have a baby in June.', options: ["'s going to", "'ll", "goes to", 'is have'], correct: 0, explanation: '"Going to" for plans based on evidence.' },
    ],
  },
  {
    topic: 'Future forms',
    type: 'grammar',
    questions: [
      { text: 'I _____ see you tomorrow at 3.', options: ["'ll", "'m going to", 'am seeing', 'see'], correct: 0, explanation: '"Will" for promises and offers.' },
      { text: 'She _____ buy a new car — she saved enough money.', options: ["'s going to", "'ll", 'buys', 'bought'], correct: 0, explanation: '"Going to" for planned intentions.' },
      { text: 'The match _____ at 8 pm tonight.', options: ['starts', "'ll start", 'is going to start', 'started'], correct: 0, explanation: 'Present Simple for scheduled timetable events.' },
      { text: 'A: I can\'t open this jar. B: I _____ help you.', options: ["'ll", "'m going to", 'am helping', 'help'], correct: 0, explanation: '"Will" for spontaneous decisions.' },
      { text: 'They _____ get married in June. They booked the venue.', options: ['are getting', "'ll get", 'get', 'got'], correct: 0, explanation: 'Present Continuous for arranged future plans.' },
    ],
  },
  {
    topic: 'Comparatives/Superlatives',
    type: 'grammar',
    questions: [
      { text: 'This test is _____ the last one.', options: ['easier than', 'more easy than', 'the easiest', 'easy than'], correct: 0, explanation: 'Comparative + "than" to compare two things.' },
      { text: 'She is _____ student in the class.', options: ['the most intelligent', 'more intelligent', 'intelligenter', 'the intelligenter'], correct: 0, explanation: '"The most + adjective" for superlative of long adjectives.' },
      { text: 'Today is _____ day of the year so far.', options: ['the hottest', 'hotter', 'the most hot', 'most hottest'], correct: 0, explanation: '"The + -est" for short adjectives in superlative.' },
      { text: 'He earns _____ money than his brother.', options: ['more', 'the most', 'much', 'most'], correct: 0, explanation: '"More" with uncountable nouns for comparatives.' },
      { text: 'This is _____ film I have ever seen.', options: ['the worst', 'worse', 'the most bad', 'more bad'], correct: 0, explanation: '"Worst" is the irregular superlative of "bad".' },
    ],
  },
  {
    topic: 'Superlatives',
    type: 'grammar',
    questions: [
      { text: 'She is _____ person I know.', options: ['the kindest', 'kinder', 'the most kind', 'more kind'], correct: 0, explanation: 'Short adjectives: "the + -est" for superlative.' },
      { text: 'This is _____ book he has written.', options: ['the most interesting', 'more interesting', 'the interestingest', 'most interesting'], correct: 0, explanation: '"The most + long adjective" for superlative.' },
      { text: 'What is _____ country in the world?', options: ['the largest', 'larger', 'the most large', 'most largest'], correct: 0, explanation: '"Largest" = superlative of "large".' },
      { text: 'That was _____ meal I\'ve ever had.', options: ['the best', 'better', 'the most good', 'most good'], correct: 0, explanation: '"Best" = irregular superlative of "good".' },
    ],
  },
  {
    topic: 'Past Simple/Present Perfect 1',
    type: 'grammar',
    questions: [
      { text: 'I _____ to Rome twice in my life.', options: ['have been', 'was', 'went', 'am'], correct: 0, explanation: 'Present Perfect for experiences without a specific time.' },
      { text: 'She _____ the report yesterday.', options: ['finished', 'has finished', 'finishes', 'is finishing'], correct: 0, explanation: 'Past Simple with "yesterday".' },
      { text: '_____ you ever tried sushi?', options: ['Have', 'Did', 'Do', 'Were'], correct: 0, explanation: '"Have + ever" for life experiences.' },
      { text: 'He _____ his keys. He can\'t find them.', options: ['has lost', 'lost', 'loses', 'is losing'], correct: 0, explanation: 'Present Perfect when result affects the present.' },
      { text: 'They _____ married in 2005.', options: ['got', 'have got', 'get', 'are getting'], correct: 0, explanation: 'Past Simple with a specific date.' },
    ],
  },
  {
    topic: 'Past Simple/Present Perfect 2',
    type: 'grammar',
    questions: [
      { text: 'I _____ just _____ lunch.', options: ["have / had", "did / have", "have / have", "had / had"], correct: 0, explanation: '"Have + just + past participle" for recent actions.' },
      { text: 'She _____ already _____ that book.', options: ['has / read', 'did / read', 'is / reading', 'was / read'], correct: 0, explanation: '"Has + already" for actions sooner than expected.' },
      { text: '_____ you _____ your homework yet?', options: ['Have / done', 'Did / do', 'Are / doing', 'Do / do'], correct: 0, explanation: '"Have + yet" in questions.' },
      { text: "We _____ here for three hours already.", options: ['have been', 'were', 'are', 'have gone'], correct: 0, explanation: '"Have been + for + time period".' },
      { text: "They _____ the project last Tuesday.", options: ['completed', 'have completed', 'complete', 'are completing'], correct: 0, explanation: 'Past Simple with a specific day.' },
    ],
  },
  {
    topic: 'Present Perfect',
    type: 'grammar',
    questions: [
      { text: 'She _____ in three countries.', options: ['has lived', 'lived', 'lives', 'is living'], correct: 0, explanation: 'Present Perfect for life experiences.' },
      { text: 'I _____ that film. It\'s amazing!', options: ['have seen', 'saw', 'see', 'am seeing'], correct: 0, explanation: 'Present Perfect for recent experience.' },
      { text: '_____ he ever been to Japan?', options: ['Has', 'Did', 'Is', 'Was'], correct: 0, explanation: '"Has + ever" for third person singular experiences.' },
      { text: 'We _____ not _____ from them since Monday.', options: ['have / heard', 'did / hear', 'are / hearing', 'were / hearing'], correct: 0, explanation: '"Haven\'t heard + since" for a gap up to now.' },
    ],
  },
  {
    topic: 'ever, never, for, since',
    type: 'grammar',
    questions: [
      { text: 'Have you _____ been to Australia?', options: ['ever', 'never', 'for', 'since'], correct: 0, explanation: '"Ever" in questions about life experiences.' },
      { text: 'I have _____ tasted anything so delicious.', options: ['never', 'ever', 'for', 'since'], correct: 0, explanation: '"Never" in negative statements about experiences.' },
      { text: 'She has lived here _____ 2012.', options: ['since', 'for', 'ever', 'never'], correct: 0, explanation: '"Since" with a specific point in time.' },
      { text: "He has worked there _____ ten years.", options: ['for', 'since', 'ever', 'never'], correct: 0, explanation: '"For" with a period of time.' },
      { text: 'Have you _____ eaten snails? — No, I\'ve _____ tried them.', options: ['ever / never', 'never / ever', 'for / since', 'since / for'], correct: 0, explanation: '"Ever" in questions, "never" in negative answers.' },
    ],
  },
  {
    topic: 'For and since',
    type: 'grammar',
    questions: [
      { text: 'She has worked here _____ 2019.', options: ['since', 'for', 'ago', 'during'], correct: 0, explanation: '"Since" with a specific starting point.' },
      { text: 'I have known him _____ ten years.', options: ['for', 'since', 'ago', 'while'], correct: 0, explanation: '"For" with a duration.' },
      { text: 'They have been married _____ a long time.', options: ['for', 'since', 'ago', 'from'], correct: 0, explanation: '"For" describes the length of time.' },
      { text: 'She has been ill _____ Monday.', options: ['since', 'for', 'ago', 'at'], correct: 0, explanation: '"Since" introduces a specific point in time.' },
      { text: 'He left two hours _____.', options: ['ago', 'since', 'for', 'before'], correct: 0, explanation: '"Ago" is used with past simple for time before now.' },
    ],
  },
  {
    topic: "(don't) have to/should",
    type: 'grammar',
    questions: [
      { text: 'You _____ wear a seatbelt. It\'s the law.', options: ['have to', 'should', "don't have to", "shouldn't"], correct: 0, explanation: '"Have to" expresses obligation.' },
      { text: 'You _____ eat more vegetables. It\'s good for you.', options: ['should', 'have to', "shouldn't", "must not"], correct: 0, explanation: '"Should" gives advice.' },
      { text: 'Children _____ go to school. It\'s compulsory.', options: ['have to', 'should', "don't have to", "shouldn't"], correct: 0, explanation: '"Have to" for legal obligation.' },
      { text: 'It\'s Sunday. I _____ get up early.', options: ["don't have to", "shouldn't", "mustn't", "have to"], correct: 0, explanation: '"Don\'t have to" means not necessary.' },
      { text: 'You _____ tell anyone. It\'s a secret.', options: ["shouldn't", 'should', 'have to', "don't have to"], correct: 0, explanation: '"Shouldn\'t" advises against something.' },
    ],
  },
  {
    topic: 'should / must / have to 1',
    type: 'grammar',
    questions: [
      { text: 'You _____ see a doctor. You look terrible.', options: ['should', 'must', 'have to', "don't have to"], correct: 0, explanation: '"Should" for advice.' },
      { text: 'All students _____ bring their ID to the exam.', options: ['must', 'should', "don't have to", "mustn't"], correct: 0, explanation: '"Must" for strong obligation/rules.' },
      { text: 'You _____ forget your passport.', options: ["mustn't", "don't have to", "shouldn't have", "haven't to"], correct: 0, explanation: '"Mustn\'t" for prohibition.' },
      { text: 'You _____ pay — it\'s free!', options: ["don't have to", "mustn't", "shouldn't", "can't"], correct: 0, explanation: '"Don\'t have to" = not necessary.' },
      { text: 'I think you _____ apologise to her.', options: ['should', 'must', 'have to', 'need'], correct: 0, explanation: '"Should" for personal advice.' },
    ],
  },
  {
    topic: 'should / must / have to 2',
    type: 'grammar',
    questions: [
      { text: 'Passengers _____ not smoke on the plane.', options: ['must', 'should', 'have', "don't have to"], correct: 0, explanation: '"Must not" for rules and prohibitions.' },
      { text: 'She _____ practise more if she wants to improve.', options: ['should', 'must', "doesn't have to", "mustn't"], correct: 0, explanation: '"Should" for recommendation.' },
      { text: 'Do I _____ wear a tie?', options: ['have to', 'should', 'must', 'need'], correct: 0, explanation: '"Have to" in questions about obligation.' },
      { text: 'You _____ hurry — we\'ve got plenty of time.', options: ["don't have to", "mustn't", "shouldn't", "can't"], correct: 0, explanation: '"Don\'t have to" means it\'s not necessary.' },
    ],
  },
  {
    topic: 'so/such',
    type: 'grammar',
    questions: [
      { text: 'It was _____ a nice day that we went to the beach.', options: ['such', 'so', 'very', 'too'], correct: 0, explanation: '"Such" before a noun phrase (a/an + adjective + noun).' },
      { text: 'The music was _____ loud that I couldn\'t hear.', options: ['so', 'such', 'very', 'too'], correct: 0, explanation: '"So" before an adjective or adverb.' },
      { text: 'She has _____ good ideas!', options: ['such', 'so', 'very', 'too'], correct: 0, explanation: '"Such" before a plural noun phrase.' },
      { text: 'He drove _____ fast that he got a ticket.', options: ['so', 'such', 'very', 'too'], correct: 0, explanation: '"So" before an adverb.' },
      { text: 'It was _____ beautiful weather that we stayed outside.', options: ['such', 'so', 'very', 'too'], correct: 0, explanation: '"Such" before uncountable noun phrase.' },
    ],
  },
  {
    topic: 'Passives 1',
    type: 'grammar',
    questions: [
      { text: 'The letter _____ every day.', options: ['is delivered', 'delivers', 'is delivering', 'has delivered'], correct: 0, explanation: 'Present Simple passive: is/are + past participle.' },
      { text: 'The car _____ last night.', options: ['was stolen', 'stole', 'is stolen', 'stolen'], correct: 0, explanation: 'Past Simple passive: was/were + past participle.' },
      { text: 'Three people _____ in the accident.', options: ['were injured', 'injured', 'are injured', 'have injured'], correct: 0, explanation: 'Past Simple passive for completed past events.' },
      { text: 'English _____ all over the world.', options: ['is spoken', 'speaks', 'is speaking', 'spoke'], correct: 0, explanation: 'Present Simple passive for general truths.' },
      { text: 'The windows _____ once a week.', options: ['are cleaned', 'clean', 'are cleaning', 'cleaned'], correct: 0, explanation: '"Are" for plural subjects in Present Simple passive.' },
    ],
  },
  {
    topic: 'Passives 2',
    type: 'grammar',
    questions: [
      { text: 'This castle _____ in the 12th century.', options: ['was built', 'built', 'is built', 'has built'], correct: 0, explanation: 'Past Simple passive for historical facts.' },
      { text: 'The new hospital _____ next year.', options: ['will be opened', 'will open', 'is opened', 'has been opened'], correct: 0, explanation: 'Future passive: will be + past participle.' },
      { text: 'These paintings _____ by Picasso.', options: ['were painted', 'painted', 'are painting', 'have painted'], correct: 0, explanation: 'Past Simple passive + "by" for the agent.' },
      { text: 'The report _____ by Friday.', options: ['must be finished', 'must finish', 'is finishing', 'finished'], correct: 0, explanation: 'Modal passive: modal + be + past participle.' },
      { text: 'A new shopping centre _____ near here.', options: ['is being built', 'is building', 'has built', 'was building'], correct: 0, explanation: 'Present Continuous passive for ongoing actions.' },
    ],
  },
  {
    topic: 'Present Perfect Simple/Continuous',
    type: 'grammar',
    questions: [
      { text: 'She _____ for hours — her eyes are red.', options: ['has been crying', 'has cried', 'is crying', 'cries'], correct: 0, explanation: 'Present Perfect Continuous for recent ongoing activity.' },
      { text: 'I _____ three emails this morning.', options: ['have written', 'have been writing', 'wrote', 'am writing'], correct: 0, explanation: 'Present Perfect Simple for completed result.' },
      { text: 'How long _____ you _____ here?', options: ['have / been working', 'did / work', 'are / working', 'were / working'], correct: 0, explanation: 'Present Perfect Continuous with "how long".' },
      { text: 'They _____ all the sandwiches. There\'s nothing left.', options: ['have eaten', 'have been eating', 'ate', 'are eating'], correct: 0, explanation: 'Present Perfect Simple when the result is visible.' },
      { text: 'He _____ that book all week but still hasn\'t finished it.', options: ['has been reading', 'has read', 'read', 'is reading'], correct: 0, explanation: 'Present Perfect Continuous for ongoing action over time.' },
    ],
  },
  {
    topic: 'Time and conditional clauses',
    type: 'grammar',
    questions: [
      { text: 'Call me when you _____ home.', options: ['get', 'will get', 'got', 'are getting'], correct: 0, explanation: 'Present Simple after "when" in future time clauses.' },
      { text: 'If it _____ tomorrow, we\'ll cancel the trip.', options: ['rains', 'will rain', 'rained', 'is raining'], correct: 0, explanation: 'Present Simple in the "if" clause of first conditional.' },
      { text: 'I\'ll wait here until she _____.', options: ['arrives', 'will arrive', 'arrived', 'is arriving'], correct: 0, explanation: 'Present Simple after "until".' },
      { text: 'As soon as the meeting _____, we can leave.', options: ['ends', 'will end', 'ended', 'has ended'], correct: 0, explanation: 'Present Simple after "as soon as".' },
      { text: 'Before you _____ to bed, switch off the lights.', options: ['go', 'will go', 'went', 'are going'], correct: 0, explanation: 'Present Simple after "before" in future clauses.' },
    ],
  },
  {
    topic: 'Second conditional',
    type: 'grammar',
    questions: [
      { text: 'If I _____ a car, I\'d drive to work.', options: ['had', 'have', 'would have', 'will have'], correct: 0, explanation: 'Past Simple in the "if" clause of second conditional.' },
      { text: 'If she _____ taller, she would be a model.', options: ['were', 'is', 'would be', 'has been'], correct: 0, explanation: '"Were" in second conditional for all persons.' },
      { text: 'I _____ a better job if I spoke better English.', options: ['would get', 'will get', 'got', 'get'], correct: 0, explanation: '"Would + infinitive" in the result clause.' },
      { text: 'What would you do if you _____ a million euros?', options: ['won', 'win', 'would win', 'had won'], correct: 0, explanation: 'Past Simple after "if" in second conditional.' },
      { text: 'If he _____ harder, he\'d pass the exam.', options: ['studied', 'studies', 'would study', 'has studied'], correct: 0, explanation: 'Past Simple in the "if" clause.' },
    ],
  },
  {
    topic: 'would/might',
    type: 'grammar',
    questions: [
      { text: 'I _____ love to travel around the world.', options: ['would', 'might', 'will', 'should'], correct: 0, explanation: '"Would" for wishes and hypothetical preferences.' },
      { text: 'It _____ rain later — take an umbrella.', options: ['might', 'would', 'will', 'must'], correct: 0, explanation: '"Might" for possibility (less certain).' },
      { text: '_____ you like some more tea?', options: ['Would', 'Might', 'Do', 'Should'], correct: 0, explanation: '"Would you like" is a polite offer.' },
      { text: 'She _____ be at home — try calling her.', options: ['might', 'would', 'will', 'should'], correct: 0, explanation: '"Might" for uncertainty.' },
      { text: 'I _____ rather stay at home tonight.', options: ['would', 'might', 'will', 'should'], correct: 0, explanation: '"Would rather" for preference.' },
    ],
  },
  {
    topic: 'Past Perfect and Past Simple',
    type: 'grammar',
    questions: [
      { text: 'When we arrived, the film _____ already _____.', options: ['had / started', 'was / starting', 'has / started', 'did / start'], correct: 0, explanation: 'Past Perfect for an action before another past action.' },
      { text: 'She _____ the report before the meeting.', options: ['had finished', 'finished', 'has finished', 'was finishing'], correct: 0, explanation: 'Past Perfect for action completed before a past moment.' },
      { text: 'By the time I got there, they _____.', options: ['had left', 'left', 'have left', 'were leaving'], correct: 0, explanation: '"By the time" + Past Perfect for the earlier action.' },
      { text: 'I didn\'t recognise her because she _____ her hair.', options: ['had changed', 'changed', 'has changed', 'was changing'], correct: 0, explanation: 'Past Perfect for the reason behind a past event.' },
      { text: 'He was tired because he _____ all day.', options: ['had been working', 'worked', 'has worked', 'was working'], correct: 0, explanation: 'Past Perfect Continuous for ongoing past action before another.' },
    ],
  },
  {
    topic: 'Question tags',
    type: 'grammar',
    questions: [
      { text: 'It\'s a lovely day, _____ it?', options: ["isn't", "is", "wasn't", "doesn't"], correct: 0, explanation: 'Positive sentence → negative tag.' },
      { text: 'You can swim, _____ you?', options: ["can't", "can", "don't", "aren't"], correct: 0, explanation: '"Can" → "can\'t" in the tag.' },
      { text: 'She hasn\'t called, _____ she?', options: ['has', "hasn't", 'did', 'does'], correct: 0, explanation: 'Negative sentence → positive tag.' },
      { text: 'They live in London, _____ they?', options: ["don't", "do", "aren't", "didn't"], correct: 0, explanation: 'Present Simple → "don\'t" in negative tag.' },
      { text: 'You were there last night, _____ you?', options: ["weren't", "were", "didn't", "don't"], correct: 0, explanation: '"Were" → "weren\'t" in negative tag.' },
    ],
  },
];

// ─── INTERMEDIATE ─────────────────────────────────────────────────────────────
const INTERMEDIATE: HSection[] = [
  {
    topic: 'Present Perfect Simple and Continuous',
    type: 'grammar',
    questions: [
      { text: 'I _____ this exercise three times and I still don\'t understand it.', options: ['have done', 'have been doing', 'did', 'am doing'], correct: 0, explanation: 'Present Perfect Simple for completed repetitions.' },
      { text: 'You look exhausted. What _____ you _____?', options: ['have / been doing', 'did / do', 'are / doing', 'have / done'], correct: 0, explanation: 'Present Perfect Continuous for recent ongoing activity.' },
      { text: 'She _____ three novels this year.', options: ['has written', 'has been writing', 'wrote', 'is writing'], correct: 0, explanation: 'Present Perfect Simple emphasises completed number.' },
      { text: 'He _____ in the garden all morning — he\'s very muddy.', options: ['has been working', 'has worked', 'worked', 'is working'], correct: 0, explanation: 'Present Perfect Continuous shows ongoing duration.' },
      { text: 'We _____ for the bus for 20 minutes.', options: ['have been waiting', 'have waited', 'are waiting', 'wait'], correct: 0, explanation: 'Present Perfect Continuous for actions still in progress.' },
    ],
  },
  {
    topic: 'Narrative tenses',
    type: 'grammar',
    questions: [
      { text: 'When I arrived, everyone _____ already.', options: ['had left', 'left', 'was leaving', 'leaves'], correct: 0, explanation: 'Past Perfect for an action before a past moment.' },
      { text: 'She _____ when the alarm went off.', options: ['was sleeping', 'slept', 'had slept', 'sleep'], correct: 0, explanation: 'Past Continuous for background action.' },
      { text: 'He _____ the door and _____ inside.', options: ['opened / walked', 'was opening / walked', 'had opened / was walking', 'opens / walks'], correct: 0, explanation: 'Past Simple for sequential narrative events.' },
      { text: 'By the time the police arrived, the thief _____.', options: ['had escaped', 'escaped', 'was escaping', 'has escaped'], correct: 0, explanation: 'Past Perfect for action before another past action.' },
      { text: 'I _____ to study medicine but changed my mind.', options: ['had planned', 'planned', 'was planning', 'have planned'], correct: 0, explanation: 'Past Perfect for an earlier intention.' },
    ],
  },
  {
    topic: 'Passives',
    type: 'grammar',
    questions: [
      { text: 'The pyramids _____ by the ancient Egyptians.', options: ['were built', 'built', 'are built', 'have been built'], correct: 0, explanation: 'Past Simple passive with "by + agent".' },
      { text: 'A new bridge _____ at the moment.', options: ['is being constructed', 'is constructing', 'constructs', 'was constructing'], correct: 0, explanation: 'Present Continuous passive for ongoing work.' },
      { text: 'The results _____ next week.', options: ['will be announced', 'will announce', 'are announced', 'announced'], correct: 0, explanation: 'Future passive: will be + past participle.' },
      { text: 'The patient _____ to hospital immediately.', options: ['was taken', 'took', 'was taking', 'has taken'], correct: 0, explanation: 'Past Simple passive for a completed action.' },
      { text: 'The suspect _____ for questioning.', options: ['has been arrested', 'has arrested', 'arrested', 'is arresting'], correct: 0, explanation: 'Present Perfect passive for recent action.' },
    ],
  },
  {
    topic: 'Modal verbs',
    type: 'grammar',
    questions: [
      { text: 'You _____ be tired after such a long journey.', options: ['must', 'can', 'might', 'should'], correct: 0, explanation: '"Must" for logical deduction.' },
      { text: 'She _____ have left already — her coat is gone.', options: ['must', 'might', 'can', 'should'], correct: 0, explanation: '"Must have" for a certain deduction about the past.' },
      { text: 'He _____ be at home. I saw him in town.', options: ["can't", "mustn't", "shouldn't", "wouldn't"], correct: 0, explanation: '"Can\'t" for logical impossibility.' },
      { text: 'You _____ have called first — it\'s very late.', options: ['should', 'must', 'can', 'would'], correct: 0, explanation: '"Should have" for criticism about the past.' },
      { text: 'It _____ rain tomorrow — bring an umbrella.', options: ['might', 'must', "can't", 'should'], correct: 0, explanation: '"Might" for possibility.' },
    ],
  },
  {
    topic: 'Conditionals',
    type: 'grammar',
    questions: [
      { text: 'If you _____ enough, you\'ll pass.', options: ['study', 'studied', 'will study', 'would study'], correct: 0, explanation: 'First conditional: Present Simple in if-clause.' },
      { text: 'If I _____ you, I\'d leave immediately.', options: ['were', 'am', 'would be', 'will be'], correct: 0, explanation: 'Second conditional: "were" in if-clause.' },
      { text: 'If she _____ harder, she would have passed.', options: ['had worked', 'worked', 'has worked', 'would work'], correct: 0, explanation: 'Third conditional: Past Perfect in if-clause.' },
      { text: 'I _____ him if I see him.', options: ["'ll tell", 'would tell', 'told', 'have told'], correct: 0, explanation: 'First conditional result clause: will.' },
      { text: 'She _____ happier if she changed jobs.', options: ['would be', 'will be', 'is', 'was'], correct: 0, explanation: 'Second conditional result clause: would.' },
    ],
  },
  {
    topic: 'Relative clauses',
    type: 'grammar',
    questions: [
      { text: 'The woman _____ lives next door is a doctor.', options: ['who', 'which', 'whose', 'whom'], correct: 0, explanation: '"Who" introduces a relative clause for people.' },
      { text: 'The film _____ we saw last night was excellent.', options: ['that', 'who', 'whose', 'whom'], correct: 0, explanation: '"That" or "which" for things in relative clauses.' },
      { text: 'She is the person _____ bag was stolen.', options: ['whose', 'who', 'which', 'that'], correct: 0, explanation: '"Whose" shows possession in relative clauses.' },
      { text: 'The hotel _____ we stayed was beautiful.', options: ['where', 'which', 'who', 'that'], correct: 0, explanation: '"Where" for places in relative clauses.' },
      { text: 'That is the man _____ I told you about.', options: ['who', 'which', 'whose', 'what'], correct: 0, explanation: '"Who" or "that" for people as objects.' },
    ],
  },
];

// ─── UPPER-INTERMEDIATE ───────────────────────────────────────────────────────
const UPPER_INT: HSection[] = [
  {
    topic: 'Inversion',
    type: 'grammar',
    questions: [
      { text: 'Not only _____ late, but he also forgot his keys.', options: ['was he', 'he was', 'did he was', 'he did'], correct: 0, explanation: 'After "not only", use inversion: auxiliary + subject.' },
      { text: 'Rarely _____ seen such a beautiful sunset.', options: ['have I', 'I have', 'did I', 'I did'], correct: 0, explanation: 'After negative adverbs, use inversion.' },
      { text: 'Never _____ to a more interesting lecture.', options: ['have I been', 'I have been', 'did I go', 'I went'], correct: 0, explanation: '"Never" + inversion: have + subject + past participle.' },
      { text: 'Only after the meeting _____ what had happened.', options: ['did she realise', 'she realised', 'she did realise', 'had she realised'], correct: 0, explanation: '"Only after" triggers inversion in the main clause.' },
    ],
  },
  {
    topic: 'Modal verbs — deduction',
    type: 'grammar',
    questions: [
      { text: 'He _____ have been at the party — he was abroad.', options: ["can't", "mustn't", "mightn't", "shouldn't"], correct: 0, explanation: '"Can\'t have" for impossible deductions about the past.' },
      { text: 'She _____ have worked very hard — she got top marks.', options: ['must', 'can', 'might', 'should'], correct: 0, explanation: '"Must have" for certain logical deductions.' },
      { text: 'They _____ have taken a wrong turn — they\'re very late.', options: ['might', 'must', "can't", 'should'], correct: 0, explanation: '"Might have" for possible explanations in the past.' },
      { text: 'You _____ have told me earlier!', options: ['should', 'must', 'can', 'will'], correct: 0, explanation: '"Should have" for criticism about past actions.' },
      { text: 'The lights are off — she _____ have left already.', options: ['must', 'can', 'should', 'might not'], correct: 0, explanation: '"Must have" for logical conclusion based on evidence.' },
    ],
  },
  {
    topic: 'Conditionals — mixed',
    type: 'grammar',
    questions: [
      { text: 'If she _____ the contract, she would be a millionaire now.', options: ['had signed', 'signed', 'has signed', 'would sign'], correct: 0, explanation: 'Mixed conditional: Past Perfect for hypothetical past, would for present result.' },
      { text: 'I _____ here now if I hadn\'t taken that job.', options: ["wouldn't be", "won't be", "hadn't been", "isn't"], correct: 0, explanation: 'Mixed conditional result refers to the present.' },
      { text: 'If you were more careful, you _____ made that mistake.', options: ["wouldn't have", "won't have", "didn't", "hadn't"], correct: 0, explanation: 'Mixed third/second conditional.' },
      { text: 'Had I known earlier, I _____ differently.', options: ['would have acted', 'will act', 'act', 'acted'], correct: 0, explanation: 'Inverted conditional with "had + past participle".' },
    ],
  },
  {
    topic: 'Reported speech',
    type: 'grammar',
    questions: [
      { text: 'She said she _____ tired.', options: ['was', 'is', 'were', 'be'], correct: 0, explanation: 'Backshift: "am/is" → "was" in reported speech.' },
      { text: 'He told me he _____ call me the next day.', options: ['would', 'will', 'can', 'is going to'], correct: 0, explanation: '"Will" → "would" in reported speech backshift.' },
      { text: 'She asked if I _____ help her.', options: ['could', 'can', 'will', 'am able'], correct: 0, explanation: '"Can" → "could" in reported questions.' },
      { text: 'They said they _____ finished by Monday.', options: ['would have', 'will have', 'have', 'had'], correct: 0, explanation: '"Will have" → "would have" in reported speech.' },
      { text: 'He admitted he _____ the mistake.', options: ['had made', 'made', 'has made', 'makes'], correct: 0, explanation: 'Past Simple → Past Perfect in reported speech.' },
    ],
  },
];

// ─── ADVANCED ─────────────────────────────────────────────────────────────────
const ADVANCED: HSection[] = [
  {
    topic: 'Cleft sentences',
    type: 'grammar',
    questions: [
      { text: '_____ that surprised me most was his reaction.', options: ['What', 'That', 'It', 'Which'], correct: 0, explanation: '"What" starts a cleft sentence to emphasise information.' },
      { text: 'It _____ John who broke the window.', options: ['was', 'is', 'had', 'were'], correct: 0, explanation: '"It was ... who/that" for emphasis.' },
      { text: '_____ I really need is a long holiday.', options: ['What', 'That', 'It', 'Which'], correct: 0, explanation: '"What + subject + need" for emphasis.' },
      { text: 'It was in Paris _____ they first met.', options: ['that', 'where', 'which', 'when'], correct: 0, explanation: '"It was ... that" for place emphasis.' },
    ],
  },
  {
    topic: 'Subjunctive',
    type: 'grammar',
    questions: [
      { text: 'The committee recommended that he _____ present.', options: ['be', 'is', 'was', 'were'], correct: 0, explanation: 'Mandative subjunctive uses base form after "recommend that".' },
      { text: 'It is essential that she _____ on time.', options: ['arrive', 'arrives', 'arrived', 'would arrive'], correct: 0, explanation: 'Subjunctive base form after "it is essential that".' },
      { text: 'If I _____ you, I\'d take the offer.', options: ['were', 'was', 'am', 'would be'], correct: 0, explanation: '"If I were you" is the standard subjunctive form.' },
      { text: 'They suggested that he _____ early.', options: ['leave', 'leaves', 'left', 'would leave'], correct: 0, explanation: 'Mandative subjunctive base form after "suggest that".' },
    ],
  },
  {
    topic: 'Complex conditionals',
    type: 'grammar',
    questions: [
      { text: '_____ I known about the problem, I would have fixed it.', options: ['Had', 'If', 'Should', 'Were'], correct: 0, explanation: '"Had + subject + past participle" for inverted third conditional.' },
      { text: '_____ you need any help, don\'t hesitate to call.', options: ['Should', 'Had', 'Were', 'Would'], correct: 0, explanation: '"Should you need" is a formal inverted first conditional.' },
      { text: '_____ I in your position, I\'d resign immediately.', options: ['Were', 'Had', 'Should', 'Would'], correct: 0, explanation: '"Were + subject" is a formal inverted second conditional.' },
      { text: 'Provided that she _____ hard, she will succeed.', options: ['works', 'worked', 'will work', 'has worked'], correct: 0, explanation: '"Provided that" + Present Simple for first conditional.' },
    ],
  },
  {
    topic: 'Advanced passives',
    type: 'grammar',
    questions: [
      { text: 'She _____ to be very talented by her teachers.', options: ['is considered', 'considers', 'is considering', 'has considered'], correct: 0, explanation: '"Is considered to be" — passive with reporting verb.' },
      { text: 'The deal _____ to be completed by March.', options: ['is expected', 'expects', 'is expecting', 'was expecting'], correct: 0, explanation: '"Is expected to" for future passive expectation.' },
      { text: 'He _____ have given the wrong information.', options: ['is thought to', 'thinks to', 'is thinking to', 'thought to'], correct: 0, explanation: '"Is thought to have + past participle" for passive deduction.' },
      { text: 'The report _____ the findings clearly.', options: ['is said to present', 'says to present', 'is saying to present', 'said to present'], correct: 0, explanation: '"Is said to + infinitive" for passive reporting.' },
    ],
  },
];

// ─── MASTER MAP ───────────────────────────────────────────────────────────────
export const HEADWAY_QUESTIONS: Record<string, HSection[]> = {
  'Beginner': BEGINNER,
  'Elementary': ELEMENTARY,
  'Pre-Intermediate': PREINT,
  'Intermediate': INTERMEDIATE,
  'Upper-Intermediate': UPPER_INT,
  'Advanced': ADVANCED,
};

// ─── FALLBACK TEMPLATE GENERATOR ─────────────────────────────────────────────
// Used when a topic isn't in the static bank — generates plausible questions
// from keyword-matched templates. Uses Date.now() as seed for variety.

const TOPIC_TEMPLATE_MAP: Array<{ keywords: string[]; questions: HQuestion[] }> = [
  {
    keywords: ['present simple', 'present tense', 'simple present'],
    questions: [
      { text: 'She _____ to work by bus every morning.', options: ['travels', 'is travelling', 'travelled', 'travel'], correct: 0, explanation: 'Present Simple for regular habits.' },
      { text: 'They _____ dinner at 7 every evening.', options: ['have', 'are having', 'had', 'has'], correct: 0, explanation: 'Present Simple for routine.' },
      { text: 'He _____ three languages fluently.', options: ['speaks', 'is speaking', 'spoke', 'speak'], correct: 0, explanation: 'Third person singular: add -s.' },
      { text: '_____ she usually walk to school?', options: ['Does', 'Do', 'Is', 'Was'], correct: 0, explanation: '"Does" for third person singular questions.' },
      { text: 'Water _____ at 0 degrees.', options: ['freezes', 'is freezing', 'froze', 'freeze'], correct: 0, explanation: 'Facts use Present Simple.' },
      { text: 'I _____ coffee. I prefer tea.', options: ["don't drink", "doesn't drink", "am not drinking", "didn't drink"], correct: 0, explanation: '"Don\'t" for I/you/we/they negative.' },
    ],
  },
  {
    keywords: ['past simple', 'simple past', 'past tense'],
    questions: [
      { text: 'She _____ to school yesterday.', options: ['walked', 'walks', 'is walking', 'has walked'], correct: 0, explanation: 'Past Simple for completed past actions.' },
      { text: 'We _____ a fantastic film last night.', options: ['watched', 'watch', 'are watching', 'have watched'], correct: 0, explanation: '"Last night" signals Past Simple.' },
      { text: 'He _____ call me — I waited all evening.', options: ["didn't", "doesn't", "isn't", "hasn't"], correct: 0, explanation: '"Didn\'t + base verb" for past negative.' },
      { text: '_____ you enjoy the concert?', options: ['Did', 'Do', 'Are', 'Have'], correct: 0, explanation: '"Did" for past simple questions.' },
      { text: 'They _____ married five years ago.', options: ['got', 'get', 'have got', 'are getting'], correct: 0, explanation: 'Past Simple with "ago".' },
    ],
  },
  {
    keywords: ['present continuous', 'continuous present', 'progressive'],
    questions: [
      { text: 'She _____ a meeting right now.', options: ['is having', 'has', 'had', 'have'], correct: 0, explanation: 'Present Continuous for actions in progress now.' },
      { text: 'They _____ to loud music at the moment.', options: ['are listening', 'listen', 'listened', 'listens'], correct: 0, explanation: '"Are + -ing" for current ongoing actions.' },
      { text: 'I _____ on a new project this month.', options: ['am working', 'work', 'worked', 'works'], correct: 0, explanation: 'Present Continuous for a temporary activity.' },
      { text: '_____ you doing anything tomorrow evening?', options: ['Are', 'Do', 'Did', 'Were'], correct: 0, explanation: 'Present Continuous for future arrangements.' },
    ],
  },
  {
    keywords: ['present perfect', 'perfect'],
    questions: [
      { text: 'She _____ to Japan twice.', options: ['has been', 'was', 'went', 'is'], correct: 0, explanation: 'Present Perfect for life experiences.' },
      { text: 'I _____ my homework — can we go out now?', options: ["'ve finished", 'finished', 'finish', "was finishing"], correct: 0, explanation: 'Present Perfect for recently completed action.' },
      { text: '_____ you ever eaten octopus?', options: ['Have', 'Did', 'Are', 'Do'], correct: 0, explanation: '"Have + ever" for life experiences.' },
      { text: 'They _____ just _____ the news.', options: ['have / heard', 'did / hear', 'are / hearing', 'were / hearing'], correct: 0, explanation: '"Have + just + past participle".' },
      { text: 'He _____ that book before.', options: ['has read', 'read', 'reads', 'is reading'], correct: 0, explanation: 'Present Perfect for past experience.' },
    ],
  },
  {
    keywords: ['future', 'will', 'going to'],
    questions: [
      { text: 'I _____ help you carry those bags.', options: ["'ll", "'m going to", 'am', 'was'], correct: 0, explanation: '"Will" for spontaneous offers.' },
      { text: 'She _____ visit her parents this weekend.', options: ["'s going to", "'ll", 'visits', 'visited'], correct: 0, explanation: '"Going to" for planned intentions.' },
      { text: 'Look at those clouds — it _____ snow.', options: ["'s going to", "'ll", 'snows', 'snowed'], correct: 0, explanation: '"Going to" for predictions based on evidence.' },
      { text: 'The train _____ at 9:15.', options: ['leaves', 'is leaving', "'ll leave", 'left'], correct: 0, explanation: 'Timetabled events use Present Simple.' },
    ],
  },
  {
    keywords: ['conditional', 'if clause', 'hypothesis'],
    questions: [
      { text: 'If you _____ early, you\'ll get a good seat.', options: ['arrive', 'arrived', 'will arrive', 'would arrive'], correct: 0, explanation: 'First conditional: Present Simple in if-clause.' },
      { text: 'If I _____ more money, I\'d travel the world.', options: ['had', 'have', 'would have', 'will have'], correct: 0, explanation: 'Second conditional: Past Simple in if-clause.' },
      { text: 'If she had studied, she _____ the exam.', options: ['would have passed', 'will pass', 'passes', 'passed'], correct: 0, explanation: 'Third conditional result clause.' },
      { text: 'I _____ help you if I had time.', options: ['would', 'will', 'did', "won't"], correct: 0, explanation: '"Would" in the second conditional result.' },
    ],
  },
  {
    keywords: ['passive', 'passive voice'],
    questions: [
      { text: 'The building _____ in the 19th century.', options: ['was built', 'built', 'is built', 'builds'], correct: 0, explanation: 'Past Simple passive: was + past participle.' },
      { text: 'These products _____ all over the world.', options: ['are sold', 'sell', 'sold', 'are selling'], correct: 0, explanation: 'Present Simple passive for general facts.' },
      { text: 'The new law _____ next year.', options: ['will be introduced', 'will introduce', 'introduces', 'introduced'], correct: 0, explanation: 'Future passive: will be + past participle.' },
      { text: 'The car _____ before the race.', options: ['had been checked', 'checked', 'was checking', 'checks'], correct: 0, explanation: 'Past Perfect passive.' },
    ],
  },
  {
    keywords: ['modal', 'can', 'could', 'should', 'must', 'might', 'ability', 'permission'],
    questions: [
      { text: 'You _____ smoke in here — it\'s not allowed.', options: ["can't", "don't", "mustn't", "shouldn't"], correct: 0, explanation: '"Can\'t" for prohibition.' },
      { text: 'She _____ play the violin when she was five.', options: ['could', 'can', 'should', 'must'], correct: 0, explanation: '"Could" for past ability.' },
      { text: 'You _____ try the local food — it\'s delicious!', options: ['should', 'must', "can't", "don't have to"], correct: 0, explanation: '"Should" for recommendation.' },
      { text: 'He _____ be the new manager — he seems very confident.', options: ['must', 'can', 'might', 'should'], correct: 0, explanation: '"Must" for logical deduction.' },
    ],
  },
  {
    keywords: ['article', 'the', 'a', 'an', 'articles'],
    questions: [
      { text: 'Can you close _____ door, please?', options: ['the', 'a', 'an', '-'], correct: 0, explanation: '"The" for specific items known to both speaker and listener.' },
      { text: 'I\'d like _____ apple, please.', options: ['an', 'a', 'the', '-'], correct: 0, explanation: '"An" before vowel sounds.' },
      { text: 'She is _____ architect.', options: ['an', 'a', 'the', '-'], correct: 0, explanation: '"An" before vowel sounds.' },
      { text: 'They play _____ football at school.', options: ['-', 'the', 'a', 'an'], correct: 0, explanation: 'No article with sports.' },
      { text: '_____ Nile is the longest river in the world.', options: ['The', 'A', 'An', '-'], correct: 0, explanation: '"The" with river names.' },
    ],
  },
  {
    keywords: ['comparative', 'superlative', 'comparison', 'adjective'],
    questions: [
      { text: 'This jacket is _____ than the blue one.', options: ['more expensive', 'expensiver', 'the most expensive', 'most expensive'], correct: 0, explanation: '"More + adjective" for long adjective comparatives.' },
      { text: 'He is _____ student in the class.', options: ['the tallest', 'taller', 'the most tall', 'more tall'], correct: 0, explanation: 'Short adjective superlative: "the + -est".' },
      { text: 'The weather is _____ today than yesterday.', options: ['worse', 'more bad', 'the worst', 'badder'], correct: 0, explanation: '"Worse" is the irregular comparative of "bad".' },
      { text: 'This is _____ view I\'ve ever seen.', options: ['the most beautiful', 'more beautiful', 'the beautifulest', 'beautifuler'], correct: 0, explanation: '"The most + long adjective" for superlative.' },
    ],
  },
  {
    keywords: ['vocabulary', 'words', 'phrases', 'expressions', 'idioms', 'phrasal'],
    questions: [
      { text: 'I _____ up late studying for the exam last night.', options: ['stayed', 'stay', 'am staying', 'have stayed'], correct: 0, explanation: '"Stay up" = to go to bed late (phrasal verb).' },
      { text: 'She _____ with her colleagues very well.', options: ['gets on', 'gets up', 'gets in', 'gets out'], correct: 0, explanation: '"Get on with" = have a good relationship.' },
      { text: 'Don\'t worry — things will _____ in the end.', options: ['work out', 'work up', 'work in', 'work off'], correct: 0, explanation: '"Work out" = to resolve satisfactorily.' },
      { text: 'She _____ her grandmother — both are very patient.', options: ['takes after', 'takes up', 'takes over', 'takes off'], correct: 0, explanation: '"Take after" = to resemble a family member.' },
    ],
  },
];

function findTemplateQuestions(topic: string): HQuestion[] {
  const t = topic.toLowerCase();
  for (const entry of TOPIC_TEMPLATE_MAP) {
    if (entry.keywords.some(k => t.includes(k) || k.includes(t.split(' ')[0]))) {
      return entry.questions;
    }
  }
  // Generic fallback
  return [
    { text: 'She _____ to work every day.', options: ['goes', 'is going', 'went', 'has gone'], correct: 0, explanation: 'Present Simple for habits.' },
    { text: 'They _____ football on Saturdays.', options: ['play', 'plays', 'are playing', 'played'], correct: 0, explanation: 'Present Simple for regular activities.' },
    { text: 'I _____ finished my homework.', options: ['have', 'did', 'am', 'was'], correct: 0, explanation: 'Present Perfect with past participle.' },
    { text: 'He _____ very hard yesterday.', options: ['worked', 'works', 'is working', 'has worked'], correct: 0, explanation: 'Past Simple for completed action.' },
    { text: '_____ she speak French?', options: ['Does', 'Do', 'Is', 'Has'], correct: 0, explanation: '"Does" for third person singular questions.' },
    { text: 'We _____ the meeting tomorrow.', options: ['are attending', 'attend', 'attended', 'attends'], correct: 0, explanation: 'Present Continuous for arranged future events.' },
  ];
}

/**
 * Get questions for a specific level and section topic.
 * Returns up to `limit` questions, shuffled for variety.
 * Falls back to keyword-matched templates if the topic is not in the static bank.
 */
export function getQuestionsForSection(level: string, topic: string, limit = 5): HQuestion[] {
  const sections = HEADWAY_QUESTIONS[level];
  let pool: HQuestion[] = [];

  if (sections) {
    const section = sections.find(
      s => s.topic.toLowerCase() === topic.toLowerCase()
        || topic.toLowerCase().includes(s.topic.toLowerCase())
        || s.topic.toLowerCase().includes(topic.toLowerCase())
    );
    if (section) pool = [...section.questions];
  }

  // Try fuzzy match across ALL levels
  if (pool.length === 0) {
    for (const lvlSections of Object.values(HEADWAY_QUESTIONS)) {
      const section = lvlSections.find(
        s => s.topic.toLowerCase() === topic.toLowerCase()
      );
      if (section) { pool = [...section.questions]; break; }
    }
  }

  // Use template-based questions as last resort
  if (pool.length === 0) {
    pool = findTemplateQuestions(topic);
  }

  // Shuffle using current timestamp as seed (different each call)
  const seed = Date.now();
  let h = seed | 0;
  const rand = () => { h ^= h << 13; h ^= h >> 17; h ^= h << 5; return (h >>> 0) / 0xffffffff; };
  const all = [...pool];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, limit);
}

/** Get all topics available for a given level */
export function getTopicsForLevel(level: string): HSection[] {
  return HEADWAY_QUESTIONS[level] ?? [];
}
