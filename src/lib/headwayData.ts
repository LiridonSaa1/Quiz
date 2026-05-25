export const OUP = 'https://elt.oup.com';
export const CC  = '?cc=global&selLanguage=en';

export type HUnit = {
  num: number;
  title: string;
  description: string;
  grammar: { topic: string; path: string }[];
  vocabulary: { topic: string; path: string }[];
  eeSlug: string;
  audioZip?: string;
  videoZip?: string;
};
export type HLevel = { slug: string; units: HUnit[] };

const g = (slug: string, unit: string, file: string) =>
  `/student/headway/${slug}/grammar/${unit}/${file}`;
const v = (slug: string, unit: string, file: string) =>
  `/student/headway/${slug}/vocabulary/${unit}/${file}`;
const DL = (level_name: string, n: number) =>
  `${OUP}/elt/students/headway/downloads/headway_${level_name}_students_book_unit_${String(n).padStart(2, '0')}.zip`;
const VL = (level_name: string, n: number) =>
  `${OUP}/elt/students/headway/downloads/headway_${level_name}_video_unit_${String(n).padStart(2, '0')}.zip`;

export const HEADWAY_FULL_DATA: Record<string, HLevel> = {
  "Beginner": {
    slug: "beg",
    units: [
      { num:1,  title:"Unit 1 — Hello!",                 description:"Greetings, introductions and basic personal information.",      eeSlug:"unit01", audioZip:DL("beginner",1),  videoZip:VL("beginner",1),
        grammar:[{topic:"Present Simple",          path:g("beg","grammarunit01","hwy_begin_unit01_1")},{topic:"Questions and answers",      path:g("beg","grammarunit01","hwy_begin_unit01_3")}],
        vocabulary:[{topic:"Numbers",              path:v("beg","vocabularyunit01","hwy_begin_unit01_4")}]},
      { num:2,  title:"Unit 2 — Your world",              description:"Countries, nationalities and describing where you are from.",   eeSlug:"unit02", audioZip:DL("beginner",2),  videoZip:VL("beginner",2),
        grammar:[{topic:"am / are / is",           path:g("beg","grammarunit02","hwy_begin_unit02_1")},{topic:"Questions and answers",      path:g("beg","grammarunit02","hwy_begin_unit02_2")}],
        vocabulary:[{topic:"Cities and countries", path:v("beg","vocabularyunit02","hwy_begin_unit02_4")}]},
      { num:3,  title:"Unit 3 — All about you!",          description:"Personal information, jobs and family.",                        eeSlug:"unit03", audioZip:DL("beginner",3),  videoZip:VL("beginner",3),
        grammar:[{topic:"Personal information",    path:g("beg","grammarunit03","hwy_begin_unit03_3")},{topic:"Questions and short answers",path:g("beg","grammarunit03","hwy_begin_unit03_1")}],
        vocabulary:[{topic:"Social expressions",   path:v("beg","vocabularyunit03","hwy_begin_unit03_4")}]},
      { num:4,  title:"Unit 4 — Family and friends",      description:"Talking about family members and describing people.",          eeSlug:"unit04", audioZip:DL("beginner",4),  videoZip:VL("beginner",4),
        grammar:[{topic:"Possessives",             path:g("beg","grammarunit04","hwy_begin_unit04_1")},{topic:"Questions and answers",      path:g("beg","grammarunit04","hwy_begin_unit04_3")}],
        vocabulary:[{topic:"Word groups",          path:v("beg","vocabularyunit04","hwy_begin_unit04_1")}]},
      { num:5,  title:"Unit 5 — It's my life!",           description:"Daily routines, likes and dislikes.",                          eeSlug:"unit05", audioZip:DL("beginner",5),  videoZip:VL("beginner",5),
        grammar:[{topic:"Present Simple 1",        path:g("beg","grammarunit05","hwy_begin_unit05_1")},{topic:"Present Simple 2",           path:g("beg","grammarunit05","hwy_begin_unit05_3")}],
        vocabulary:[{topic:"Countries and nationalities",path:v("beg","vocabularyunit05","hwy_begin_unit05_4")},{topic:"Odd-one-out",      path:v("beg","vocabularyunit05","hwy_begin_unit05_2")}]},
      { num:6,  title:"Unit 6 — Every day",               description:"Everyday activities and telling the time.",                    eeSlug:"unit06", audioZip:DL("beginner",6),  videoZip:VL("beginner",6),
        grammar:[{topic:"Present Simple",          path:g("beg","grammarunit06","hwy_begin_unit06_1")},{topic:"Questions and answers",      path:g("beg","grammarunit06","hwy_begin_unit06_2")}],
        vocabulary:[{topic:"Your day",             path:v("beg","vocabularyunit06","hwy_begin_unit06_3")}]},
      { num:7,  title:"Unit 7 — Places I like",           description:"Describing places and talking about towns and cities.",        eeSlug:"unit07", audioZip:DL("beginner",7),  videoZip:VL("beginner",7),
        grammar:[{topic:"Question words",          path:g("beg","grammarunit07","hwy_begin_unit07_1")},{topic:"Questions and answers",      path:g("beg","grammarunit07","hwy_begin_unit07_2")},{topic:"Verb patterns",path:g("beg","grammarunit07","hwy_upp_unit07_1")}],
        vocabulary:[{topic:"Adjectives",           path:v("beg","vocabularyunit07","hwy_begin_unit07_3")},{topic:"Everyday English expressions",path:v("beg","vocabularyunit07","hwy_begin_unit07_4")}]},
      { num:8,  title:"Unit 8 — Clothes and colours",     description:"Shopping for clothes, colours and describing what people wear.",eeSlug:"unit08", audioZip:DL("beginner",8),  videoZip:VL("beginner",8),
        grammar:[{topic:"There is / There are",    path:g("beg","grammarunit08","hwy_begin_unit08_1")},{topic:"Questions and answers",      path:g("beg","grammarunit08","hwy_begin_unit08_2")}],
        vocabulary:[{topic:"Places and things",    path:v("beg","unit08","hwy_begin_unit08_4")}]},
      { num:9,  title:"Unit 9 — Food and drink",          description:"Ordering food, talking about meals and cooking.",              eeSlug:"unit09", audioZip:DL("beginner",9),  videoZip:VL("beginner",9),
        grammar:[{topic:"was / were",              path:g("beg","grammarunit09","hwy_begin_unit09_1")},{topic:"Past Simple irregular",       path:g("beg","grammarunit09","hwy_begin_unit09_2")}],
        vocabulary:[{topic:"have, do, go",         path:v("beg","unit09","hwy_begin_unit09_1")}]},
      { num:10, title:"Unit 10 — I can do it!",           description:"Talking about abilities and making requests.",                 eeSlug:"unit10", audioZip:DL("beginner",10), videoZip:VL("beginner",10),
        grammar:[{topic:"Past Simple 1",           path:g("beg","grammarunit10","hwy_begin_unit10_1")}],
        vocabulary:[{topic:"Work, sports, and leisure",path:v("beg","unit10","hwy_begin_unit10_4")}]},
      { num:11, title:"Unit 11 — The past",               description:"Talking about past events and telling life stories.",          eeSlug:"unit11", audioZip:DL("beginner",11), videoZip:VL("beginner",11),
        grammar:[{topic:"can / can't",             path:g("beg","grammarunit11","hwy_begin_unit11_1")},{topic:"Requests",                    path:g("beg","grammarunit11","hwy_begin_unit11_4")}],
        vocabulary:[{topic:"Verbs",                path:v("beg","unit11","hwy_begin_unit11_2")}]},
      { num:12, title:"Unit 12 — Thank you and goodbye!", description:"Making plans, saying goodbye and reviewing the course.",       eeSlug:"unit12", audioZip:DL("beginner",12), videoZip:VL("beginner",12),
        grammar:[{topic:"like / would like",       path:g("beg","grammarunit12","hwy_begin_unit12_1")},{topic:"some / any",                  path:g("beg","grammarunit12","hwy_begin_unit12_3")}],
        vocabulary:[{topic:"In a restaurant",      path:v("beg","unit12","hwy_begin_unit12_4")}]},
      { num:13, title:"Unit 13 — Here and now",           description:"Talking about what is happening right now.",                   eeSlug:"unit13", audioZip:DL("beginner",13), videoZip:VL("beginner",13),
        grammar:[{topic:"Present Continuous",      path:g("beg","grammarunit13","hwy_begin_unit13_1")},{topic:"Questions and answers",      path:g("beg","grammarunit13","hwy_begin_unit13_2")}],
        vocabulary:[{topic:"Opposite verbs",       path:v("beg","unit13","hwy_begin_unit12_1")}]},
      { num:14, title:"Unit 14 — It's time to go!",       description:"Making future plans and talking about travel.",                eeSlug:"unit14", audioZip:DL("beginner",14), videoZip:VL("beginner",14),
        grammar:[{topic:"Present Continuous for future",path:g("beg","grammarunit14","hwy_begin_unit14_1")},{topic:"Future plans",           path:g("beg","grammarunit14","hwy_begin_unit14_3")}],
        vocabulary:[{topic:"Transport and travel", path:v("beg","unit14","hwy_begin_unit14_4")}]},
    ],
  },
  "Elementary": {
    slug: "elementary4",
    units: [
      { num:1,  title:"Unit 1 — Getting to know you",           description:"Meeting people and sharing personal information.",  eeSlug:"unit01",
        grammar:[{topic:"am / are / is",               path:g("elementary4","unit01","hwy_elem_unit01_1")},{topic:"Possessive 's",            path:g("elementary4","unit01","hwy_elem_unit01_2")}],
        vocabulary:[{topic:"Conversations",            path:v("elementary4","unit01","hwy_elem_unit01_1")},{topic:"Verbs",                     path:v("elementary4","unit01","hwy_elem_unit01_2")}]},
      { num:2,  title:"Unit 2 — Work hard, play hard!",         description:"Jobs, routines and leisure activities.",           eeSlug:"unit02",
        grammar:[{topic:"Present Simple 1",            path:g("elementary4","unit02","hwy_elem_unit02_2")},{topic:"Questions and answers",     path:g("elementary4","unit02","hwy_elem_unit02_1")}],
        vocabulary:[{topic:"Times",                    path:v("elementary4","unit02","hwy_elem_unit02_1")}]},
      { num:3,  title:"Unit 3 — It's a wonderful world!",       description:"Countries, languages and world knowledge.",        eeSlug:"unit03",
        grammar:[{topic:"Adverbs of frequency",        path:g("elementary4","unit03","hwy_elem_unit03_1")},{topic:"Present Simple 2",          path:g("elementary4","unit03","hwy_elem_unit03_2")},{topic:"Present Simple 3",path:g("elementary4","unit03","hwy_elem_unit03_3")}],
        vocabulary:[{topic:"Words that go together",   path:v("elementary4","unit03","hwy_elem_unit03_1")}]},
      { num:4,  title:"Unit 4 — Eat, drink and be merry!",      description:"Food, drink and eating out.",                      eeSlug:"unit04",
        grammar:[{topic:"some / any",                  path:g("elementary4","unit04","hwy_elem_unit04_1")},{topic:"There is / are",            path:g("elementary4","unit04","hwy_elem_unit04_2")}],
        vocabulary:[{topic:"Adjectives",               path:v("elementary4","unit04","hwy_elem_unit04_1")},{topic:"Numbers",                   path:v("elementary4","unit04","hwy_elem_unit04_2")}]},
      { num:5,  title:"Unit 5 — A sense of history",            description:"Historical events and biographies.",               eeSlug:"unit05",
        grammar:[{topic:"Present Simple and Past Simple",path:g("elementary4","unit05","hwy_elem_unit05_1")},{topic:"can / could, was / were",path:g("elementary4","unit05","hwy_elem_unit05_2")}],
        vocabulary:[{topic:"Noun + noun",              path:v("elementary4","unit05","hwy_elem_unit05_1")},{topic:"Verb + noun",               path:v("elementary4","unit05","hwy_elem_unit05_2")},{topic:"Polite requests",path:v("elementary4","unit05","hwy_elem_unit05_3")}]},
      { num:6,  title:"Unit 6 — Time off",                      description:"Free time, hobbies and weekend activities.",       eeSlug:"unit06",
        grammar:[{topic:"Past Simple 1",               path:g("elementary4","unit06","hwy_elem_unit06_1")},{topic:"Past Simple 2",             path:g("elementary4","unit06","hwy_elem_unit06_2")}],
        vocabulary:[{topic:"Adjectives",               path:v("elementary4","unit06","hwy_elem_unit06_1")},{topic:"Months of the year",        path:v("elementary4","unit06","hwy_elem_unit06_2")}]},
      { num:7,  title:"Unit 7 — Passions!",                     description:"Talking about things you love and feel strongly about.", eeSlug:"unit07",
        grammar:[{topic:"Adverbs",                     path:g("elementary4","unit07","hwy_elem_unit07_1")},{topic:"Past Simple 3",             path:g("elementary4","unit07","hwy_elem_unit07_2")}],
        vocabulary:[{topic:"in, at, or on?",           path:v("elementary4","unit07","hwy_elem_unit07_11")}]},
      { num:8,  title:"Unit 8 — How things began",              description:"Inventions and the history of everyday things.",    eeSlug:"unit08",
        grammar:[{topic:"like and would like",         path:g("elementary4","unit08","hwy_elem_unit08_1")},{topic:"some, any, much, many",     path:g("elementary4","unit08","hwy_elem_unit08_2")}],
        vocabulary:[{topic:"Food and drink",           path:v("elementary4","unit08","hwy_elem_unit08_1")}]},
      { num:9,  title:"Unit 9 — Changing times",                description:"Changes in society, life and technology.",         eeSlug:"unit09",
        grammar:[{topic:"Comparatives and superlatives",path:g("elementary4","unit09","hwy_elem_unit09_1")},{topic:"Superlatives",            path:g("elementary4","unit09","hwy_elem_unit09_2")},{topic:"Directions",path:g("elementary4","unit09","hwy_elem_unit09_3")}],
        vocabulary:[{topic:"Places",                   path:v("elementary4","unit09","hwy_elem_unit09_11")}]},
      { num:10, title:"Unit 10 — How does that make you feel?", description:"Emotions, feelings and expressing opinions.",       eeSlug:"unit10",
        grammar:[{topic:"Present Continuous",          path:g("elementary4","unit10","hwy_elem_unit10_1")},{topic:"anything, something, nothing",path:g("elementary4","unit10","hwy_elem_unit10_2")}],
        vocabulary:[{topic:"Social expressions",       path:v("elementary4","unit10","hwy_elem_unit10_2")}]},
      { num:11, title:"Unit 11 — In my life",                   description:"Personal experiences and important life events.",   eeSlug:"unit11",
        grammar:[{topic:"going to and Past Simple",    path:g("elementary4","unit11","hwy_elem_unit11_1")},{topic:"Suggestions",               path:g("elementary4","unit11","hwy_elem_unit11_2")}],
        vocabulary:[{topic:"The weather",              path:v("elementary4","unit11","hwy_elem_unit11_2")}]},
      { num:12, title:"Unit 12 — Looking ahead",                description:"Future plans, hopes and ambitions.",                eeSlug:"unit12",
        grammar:[{topic:"Present Perfect 1",           path:g("elementary4","unit12","hwy_elem_unit12_1")},{topic:"Present Perfect 2",         path:g("elementary4","unit12","hwy_elem_unit12_2")}],
        vocabulary:[{topic:"take, get, go",            path:v("elementary4","unit12","hwy_elem_unit12_1")}]},
    ],
  },
  "Pre-Intermediate": {
    slug: "preint4",
    units: [
      { num:1,  title:"Unit 1 — No place like home",        description:"Homes, houses and living spaces.",                 eeSlug:"unit01",
        grammar:[{topic:"Tenses",                  path:g("preint4","unit01","hwy_preint_unit01_1")},{topic:"Question words",               path:g("preint4","unit01","hwy_preint_unit01_2")}],
        vocabulary:[{topic:"Adjectives ending in -ed and -ing",path:v("preint4","unit01","hwy_preint_unit01_1")},{topic:"Words with two meanings",path:v("preint4","unit01","hwy_preint_unit01_2")}]},
      { num:2,  title:"Unit 2 — Whatever makes you happy!", description:"Happiness, lifestyle and what matters to people.",  eeSlug:"unit02",
        grammar:[{topic:"Present Simple / Continuous",path:g("preint4","unit02","hwy_preint_unit02_1")},{topic:"Short answers",              path:g("preint4","unit02","hwy_preint_unit02_2")}],
        vocabulary:[{topic:"Making conversation",  path:v("preint4","unit02","hwy_preint_unit02_1")},{topic:"Things I like doing",           path:v("preint4","unit02","hwy_preint_unit02_2")}]},
      { num:3,  title:"Unit 3 — What happened next?",       description:"Telling stories and narrative past tenses.",        eeSlug:"unit03",
        grammar:[{topic:"Past Simple or Continuous",path:g("preint4","unit03","hwy_preint_unit03_1")},{topic:"Adverbs",                      path:g("preint4","unit03","hwy_preint_unit03_2")}],
        vocabulary:[{topic:"in, at, on",           path:v("preint4","unit03","hwy_preint_unit03_2")}]},
      { num:4,  title:"Unit 4 — Doing the right thing",     description:"Rules, obligations and moral dilemmas.",           eeSlug:"unit04",
        grammar:[{topic:"Count / Uncount nouns",   path:g("preint4","unit04","hwy_preint_unit04_1")},{topic:"Articles",                      path:g("preint4","unit04","hwy_preint_unit04_2")}],
        vocabulary:[{topic:"A piece of…",          path:v("preint4","unit04","hwy_preint_unit04_1")},{topic:"Having dinner together",         path:v("preint4","unit04","hwy_preint_unit04_2")}]},
      { num:5,  title:"Unit 5 — On the road",               description:"Travel, transport and holiday experiences.",       eeSlug:"unit05",
        grammar:[{topic:"Verb patterns",           path:g("preint4","unit05","hwy_preint_unit05_1")},{topic:"Future forms",                   path:g("preint4","unit05","hwy_preint_unit05_2")}],
        vocabulary:[{topic:"Phrasal verbs – idiomatic",path:v("preint4","unit05","hwy_preint_unit05_1")},{topic:"Phrasal verbs – literal",    path:v("preint4","unit05","hwy_preint_unit05_2")}]},
      { num:6,  title:"Unit 6 — Life's great events",       description:"Celebrations, milestones and life events.",        eeSlug:"unit06",
        grammar:[{topic:"Superlatives",            path:g("preint4","unit06","hwy_preint_unit06_1")},{topic:"What ... like?",                 path:g("preint4","unit06","hwy_preint_unit06_2")}],
        vocabulary:[{topic:"Antonyms",             path:v("preint4","unit06","hwy_preint_unit06_1")},{topic:"Synonyms",                       path:v("preint4","unit06","hwy_preint_unit06_2")}]},
      { num:7,  title:"Unit 7 — Learning for life",         description:"Education, learning styles and schools.",          eeSlug:"unit07",
        grammar:[{topic:"Present Perfect",         path:g("preint4","unit07","hwy_preint_unit07_01")},{topic:"For and since",                 path:g("preint4","unit07","hwy_preint_unit07_02")},{topic:"Question tags",path:g("preint4","unit07","hwy_preint_unit07_03")}],
        vocabulary:[{topic:"Word endings",         path:v("preint4","unit07","hwy_preint_unit07_2")}]},
      { num:8,  title:"Unit 8 — A matter of opinion",       description:"Giving opinions, agreeing and disagreeing.",       eeSlug:"unit08",
        grammar:[{topic:"should / must / have to 1",path:g("preint4","unit08","hwy_preint_unit08_1")},{topic:"should / must / have to 2",    path:g("preint4","unit08","hwy_preint_unit08_2")}],
        vocabulary:[{topic:"So and such",          path:v("preint4","unit08","hwy_preint_unit08_1")}]},
      { num:9,  title:"Unit 9 — Buying and selling",        description:"Shopping, money and consumer culture.",            eeSlug:"unit09",
        grammar:[{topic:"Past Perfect and Past Simple",path:g("preint4","unit09","hwy_preint_unit09_1")},{topic:"Joining sentences",          path:g("preint4","unit09","hwy_preint_unit09_2")}],
        vocabulary:[{topic:"So and such",          path:v("preint4","unit09","hwy_preint_unit09_2")}]},
      { num:10, title:"Unit 10 — All things high-tech",     description:"Technology, gadgets and the digital world.",       eeSlug:"unit10",
        grammar:[{topic:"Passives 1",              path:g("preint4","unit10","hwy_preint_unit10_1")},{topic:"Passives 2",                     path:g("preint4","unit10","hwy_preint_unit10_2")}],
        vocabulary:[{topic:"Words that go together",path:v("preint4","unit10","hwy_preint_unit10_1")}]},
      { num:11, title:"Unit 11 — What a story!",            description:"News stories, media and storytelling.",            eeSlug:"unit11",
        grammar:[{topic:"Present Perfect Simple / Continuous",path:g("preint4","unit11","hwy_preint_unit11_1")},{topic:"Tenses",              path:g("preint4","unit11","hwy_preint_unit11_2")}],
        vocabulary:[{topic:"Marriage",             path:v("preint4","unit11","hwy_preint_unit11_1")}]},
      { num:12, title:"Unit 12 — It's never too late!",     description:"Ambitions, second chances and life goals.",        eeSlug:"unit12",
        grammar:[{topic:"First conditional",       path:g("preint4","unit12","hwy_preint_unit12_1")},{topic:"Second conditional",             path:g("preint4","unit12","hwy_preint_unit12_2")}],
        vocabulary:[{topic:"Thank you and goodbye!",path:v("preint4","unit12","hwy_preint_unit12_1")},{topic:"Prepositions",                  path:v("preint4","unit12","hwy_preint_unit12_2")}]},
    ],
  },
  "Intermediate": {
    slug: "int",
    units: [
      { num:1,  title:"Unit 1 — A world of difference",         description:"Comparing cultures and ways of life around the world.", eeSlug:"unit01",
        grammar:[{topic:"Auxiliary verbs",         path:g("int","unit01","hwy_int_unit01_1")},{topic:"Questions",                            path:g("int","unit01","hwy_hwy_unit01_2")},{topic:"Short answers",path:g("int","unit01","hwy_int_unit01_3")}],
        vocabulary:[{topic:"Words that go together",path:v("int","unit01","hwy_int_unit01_4")}]},
      { num:2,  title:"Unit 2 — Buying and selling",            description:"The world of commerce, advertising and consumerism.",  eeSlug:"unit02",
        grammar:[{topic:"Present Simple or Continuous 1",path:g("int","unit02","hwy_int_unit02_1")},{topic:"Present Simple or Continuous 2",path:g("int","unit02","hwy_int_unit02_2")},{topic:"Active / Passive",path:g("int","unit02","hwy_int_unit02_3")}],
        vocabulary:[{topic:"Jobs",                 path:v("int","unit02","hwy_int_unit02_5")},{topic:"Free time activities",               path:v("int","unit02","hwy_int_unit03_3")}]},
      { num:3,  title:"Unit 3 — What is beauty?",               description:"Concepts of beauty, art and aesthetic judgement.",      eeSlug:"unit03",
        grammar:[{topic:"Past Simple or Continuous",path:g("int","unit03","hwy_int_unit03_1")},{topic:"Past Simple or Past Perfect",        path:g("int","unit03","hwy_int_unit03_2")},{topic:"Past tenses",path:g("int","unit03","hwy_int_unit03_3")}],
        vocabulary:[{topic:"Giving opinions",      path:v("int","unit03","hwy_int_unit03_2")},{topic:"Silent letters",                      path:v("int","unit03","hwy_int_unit03_3")}]},
      { num:4,  title:"Unit 4 — Never stop learning",           description:"Lifelong learning, education systems and study skills.", eeSlug:"unit04",
        grammar:[{topic:"have to / be allowed to", path:g("int","unit04","hwy_int_unit04_1")},{topic:"Modal verbs",                         path:g("int","unit04","hwy_int_unit04_2")}],
        vocabulary:[{topic:"Phrasal verbs",        path:v("int","unit04","hwy_int_unit04_1")},{topic:"Requests and offers",                  path:v("int","unit04","hwy_int_unit04_4")}]},
      { num:5,  title:"Unit 5 — A short history of sport",      description:"Sports history, famous athletes and competition.",       eeSlug:"unit05",
        grammar:[{topic:"will / going to",         path:g("int","unit05","hwy_int_unit05_2")},{topic:"I think / I don't think + will",      path:g("int","unit05","hwy_int_unit05_1")}],
        vocabulary:[{topic:"Prefixes",             path:v("int","unit05","hwy_int_unit05_1")}]},
      { num:6,  title:"Unit 6 — The right person for the job",  description:"Work, careers, job applications and interviews.",        eeSlug:"unit06",
        grammar:[{topic:"Questions with like",     path:g("int","unit06","hwy_int_unit06_1")},{topic:"What, which and who",                 path:g("int","unit06","hwy_int_unit05_1")}],
        vocabulary:[{topic:"-ed and -ing adjectives",path:v("int","unit06","hwy_int_unit06_1")},{topic:"Adjective + noun",                  path:v("int","unit06","hwy_int_unit06_2")}]},
      { num:7,  title:"Unit 7 — Cultures meeting",              description:"Cross-cultural communication and global society.",       eeSlug:"unit07",
        grammar:[{topic:"Present Perfect",         path:g("int","unit07","hwy_int_unit07_1")},{topic:"Present Perfect Active / Passive",    path:g("int","unit07","hwy_int_unit07_2")},{topic:"Time expressions",path:g("int","unit07","hwy_int_unit07_3")}],
        vocabulary:[{topic:"Likes and dislikes",   path:v("int","unit07","hwy_int_unit07_2")}]},
      { num:8,  title:"Unit 8 — It's a crime",                  description:"Crime, justice and the law.",                           eeSlug:"unit08",
        grammar:[{topic:"Verb patterns",           path:g("int","unit08","hwy_int_unit02_1")},{topic:"Reduced infinitive",                  path:g("int","unit08","hwy_int_unit08_2")}],
        vocabulary:[{topic:"Body verbs",           path:v("int","unit08","hwy_int_unit08_1")},{topic:"Body idioms",                         path:v("int","unit08","hwy_int_unit08_2")}]},
      { num:9,  title:"Unit 9 — Travel the world",              description:"Travel experiences, tourism and world destinations.",    eeSlug:"unit09",
        grammar:[{topic:"Conditionals 1",          path:g("int","unit09","hwy_int_unit08_2")},{topic:"Conditionals 2",                      path:g("int","unit09","hwy_int_unit09_2")}],
        vocabulary:[{topic:"Words with similar meaning",path:v("int","unit09","hwy_int_unit08_1")}]},
      { num:10, title:"Unit 10 — Our future",                   description:"Environmental issues, predictions and global challenges.",eeSlug:"unit10",
        grammar:[{topic:"Possessives",             path:g("int","unit10","hwy_int_unit09_1")},{topic:"Articles",                            path:g("int","unit10","hwy_int_unit09_2")}],
        vocabulary:[{topic:"Compound nouns 1",     path:v("int","unit10","hwy_int_unit10_1")},{topic:"Compound nouns 2",                    path:v("int","unit10","hwy_int_unit10_6")}]},
      { num:11, title:"Unit 11 — Telling stories",              description:"Literature, fiction and the art of storytelling.",       eeSlug:"unit11",
        grammar:[{topic:"Modal verbs of probability: Present",path:g("int","unit11","hwy_int_unit09_3")},{topic:"Modal verbs of probability: Past",path:g("int","unit11","hwy_int_unit09_2")}],
        vocabulary:[{topic:"Expressing attitude",  path:v("int","unit11","hwy_int_unit11_3")},{topic:"Phrasal verbs 2",                     path:v("int","unit11","hwy_int_unit11_6")}]},
      { num:12, title:"Unit 12 — Music of the night",           description:"Music, entertainment and cultural expression.",          eeSlug:"unit12",
        grammar:[{topic:"Reported speech",         path:g("int","unit12","hwy_int_unit12_1")},{topic:"Reporting verbs",                     path:g("int","unit12","hwy_int_unit12_2")}],
        vocabulary:[{topic:"Clichés",              path:v("int","unit12","hwy_int_unit12_4")}]},
    ],
  },
  "Upper-Intermediate": {
    slug: "upperintermediate",
    units: [
      { num:1,  title:"Unit 1 — My world",                      description:"Personal identity, background and modern life.",         eeSlug:"unit01",
        grammar:[{topic:"Active and Passive 1",    path:g("upperintermediate","unit01","hwy_upp_unit01_1")},{topic:"Active and Passive 2",    path:g("upperintermediate","unit01","hwy_upp_unit01_2")}],
        vocabulary:[{topic:"Social expressions",   path:v("upperintermediate","unit01","hwy_upp_unit01_3")},{topic:"Compound nouns and adjectives",path:v("upperintermediate","unit01","hwy_upp_unit01_4")}]},
      { num:2,  title:"Unit 2 — All in the mind?",              description:"Psychology, memory and the human brain.",                eeSlug:"unit02",
        grammar:[{topic:"Present Perfect Simple and Continuous",path:g("upperintermediate","unit02","hwy_upp_unit02_1")},{topic:"Present Perfect and Past Simple",path:g("upperintermediate","unit02","hwy_upp_unit02_2")}],
        vocabulary:[{topic:"Hot verbs – make, do 1",path:v("upperintermediate","unit02","hwy_upp_unit02_4")},{topic:"Hot verbs – make, do 2",path:v("upperintermediate","unit02","hwy_upp_unit02_5")},{topic:"Talking about places 1",path:v("upperintermediate","unit02","hwy_upp_unit02_6")}]},
      { num:3,  title:"Unit 3 — Getting and spending",          description:"Money, economics and consumerism.",                      eeSlug:"unit03",
        grammar:[{topic:"Narrative tenses: Active and Passive",path:g("upperintermediate","unit03","hwy_upp_unit03_2")}],
        vocabulary:[{topic:"Books and films",      path:v("upperintermediate","unit03","hwy_upp_unit03_3")},{topic:"Showing interest and surprise",path:v("upperintermediate","unit03","hwy_upp_unit03_4")}]},
      { num:4,  title:"Unit 4 — It depends how you look at it", description:"Different perspectives and critical thinking.",          eeSlug:"unit04",
        grammar:[{topic:"Questions",               path:g("upperintermediate","unit04","hwy_upp_unit04_1")},{topic:"Negatives",               path:g("upperintermediate","unit04","hwy_upp_unit04_2")}],
        vocabulary:[{topic:"Antonyms",             path:v("upperintermediate","unit04","hwy_upp_unit04_3")},{topic:"Being polite",             path:v("upperintermediate","unit04","hwy_upp_unit04_4")}]},
      { num:5,  title:"Unit 5 — Clues to the past",             description:"History, archaeology and ancient civilizations.",        eeSlug:"unit05",
        grammar:[{topic:"Future forms 1",          path:g("upperintermediate","unit05","hwy_upp_unit05_1")},{topic:"Future forms 2",           path:g("upperintermediate","unit05","hwy_upp_unit05_2")}],
        vocabulary:[{topic:"Hot verbs – take, put",path:v("upperintermediate","unit05","hwy_upp_unit05_3")},{topic:"Phrasal verbs with take or put",path:v("upperintermediate","unit05","hwy_upp_unit05_4")}]},
      { num:6,  title:"Unit 6 — Writing and speaking",          description:"Communication skills — written and spoken English.",     eeSlug:"unit06",
        grammar:[{topic:"Expressions of quantity 1",path:g("upperintermediate","unit06","hwy_upp_unit06_1")},{topic:"Expressions of quantity 2",path:g("upperintermediate","unit06","hwy_upp_unit06_2")}],
        vocabulary:[{topic:"Business expressions", path:v("upperintermediate","unit06","hwy_upp_unit06_4")}]},
      { num:7,  title:"Unit 7 — Success and failure",           description:"Ambition, achievement and learning from mistakes.",      eeSlug:"unit07",
        grammar:[{topic:"Modals and related verbs 1",path:g("upperintermediate","unit07","hwy_upp_unit07_1")},{topic:"Modals and related verbs 2",path:g("upperintermediate","unit07","hwy_upp_unit07_2")}],
        vocabulary:[{topic:"Hot verbs – get",      path:v("upperintermediate","unit07","hwy_upp_unit07_3")},{topic:"Exaggeration and understatement",path:v("upperintermediate","unit07","hwy_upp_unit07_4")}]},
      { num:8,  title:"Unit 8 — First world problems?",         description:"Modern society, inequality and global issues.",          eeSlug:"unit08",
        grammar:[{topic:"Relative clauses",        path:g("upperintermediate","unit08","hwy_upp_unit08_1")},{topic:"Participles",              path:g("upperintermediate","unit08","hwy_upp_unit08_2")}],
        vocabulary:[{topic:"Extreme adjectives",   path:v("upperintermediate","unit08","hwy_upp_unit08_3")},{topic:"Adverb collocations",       path:v("upperintermediate","unit08","adverb-collocations")}]},
      { num:9,  title:"Unit 9 — Places and communities",        description:"Urban and rural life, community and belonging.",         eeSlug:"unit09",
        grammar:[{topic:"Expressing habit 1",      path:g("upperintermediate","unit09","hwy_upp_unit09_1")},{topic:"Expressing habit 2",        path:g("upperintermediate","unit09","hwy_upp_unit09_2")}],
        vocabulary:[{topic:"Homophones",           path:v("upperintermediate","unit09","hwy_upp_unit09_3")},{topic:"Making your point",          path:v("upperintermediate","unit09","hwy_upp_unit09_4")}]},
      { num:10, title:"Unit 10 — Science and technology",       description:"Scientific discoveries and technological innovation.",   eeSlug:"unit10",
        grammar:[{topic:"Modal auxiliary verbs",   path:g("upperintermediate","unit10","hwy_upp_unit10_1")},{topic:"Expressions with modals",   path:g("upperintermediate","unit10","hwy_upp_unit10_2")}],
        vocabulary:[{topic:"Synonyms",             path:v("upperintermediate","unit10","hwy_upp_unit10_3")},{topic:"Metaphors and idioms – the body",path:v("upperintermediate","unit10","hwy_upp_unit10_4")}]},
      { num:11, title:"Unit 11 — Language and communication",   description:"How language works and how we communicate.",             eeSlug:"unit11",
        grammar:[{topic:"Hypothesizing 1",         path:g("upperintermediate","unit11","hwy_upp_unit11_1")},{topic:"Hypothesizing 2",            path:g("upperintermediate","unit11","hwy_upp_unit11_2")}],
        vocabulary:[{topic:"Word pairs",           path:v("upperintermediate","unit11","hwy_upp_unit11_3")},{topic:"Moans and groans",            path:v("upperintermediate","unit11","hwy_upp_unit11_4")}]},
      { num:12, title:"Unit 12 — The big picture",              description:"Global issues, the future and big ideas.",               eeSlug:"unit12",
        grammar:[{topic:"Determiners",             path:g("upperintermediate","unit12","hwy_upp_unit12_1")},{topic:"Articles and determiners",   path:g("upperintermediate","unit12","hwy_upp_unit12_2")}],
        vocabulary:[{topic:"Hot verbs – life and time",path:v("upperintermediate","unit12","hwy_upp_unit12_3")},{topic:"Linking and commenting expressions",path:v("upperintermediate","unit12","hwy_upp_unit12_4")}]},
    ],
  },
  "Advanced": {
    slug: "advanceddownload",
    units: [
      { num:1,  title:"Unit 1 — Meeting people and places",   description:"First impressions, social interactions and places.",     eeSlug:"unit01", grammar:[], vocabulary:[] },
      { num:2,  title:"Unit 2 — Getting on and getting away", description:"Relationships, travel and escaping everyday life.",      eeSlug:"unit02", grammar:[], vocabulary:[] },
      { num:3,  title:"Unit 3 — What's in the news?",         description:"Media literacy, news reporting and current events.",     eeSlug:"unit03", grammar:[], vocabulary:[] },
      { num:4,  title:"Unit 4 — Hard times",                  description:"Challenges, adversity and resilience.",                  eeSlug:"unit04", grammar:[], vocabulary:[] },
      { num:5,  title:"Unit 5 — Divided loyalties",           description:"Conflicting values, ethics and moral choices.",          eeSlug:"unit05", grammar:[], vocabulary:[] },
      { num:6,  title:"Unit 6 — I love literature",           description:"English literature, books and literary analysis.",       eeSlug:"unit06", grammar:[], vocabulary:[] },
      { num:7,  title:"Unit 7 — Talking business",            description:"Business English, the economy and entrepreneurship.",    eeSlug:"unit07", grammar:[], vocabulary:[] },
      { num:8,  title:"Unit 8 — Looking at language",         description:"Linguistics, language evolution and usage.",             eeSlug:"unit08", grammar:[], vocabulary:[] },
      { num:9,  title:"Unit 9 — It takes all sorts...",       description:"Personality types, human behaviour and society.",        eeSlug:"unit09", grammar:[], vocabulary:[] },
      { num:10, title:"Unit 10 — Nothing but the truth",      description:"Truth, deception, trust and honesty.",                   eeSlug:"unit10", grammar:[], vocabulary:[] },
      { num:11, title:"Unit 11 — Over to you!",               description:"Independent learning, projects and presentations.",      eeSlug:"unit11", grammar:[], vocabulary:[] },
      { num:12, title:"Unit 12 — Life goes on",               description:"Reflecting on language learning, the future and change.",eeSlug:"unit12", grammar:[], vocabulary:[] },
    ],
  },
};

