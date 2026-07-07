import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import AdminLayout from '../components/layout/AdminLayout';
import TeacherLayout from '../components/layout/TeacherLayout';
import StudentLayout from '../components/layout/StudentLayout';
import {
  BookOpen, Users, ShieldCheck, School, Video, Award, ClipboardList,
  CalendarCheck, BarChart3, Settings, PlayCircle, FileText, Layers,
  ChevronDown, ChevronRight, Hand, MessageSquare, Zap, FileBarChart,
  DollarSign, GraduationCap, UserPlus, LogIn, Key, HelpCircle,
  CheckCircle2, AlertCircle, Info, Megaphone, Clock, Trophy
} from 'lucide-react';
import { cn } from '../lib/utils';

interface GuideStep {
  title: string;
  description: string;
  steps?: string[];
  tip?: string;
}

interface GuideSection {
  icon: React.ElementType;
  color: string;
  title: string;
  description: string;
  items: GuideStep[];
}

const adminGuide: GuideSection[] = [
  {
    icon: UserPlus,
    color: 'blue',
    title: 'Krijoni Llogari',
    description: 'Si të shtoni përdorues të rinj në platformë',
    items: [
      {
        title: 'Krijoni Student',
        description: 'Shtoni studentë të rinj në sistem.',
        steps: [
          'Shko te Menaxhimi → Studentët',
          'Kliko butonin "Shto Student" (këndi lart djathtas)',
          'Plotëso: emri, email-i, fjalëkalimi',
          'Kliko "Krijo Student" — studenti mund të logohet menjëherë',
        ],
        tip: 'Email-i duhet të jetë unik. Fjalëkalimi mund të ndryshohet nga studenti pas hyrjes.',
      },
      {
        title: 'Krijoni Mësues',
        description: 'Shtoni mësues të rinj me akses në panelin e tyre.',
        steps: [
          'Shko te Menaxhimi → Mësuesit',
          'Kliko "Shto Mësues"',
          'Plotëso: emri, email-i, fjalëkalimi',
          'Kliko "Krijo Mësues"',
        ],
        tip: 'Mësuesi sheh vetëm kurset dhe studentët e tij/saj.',
      },
    ],
  },
  {
    icon: BookOpen,
    color: 'violet',
    title: 'Kurse & Materiale',
    description: 'Menaxhoni strukturën e të mësuarit',
    items: [
      {
        title: 'Krijoni Kurs',
        description: 'Kursi është grupi kryesor i materialeve.',
        steps: [
          'Shko te Kurset',
          'Kliko "Kurs i Ri"',
          'Plotëso titullin, përshkrimin, kategorinë',
          'Ruaj — kursi shfaqet te lista',
        ],
      },
      {
        title: 'Shtoni Module & Leksione',
        description: 'Modulet janë kapitujt, leksionet janë mësimet brenda tyre.',
        steps: [
          'Hap kursin → kliko "Modulet"',
          'Krijo module (p.sh. "Kapitulli 1")',
          'Brenda çdo moduli shto leksione (Video, Tekst, ose Kuiz)',
        ],
      },
      {
        title: 'Krijoni Kuiz',
        description: 'Testoni njohuritë e studentëve.',
        steps: [
          'Shko te Kuizet → "Kuiz i Ri"',
          'Shto pyetje: me zgjedhje, e vërtetë/false, me përgjigje të lirë',
          'Vendos kohën dhe pikët maksimale',
          'Publiko kuizin',
        ],
      },
    ],
  },
  {
    icon: School,
    color: 'emerald',
    title: 'Klasa & Organizimi',
    description: 'Gruponi studentët në klasa',
    items: [
      {
        title: 'Krijoni Klasë',
        description: 'Klasa grupon studentët për ndjekje të lehtë.',
        steps: [
          'Shko te Klasa → "Klasë e Re"',
          'Cakto emrin dhe mësuesin përgjegjës',
          'Shtoni studentë në klasë',
        ],
      },
      {
        title: 'Detyrë & Prani',
        description: 'Caktoni detyra dhe regjistroni praninë.',
        steps: [
          'Detyrat: Menaxhimi → Detyrat → "Detyrë e Re"',
          'Prani: Menaxhimi → Prani → zgjedh datën dhe klasën',
          'Shëno: i pranishëm / absent / vonë',
        ],
      },
    ],
  },
  {
    icon: Video,
    color: 'rose',
    title: 'Sesione Live',
    description: 'Organizoni mësime virtuale',
    items: [
      {
        title: 'Krijo Sesion Live',
        description: 'Sesionet live lejojnë mësim në kohë reale.',
        steps: [
          'Shko te Sesionet Live → "Sesion i Ri"',
          'Cakto titullin, datën, kohëzgjatjen',
          'Fto studentë ose klasa',
          'Filloni sesionin kur të jeni gati',
        ],
      },
    ],
  },
  {
    icon: BarChart3,
    color: 'amber',
    title: 'Analitika & Raportet',
    description: 'Monitoroni progresin e platformës',
    items: [
      {
        title: 'Shikoni Analizën',
        description: 'Statistika të plota për të gjithë platformën.',
        steps: [
          'Shko te Analitika për pasqyrën e përgjithshme',
          'Shko te Raportet për detaje: studentë, role, financiare',
        ],
        tip: 'Raportet shfaqin tendencat mujore dhe krahasimin mes periudhave.',
      },
    ],
  },
  {
    icon: Settings,
    color: 'slate',
    title: 'Cilësimet e Sistemit',
    description: 'Konfiguroni platformën sipas nevojave',
    items: [
      {
        title: 'Cilësimet & Branding',
        description: 'Personalizoni pamjen dhe funksionet.',
        steps: [
          'Cilësimet: Aktivo/çaktivo funksione (pagesa, sesione live, komunitet)',
          'Branding: Ndrysho logon, ngjyrat dhe emrin e platformës',
          'Siguria: Konfiguro 2FA për rolet',
          'Role & Leje: Cakto çfarë mund të bëjë çdo mësues',
        ],
      },
    ],
  },
];

const teacherGuide: GuideSection[] = [
  {
    icon: BookOpen,
    color: 'violet',
    title: 'Kurse & Materiale',
    description: 'Krijoni dhe organizoni materialet tuaja',
    items: [
      {
        title: 'Krijoni Kurs',
        description: 'Filloni me krijimin e kursit tuaj.',
        steps: [
          'Shko te Kurset → "Kurs i Ri"',
          'Plotëso titullin, përshkrimin dhe kategorinë',
          'Ruaj kursin',
        ],
      },
      {
        title: 'Shtoni Module',
        description: 'Organizoni kursin me module (kapituj).',
        steps: [
          'Shko te Modulet → zgjedh kursin',
          'Kliko "Modul i Ri"',
          'Cakto titullin dhe renditjen',
        ],
      },
      {
        title: 'Shtoni Leksione',
        description: 'Shtoni leksione brenda moduleve.',
        steps: [
          'Shko te Leksionet → zgjedh modulin',
          'Kliko "Leksion i Ri" — zgjedh tipin: Video, Tekst ose Kuiz',
          'Ngarko materialin ose shkruaj përmbajtjen',
          'Publiko leksionin',
        ],
        tip: 'Leksionet me "Parashikim Falas" janë të dukshme pa regjistrim.',
      },
    ],
  },
  {
    icon: FileText,
    color: 'blue',
    title: 'Kuizet & Testet',
    description: 'Krijoni teste dhe vlerëso studentët',
    items: [
      {
        title: 'Krijoni Kuiz',
        description: 'Ndërtoni kuize me pyetje të ndryshme.',
        steps: [
          'Shko te Kuizet → "Kuiz i Ri"',
          'Shto pyetje: me zgjedhje / e vërtetë-false / me përgjigje',
          'Vendos pikët dhe kohën për çdo pyetje',
          'Publiko — studentët mund ta shohin',
        ],
      },
      {
        title: 'Kuiz Live (Realtime)',
        description: 'Drejtoni kuize interaktive gjatë orës.',
        steps: [
          'Shko te Kuiz Live → zgjidh kuizin',
          'Fillo sesionin — studentët bashkohen me kodin',
          'Shfaq pyetjet një nga një',
          'Shiko rezultatet në kohë reale',
        ],
      },
    ],
  },
  {
    icon: Users,
    color: 'emerald',
    title: 'Studentët',
    description: 'Menaxhoni studentët dhe progresin e tyre',
    items: [
      {
        title: 'Shikoni Studentët',
        description: 'Shfaqini lista e studentëve tuaj.',
        steps: [
          'Shko te Studentët për të parë të gjithë',
          'Kliko mbi studentin për detaje dhe progres',
        ],
      },
      {
        title: 'Rezultatet',
        description: 'Shikoni notat dhe përpjekjet e studentëve.',
        steps: [
          'Shko te Rezultatet',
          'Filtro sipas kuizit ose studentit',
          'Shiko pikët, kohën e shpenzuar, dhe gabimeve',
        ],
      },
    ],
  },
  {
    icon: Video,
    color: 'rose',
    title: 'Sesioni Live',
    description: 'Drejtoni mësime virtuale',
    items: [
      {
        title: 'Krijoni & Drejtoni Sesion',
        description: 'Mësim interaktiv me video dhe chat.',
        steps: [
          'Shko te Sesionet Live → "Sesion i Ri"',
          'Cakto titullin, datën dhe fto studentë',
          'Kliko "Fillo Mbledhjen" kur të jeni gati',
          'Gjatë sesionit: kontrollo mikrofonin, kamerën dhe rekordon',
        ],
        tip: 'Nga tab-i "Kontrollet" mund të bllokosh chat-in, reaksionet dhe ngritjen e dorës.',
      },
      {
        title: 'Kontrollet e Studentëve',
        description: 'Gjatë sesionit live keni kontrolle të plota.',
        steps: [
          'Sidebar → "Stu." shfaq listën e pjesëmarrësve',
          'Buto mic-in e studentit me ikonën 🎤',
          '"Kont." tab: Aktivo/çaktivo chat, reaksione, ngritje dore',
          'Kliko ✋ te studenti për t\'i ulur dorën',
        ],
      },
    ],
  },
];