export interface PreviewQuestion {
  order: number;
  type: 'grammar' | 'vocabulary' | 'comprehension' | 'testbuilder';
  topic: string;
  questionText: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  oxfordUrl: string;
}

export function buildUnitQuestions(unit: HUnit, levelSlug: string): PreviewQuestion[] {
  const questions: PreviewQuestion[] = [];
  let order = 0;

  for (const gr of unit.grammar) {
    const url = `${OUP}${gr.path}${CC}`;
    questions.push({
      order: order++,
      type: 'grammar',
      topic: gr.topic,
      questionText: `Which of the following best demonstrates correct use of "${gr.topic}" from ${unit.title}?`,
      options: [
        `Practice exercise on "${gr.topic}" — see Oxford Headway: ${url}`,
        `An incorrect form that ignores the rules of "${gr.topic}"`,
        `A sentence that mixes "${gr.topic}" with an incompatible tense`,
        `A phrase that avoids "${gr.topic}" altogether`,
      ],
      correctIndex: 0,
      explanation: `The correct answer links to the Oxford Headway interactive exercise on "${gr.topic}". Visit: ${url}`,
      oxfordUrl: url,
    });
  }

  for (const vc of unit.vocabulary) {
    const url = `${OUP}${vc.path}${CC}`;
    questions.push({
      order: order++,
      type: 'vocabulary',
      topic: vc.topic,
      questionText: `Which sentence uses vocabulary from the "${vc.topic}" set in ${unit.title} correctly?`,
      options: [
        `Correct use of a word from the "${vc.topic}" group — practise here: ${url}`,
        `Incorrect word chosen from a different category`,
        `A synonym used in the wrong register or context`,
        `A word that looks similar but has a different meaning`,
      ],
      correctIndex: 0,
      explanation: `The first option is correct. Review the "${vc.topic}" vocabulary set at: ${url}`,
      oxfordUrl: url,
    });
  }

  const tbUrl = `${OUP}/student/headway/${levelSlug}/testbuilder${CC}`;

  questions.push({
    order: order++,
    type: 'comprehension',
    topic: 'Unit comprehension',
    questionText: `What is the main topic of ${unit.title}?`,
    options: [
      unit.description,
      `A lesson about a completely different theme unrelated to ${unit.title}`,
      `An advanced grammar topic not covered in this unit`,
      `A revision unit with no new content`,
    ],
    correctIndex: 0,
    explanation: unit.description,
    oxfordUrl: tbUrl,
  });

  questions.push({
    order: order++,
    type: 'testbuilder',
    topic: 'Test Builder reference',
    questionText: `Where can you find the Oxford Headway Test Builder for ${unit.title}?`,
    options: [
      tbUrl,
      `https://www.cambridge.org/elt/headway`,
      `https://www.bbc.co.uk/learningenglish`,
      `https://www.longman.com/english`,
    ],
    correctIndex: 0,
    explanation: `Oxford Headway Test Builder is at: ${tbUrl}`,
    oxfordUrl: tbUrl,
  });

  return questions;
}