const studentGuide: GuideSection[] = [
  {
    icon: LogIn,
    color: 'emerald',
    title: 'Filloni',
    description: 'Si të hyni dhe të orientoheni në platformë',
    items: [
      {
        title: 'Hyni & Eksploroni',
        description: 'Pas hyrjes ju çohet direkt te paneli juaj.',
        steps: [
          'Hapni email-in me kredencialet nga mësuesi/admini',
          'Hyni në platformë me email + fjalëkalim',
          'Paneli tregon kurset, detyrat dhe sesionet aktive',
        ],
        tip: 'Ndrysho fjalëkalimin herën e parë nga Profili → Llogaria.',
      },
    ],
  },
  {
    icon: BookOpen,
    color: 'violet',
    title: 'Mësimet',
    description: 'Si të ndiqni kurset dhe të mësoni',
    items: [
      {
        title: 'Ndiqni Kurset',
        description: 'Aksesoni materialet tuaja.',
        steps: [
          'Shko te Kurset e Mia — shfaqen të gjitha kurset',
          'Kliko mbi kurs për të hapur modulet',
          'Brenda modulit zgjidh leksionin dhe fillo mësimet',
        ],
      },
      {
        title: 'Vazhdo Mësimin',
        description: 'Rifillo nga ku mbete.',
        steps: [
          'Shko te "Vazhdo Mësimin" (Paneli kryesor)',
          'Klikoni leksionin e fundit — vazhdoni direkt',
        ],
        tip: 'Progresi ruhet automatikisht.',
      },
    ],
  },
  {
    icon: HelpCircle,
    color: 'blue',
    title: 'Kuizet & Testet',
    description: 'Si të bëni teste dhe kuize',
    items: [
      {
        title: 'Bëni Kuiz',
        description: 'Kryeni kuizet e caktuara nga mësuesi.',
        steps: [
          'Shko te Kuizet ose hap leksionin që ka kuiz',
          'Kliko "Fillo Kuizin"',
          'Kalohu pyetjet — kliko "Paraqit" kur të mbarosh',
          'Shiko rezultatin menjëherë',
        ],
        tip: 'Kuizet mund të kenë kohë të kufizuar. Shiko orën në këndin e ekranit.',
      },
      {
        title: 'Kuiz Live (Realtime)',
        description: 'Kuiz interaktiv me të gjithë klasën.',
        steps: [
          'Mësuesi fillon sesionin dhe ndajeni kodin',
          'Shko te Kuiz Live → fut kodin',
          'Përgjigju pyetjeve sa më shpejt për pikë shtesë',
          'Shiko rezultatin në tabelën e klasifikimit',
        ],
      },
    ],
  },
  {
    icon: Video,
    color: 'rose',
    title: 'Sesionet Live',
    description: 'Pjesëmarrja në mësime virtuale',
    items: [
      {
        title: 'Bashkohuni në Sesion',
        description: 'Merrni pjesë në mësimet live.',
        steps: [
          'Shko te Sesionet Live — shfaqet sesioni aktiv',
          'Kliko "Bashkohu" — jepni leje për kamera dhe mikrofon',
          'Jeni brenda mësimit live!',
        ],
      },
      {
        title: 'Gjatë Sesionit',
        description: 'Funksionet që mund të përdorni.',
        steps: [
          '✋ Ngreni dorën — njoftoni mësuesin',
          '😊 Reaksione — dërgoni emoji (nëse mësuesi e ka aktivizuar)',
          '💬 Chat — shkruani mesazhe (nëse mësuesi e ka aktivizuar)',
          '📝 Kuiz — nëse mësuesi dërgon kuiz, do hapet automatikisht',
        ],
        tip: 'Nëse mësuesi ka bllokuar chat-in ose reaksionet, butonat shfaqin "bllokuar".',
      },
    ],
  },
  {
    icon: BarChart3,
    color: 'amber',
    title: 'Progresi & Rezultatet',
    description: 'Monitoroni arritjet tuaja',
    items: [
      {
        title: 'Shikoni Progresin',
        description: 'Gjurmoni ecurinë tuaj.',
        steps: [
          'Shko te Progresi im — grafiku i kurseve të përfunduara',
          'Shko te Rezultatet — notat e të gjitha kuizeve',
          'Shko te Certifikatat — shikoni çmimet e fituara',
        ],
      },
      {
        title: 'Badges & Arritje',
        description: 'Fitoni badge-e duke mësuar.',
        steps: [
          'Shko te Badges — shiko badge-et e fituara dhe ato në pritje',
          'Completo kurse dhe kuize për të fituar badge-e të reja',
        ],
      },
    ],
  },
];

const colorMap: Record<string, string> = {
  blue:    'bg-blue-50 text-blue-600 border-blue-100',
  violet:  'bg-violet-50 text-violet-600 border-violet-100',
  emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  rose:    'bg-rose-50 text-rose-600 border-rose-100',
  amber:   'bg-amber-50 text-amber-600 border-amber-100',
  slate:   'bg-slate-100 text-slate-600 border-slate-200',
};

function GuideCard({ section }: { section: GuideSection }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const colorCls = colorMap[section.color] || colorMap.slate;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className={cn('flex items-center gap-3 p-4 border-b', colorCls)}>
        <div className={cn('p-2 rounded-xl border', colorCls)}>
          <section.icon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-slate-800 text-base">{section.title}</h3>
          <p className="text-sm text-slate-500">{section.description}</p>
        </div>
      </div>
      <div className="divide-y divide-slate-50">
        {section.items.map((item, idx) => (
          <div key={idx}>
            <button
              className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left"
              onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
            >
              <span className="font-semibold text-slate-700 text-sm">{item.title}</span>
              {openIdx === idx
                ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
            </button>
            {openIdx === idx && (
              <div className="px-4 pb-4 space-y-3">
                <p className="text-sm text-slate-500">{item.description}</p>
                {item.steps && (
                  <ol className="space-y-2">
                    {item.steps.map((step, si) => (
                      <li key={si} className="flex items-start gap-2.5 text-sm text-slate-700">
                        <span className={cn(
                          'mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0',
                          colorCls
                        )}>
                          {si + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                )}
                {item.tip && (
                  <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800">
                    <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <span>{item.tip}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GuidePage() {
  const { pathname } = useLocation();
  const role = pathname.startsWith('/admin') ? 'admin'
    : pathname.startsWith('/teacher') ? 'teacher'
    : 'student';

  const guide = role === 'admin' ? adminGuide : role === 'teacher' ? teacherGuide : studentGuide;
  const roleLabel = role === 'admin' ? 'Admin' : role === 'teacher' ? 'Mësues' : 'Student';
  const roleBadge = role === 'admin'
    ? 'bg-violet-100 text-violet-700'
    : role === 'teacher'
    ? 'bg-blue-100 text-blue-700'
    : 'bg-emerald-100 text-emerald-700';

  const content = (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full', roleBadge)}>{roleLabel}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Udhëzuesi i Platformës</h1>
          <p className="text-slate-500 text-sm mt-1">
            Mëso çfarë mund të bësh dhe si të fillosh — zgjedh çdo seksion për hapa të detajuar.
          </p>
        </div>
        <div className="hidden sm:flex w-14 h-14 rounded-2xl bg-violet-50 border border-violet-100 items-center justify-center">
          <HelpCircle className="w-7 h-7 text-violet-500" />
        </div>
      </div>

      {/* Quick summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {guide.map((section, idx) => (
          <a
            key={idx}
            href={`#section-${idx}`}
            className={cn(
              'flex items-center gap-2.5 p-3 rounded-xl border text-sm font-semibold transition-all hover:shadow-sm',
              colorMap[section.color]
            )}
          >
            <section.icon className="w-4 h-4 shrink-0" />
            {section.title}
          </a>
        ))}
      </div>

      {/* Guide cards */}
      {guide.map((section, idx) => (
        <div key={idx} id={`section-${idx}`}>
          <GuideCard section={section} />
        </div>
      ))}

      {/* Footer note */}
      <div className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-600">
        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
        <p>
          Nëse keni pyetje ose probleme, kontaktoni administratorin e platformës.
          Gjithçka ruhet automatikisht — mos kini frikë të eksploroni!
        </p>
      </div>
    </div>
  );

  if (role === 'admin') return <AdminLayout>{content}</AdminLayout>;
  if (role === 'teacher') return <TeacherLayout>{content}</TeacherLayout>;
  return <StudentLayout>{content}</StudentLayout>;
}
