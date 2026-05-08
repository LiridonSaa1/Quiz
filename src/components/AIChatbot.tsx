import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Sparkles, X, Send, Loader2, ChevronDown, RotateCcw, Bot, MessageCircle } from 'lucide-react';
import { cn } from '../lib/utils';

type Role = 'teacher' | 'student' | 'admin';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIChatbotProps {
  userRole: Role;
}

/* ─────────────────────────────────────────────
   KNOWLEDGE BASE — full platform coverage
───────────────────────────────────────────── */

interface KBEntry {
  keywords: string[];
  roles?: Role[];
  pages?: string[];          // partial path matches
  answer: string;
}

const KB: KBEntry[] = [
  /* ═══ TEACHER — QUIZ ═══ */
  {
    keywords: ['create quiz','new quiz','make quiz','build quiz','shto quiz','krijo quiz','quiz i ri'],
    roles: ['teacher'],
    answer: `Si të krijoni një quiz:
1. Klikoni "Quizzes" në menunë anësore
2. Klikoni butonin "Create Quiz" (lart djathtas)
3. Shkruani titullin e quiz-it
4. Shtoni përshkrimin (opsional)
5. Klikoni "+ Add Question" për të shtuar pyetje
6. Zgjidhni llojin: Zgjedhje të shumëfishta, E vërtetë/E gabuar, Tekst i shkurtër, etj.
7. Shkruani pyetjen dhe përgjigjet
8. Vendosni pikët dhe kohëzgjatjen (timer)
9. Klikoni "Publish Quiz" për ta bërë të disponueshëm për studentët

Këshillë: Mund të përdorni "AI Fill" për të gjeneruar pyetje automatikisht nga teksti ose imazhe.`,
  },
  {
    keywords: ['publish quiz','publiko quiz','aktivizo quiz'],
    roles: ['teacher'],
    answer: `Si të publikoni një quiz:
1. Hapni quiz-in në Quiz Builder
2. Sigurohuni që të gjitha pyetjet janë plotësuar
3. Klikoni çelësin "Published" (toggle) në krye të faqes
4. Klikoni "Save" — quiz-i tani është i dukshëm për studentët`,
  },
  {
    keywords: ['add question','shto pyetje','question type','lloji pyetjes'],
    roles: ['teacher'],
    answer: `Llojet e pyetjeve të disponueshme:
- Zgjedhje e shumëfishte (Multiple Choice) — 4 opsione, 1 e saktë
- E vërtetë / E gabuar (True/False)
- Tekst i shkurtër (Short Answer) — studenti shkruan
- Tekst i gjatë (Long Answer) — ese/paragraf
- Ngarkim skedari (File Upload) — studenti ngark dokument
- Pyetje me imazh — imazh si sfond pyetjeje

Për çdo pyetje mund të:
- Vendosni pikët (points)
- Shtoni shpjegim (explanation) pas përgjigjes
- Caktoni kohëzgjatje individuale`,
  },
  {
    keywords: ['edit quiz','ndrysho quiz','modifiko quiz'],
    roles: ['teacher'],
    answer: `Si të ndryshoni një quiz ekzistues:
1. Shkoni te "Quizzes" në menunë anësore
2. Gjeni quiz-in dhe klikoni ikonën e lapsit (Edit)
3. Bëni ndryshimet e dëshiruara
4. Klikoni "Save" për të ruajtur ndryshimet

Shënim: Nëse quiz-i ka nxënës që e kanë filluar, ndryshimet ndikojnë vetëm tek tentat e reja.`,
  },
  {
    keywords: ['delete quiz','fshi quiz','remove quiz'],
    roles: ['teacher'],
    answer: `Si të fshini një quiz:
1. Shkoni te "Quizzes" në menunë anësore
2. Klikoni ikonën e koshit (🗑) pranë quiz-it
3. Konfirmoni fshirjen në dialog-un e konfirmimit

Kujdes: Fshirja është e pakthyeshme. Rezultatet e mëparshme mund të preken.`,
  },

  /* ═══ TEACHER — LIVE QUIZ ═══ */
  {
    keywords: ['live quiz','quiz live','start live','fillo quiz live','quiz me pin','realtime quiz','quiz me pin','quiz ne kohe reale'],
    roles: ['teacher'],
    answer: `Si të filloni një Live Quiz:
1. Klikoni "Live Quiz" në menunë anësore
2. Zgjidhni quiz-in nga lista rënëse
3. (Opsional) Aktivizoni "Teams" nëse dëshironi grupe
4. Klikoni "Start Live Quiz"
5. Do të shfaqet një PIN 6-shifror
6. Ndani PIN-in me studentët — ata shkojnë te "Live Quiz" dhe e shkruajnë
7. Prisni derisa studentët të bashkohen (i shihni numrin)
8. Klikoni "Start Quiz!" për të filluar pyetjet
9. Çdo pyetje kalon automatikisht sipas kohëzgjatjes

Shihni rezultatet live gjatë sesionit dhe raportit final pas mbarimit.`,
  },
  {
    keywords: ['quiz pin','pin kod','pin code','kopjo pin','share pin'],
    roles: ['teacher'],
    answer: `PIN-i i Live Quiz:
- Shfaqet automatikisht pasi klikoni "Start Live Quiz"
- Është 6 shifra (p.sh. 482931)
- Klikoni "Copy PIN" për ta kopjuar
- Ndajeni me studentët me gojë, mesazh, ose ekran projektor
- Studentët shkojnë te "Live Quiz" → fusin PIN-in → "Join Quiz!"`,
  },
  {
    keywords: ['quiz report','raport quiz','rezultate live quiz','live quiz results'],
    roles: ['teacher'],
    answer: `Si të shihni raportet e Live Quiz:
1. Klikoni "Quiz Reports" në menunë anësore (nën Live Quiz)
2. Zgjidhni sesionin nga lista
3. Shihni: pikët, renditjen, kohën e përgjigjes, pyetjet e humbura

Raportet ruhen automatikisht pasi sesioni përfundon.`,
  },

  /* ═══ TEACHER — COURSES ═══ */
  {
    keywords: ['create course','new course','krijo kurs','kurs i ri','shto kurs','make course'],
    roles: ['teacher'],
    answer: `Si të krijoni një kurs:
1. Klikoni "My Courses" në menunë anësore
2. Klikoni "New Course" (lart djathtas) ose "AI Create" për ndihmë AI
3. Plotësoni:
   - Titulli i kursit
   - Përshkrimi i shkurtër
   - Përshkrimi i plotë
   - Kategoria dhe niveli
   - Çmimi (0 për falas)
   - Gjuha
4. Ngarkoni foto ballore (thumbnail)
5. Klikoni "Save" — kursi ruhet si Draft
6. Klikoni ikonën ✓ për ta Publikuar

Hapat e radhës: Shtoni Module dhe Mësime brenda kursit.`,
  },
  {
    keywords: ['publish course','publiko kurs','aktivizo kurs'],
    roles: ['teacher'],
    answer: `Si të publikoni një kurs:
1. Shkoni te "My Courses"
2. Gjeni kursin Draft
3. Klikoni ikonën e shegut (✓ check) pranë tij
4. Statusi kalon nga "Draft" në "Published"
5. Studentët e shohin dhe mund të regjistrohen`,
  },
  {
    keywords: ['course module','shto module','krijo module','module kursit'],
    roles: ['teacher'],
    answer: `Si të shtoni Module në kurs:
1. Shkoni te "Modules" në menunë anësore
2. Klikoni "Add Module"
3. Zgjidhni kursin (Course)
4. Shkruani titullin dhe përshkrimin e modulit
5. Vendosni renditjen (Order)
6. Zgjidhni statusin: Active/Inactive
7. Klikoni "Save"

Çdo kurs mund të ketë shumë module të organizuara me numër rendor.`,
  },

  /* ═══ TEACHER — LESSONS ═══ */
  {
    keywords: ['create lesson','new lesson','krijo mesim','mesim i ri','shto mesim','add lesson'],
    roles: ['teacher'],
    answer: `Si të krijoni një mësim:
1. Klikoni "Lessons" në menunë anësore
2. Klikoni "Add Lesson"
3. Zgjidhni Kursin dhe Modulin
4. Shkruani titullin e mësimit
5. Zgjidhni llojin:
   - Video — ngarkoni video ose linkoni URL
   - Text — shkruani përmbajtje me redaktues
   - Quiz — lidhni me një quiz ekzistues
6. Vendosni kohëzgjatjen (minuta) dhe renditjen
7. (Opsional) Aktivizoni "Free Preview" — mësimi shfaqet falas
8. Klikoni "Save"`,
  },
  {
    keywords: ['lesson content','permbajtja mesimit','video lesson','text lesson','edit lesson'],
    roles: ['teacher'],
    answer: `Si të menaxhoni përmbajtjen e mësimit:
1. Shkoni te "Lessons"
2. Klikoni mësimin për ta hapur
3. Tek "Content Manager" mund të:
   - Ngarkoni video (MP4, WebM)
   - Shkruani tekst të formatuar
   - Shtoni fajle bashkëngjitur
4. Klikoni "Save Content" pas çdo ndryshimi`,
  },

  /* ═══ TEACHER — LIVE SESSIONS ═══ */
  {
    keywords: ['live session','sesion live','video sesion','sesion video','jitsi','krijoni sesion','new session','shto sesion'],
    roles: ['teacher'],
    answer: `Si të krijoni një Sesion Live (video):
1. Klikoni "Live Sessions" në menunë anësore
2. Klikoni "New Session"
3. Plotësoni:
   - Titulli i sesionit
   - Përshkrimi
   - Data dhe ora (scheduled)
   - Kohëzgjatja (minuta)
4. Ftoni studentë: kërkoni me emër ose zgjidhni klasën
5. Klikoni "Create Session"
6. Kur vjen koha: klikoni "Start" pranë sesionit
7. Hapeni "Room" — dhoma video Jitsi fillon automatikisht

Mund të regjistroni sesionin — rekordimet ruhen dhe mund t'i ndajnë studentët.`,
  },
  {
    keywords: ['start session','fillo sesion','join room','dhoma live','hap sesionin'],
    roles: ['teacher'],
    answer: `Si të filloni dhe menaxhoni sesionin live:
1. Klikoni "Start" pranë sesionit (statusi kalon në "Live")
2. Klikoni "Go to Room" për të hyrë në dhomë
3. Brenda dhomës:
   - Mikrofon, Kamera, Share Screen, Regjistrim (shiriti i poshtëm)
   - Sidebar djathtas: Pjesëmarrësit dhe Chat
   - Mund të mute/unmute pjesëmarrës
4. Klikoni "End Session" kur përfundon

Rekordimi ngarkohet automatikisht te Supabase Storage.`,
  },

  /* ═══ TEACHER — STUDENTS ═══ */
  {
    keywords: ['my students','studentet e mi','shiko studentet','lista studentesh','student list'],
    roles: ['teacher'],
    answer: `Si të shihni dhe menaxhoni studentët:
1. Klikoni "My Students" në menunë anësore
2. Shihni listën e studentëve të regjistruar
3. Mund të:
   - Kërkoni sipas emrit
   - Filtroni sipas kursit ose klasës
   - Klikoni studentin për të parë detajet dhe progresin
   - Shihni quiz-et e plotësuara dhe rezultatet`,
  },
  {
    keywords: ['student progress','progres student','rezultate student','shiko progresin'],
    roles: ['teacher'],
    answer: `Si të shihni progresin e studentëve:
1. Klikoni "Student Progress" në menunë anësore (Analytics)
2. Ose klikoni "Quiz Results" për rezultate specifike quiz
3. Filtroni sipas:
   - Studentit
   - Kursit
   - Quiz-it ose periudhës kohore
4. Shihni: pikët, orën e tentativës, pyetjet e gabuara, kohën e shpenzuar`,
  },

  /* ═══ TEACHER — CLASSES ═══ */
  {
    keywords: ['create class','new class','krijo klas','klas e re','shto klas','classes'],
    roles: ['teacher'],
    answer: `Si të krijoni një Klasë:
1. Klikoni "Classes" në menunë anësore
2. Klikoni "New Class" ose "Add Class"
3. Shkruani emrin e klasës
4. Shtoni studentë (search dhe select)
5. Klikoni "Save"

Klasat ndihmojnë të organizoni studentë dhe të caktoni sesione live ose quiz-e grupore.`,
  },

  /* ═══ TEACHER — ASSIGNMENTS ═══ */
  {
    keywords: ['create assignment','new assignment','detyra e re','shto detyre','assignment'],
    roles: ['teacher'],
    answer: `Si të krijoni një Detyrë (Assignment):
1. Klikoni "Assignments" në menunë anësore
2. Klikoni "New Assignment"
3. Plotësoni:
   - Titulli dhe përshkrimi
   - Kursi dhe klasa
   - Lloji (Ese, Projekt, File Upload)
   - Data e afatit (Due Date)
   - Pikët maksimale (Max Score)
4. Klikoni "Save"

Studentët shohin detyrën dhe ngarkojnë dorëzimin para afatit.`,
  },

  /* ═══ TEACHER — ATTENDANCE ═══ */
  {
    keywords: ['attendance','prezenca','mark attendance','sheno prezence'],
    roles: ['teacher'],
    answer: `Si të shënoni Prezencën:
1. Klikoni "Attendance" në menunë anësore
2. Zgjidhni klasën dhe datën
3. Për çdo student zgjidhni:
   - Present (Prezent)
   - Absent (Mungues)
   - Late (Vonuar)
   - Excused (Me justifikim)
4. Klikoni "Save Attendance"

Raporti i prezencës mund të shëqyrtohet dhe eksportohet.`,
  },

  /* ═══ TEACHER — CERTIFICATES ═══ */
  {
    keywords: ['certificate','certifikata','leshoni certifikat','issue certificate'],
    roles: ['teacher'],
    answer: `Si të lëshoni një Certifikatë:
1. Klikoni "Certificates" në menunë anësore
2. Klikoni "Issue Certificate"
3. Zgjidhni studentin dhe kursin
4. Plotësoni: nota, pikët, numri i certifikatës
5. Klikoni "Issue"

Studenti sheh certifikatën e tij te seksioni "Certificates" dhe mund ta shkarkojë.`,
  },

  /* ═══ TEACHER — COMMUNITY ═══ */
  {
    keywords: ['community','diskutim','kerkoj diskutim','postoj pyetje','answer question'],
    roles: ['teacher'],
    answer: `Si të përdorni Community (Diskutimet):
1. Klikoni "Community" në menunë anësore
2. Zgjidhni mësimin nga lista
3. Shihni pyetjet e studentëve
4. Klikoni pyetjen për të hapur thread-in
5. Shkruani përgjigjen dhe klikoni "Post Answer"
6. Mund të shënoni përgjigjen si "Best Answer" ✓
7. Pinoni pyetjet e rëndësishme me butonin Pin 📌`,
  },

  /* ═══ TEACHER — ANNOUNCEMENTS ═══ */
  {
    keywords: ['announcement','njoftim','shto njoftim','publish announcement'],
    roles: ['teacher'],
    answer: `Si të krijoni një Njoftim:
1. Klikoni "Announcements" në menunë anësore
2. Klikoni "New Announcement"
3. Shkruani titullin dhe mesazhin
4. Zgjidhni kursin ose klasën target
5. Vendosni datën e skadencës (opsional)
6. Klikoni "Publish"

Studentët e shohin njoftimin te paneli i tyre.`,
  },

  /* ═══ TEACHER — PROFILE ═══ */
  {
    keywords: ['profile','profili','ndrysho emrin','change name','foto profili','avatar'],
    roles: ['teacher'],
    answer: `Si të ndryshoni profilin tuaj:
1. Klikoni "Profile" në fund të menusë anësore
2. Ndryshoni emrin e shfaqur (Display Name)
3. Ngarkoni foto profili (avatar)
4. Ndryshoni fjalëkalimin te "Security"
5. Klikoni "Save Changes"`,
  },

  /* ═══ TEACHER — EXAMS ═══ */
  {
    keywords: ['exam','provim','create exam','krijo provim'],
    roles: ['teacher'],
    answer: `Si të krijoni një Provim (Exam):
1. Klikoni "Exams" në menunë anësore
2. Klikoni "New Exam"
3. Plotësoni titullin, përshkrimin, kohëzgjatjen
4. Shtoni pyetjet (të njëjtat lloje si quiz)
5. Vendosni datën e hapjes dhe mbylljes
6. Publikoni provimin

Provimet janë të ngjashme me quiz-et por zakonisht kohëzgjatje më të gjatë.`,
  },

  /* ═══ STUDENT — QUIZ TAKING ═══ */
  {
    keywords: ['take quiz','si te bej quiz','si te plotesoj quiz','fillo quiz','start quiz','quiz si'],
    roles: ['student'],
    answer: `Si të bëni një Quiz:
1. Klikoni "Quizzes" ose "Continue Learning" në menunë anësore
2. Zgjidhni quiz-in e disponueshëm
3. Lexoni udhëzimet dhe klikoni "Start Quiz"
4. Përgjigjuni çdo pyetjeje:
   - Klikoni opsionin e dëshiruar (zgjedhje e shumëfishte)
   - Ose shkruani përgjigjen (tekst)
5. Navigoni me butonat "Previous" / "Next"
6. Mbani syrin te kronometri (timer)
7. Klikoni "Submit Quiz" kur përfundoni
8. Konfirmoni dorëzimin në dialog-un e konfirmimit

Shënim: Mos ndërroni tab-in gjatë quiz-it — regjistrohet si shkelje!`,
  },
  {
    keywords: ['quiz timer','koha quiz','koha mbaron','time up','automatic submit'],
    roles: ['student'],
    answer: `Rreth kohëzgjatjes së Quiz-it:
- Kronometri shfaqet lart djathtas gjatë quiz-it
- Kur koha mbaron, quiz-i dorëzohet automatikisht
- Ju njoftoheni me mesazh paralajmërues 1 minutë para
- Klikoni "Submit" manualisht para se të mbarojë koha
- Nëse ndërroni tab ose dritare disa herë, quiz-i mund të dorëzohet automatikisht (anti-mashtrimi)`,
  },
  {
    keywords: ['quiz results','rezultate quiz','nota ime','score','pika','vleresimet'],
    roles: ['student'],
    answer: `Si të shihni rezultatet tuaja:
1. Klikoni "Results" ose "Quiz Results" në menunë anësore
2. Shihni listën e quiz-eve të plotësuara
3. Klikoni quiz-in për të parë detajet:
   - Pikët totale dhe përqindjen
   - Pyetjet e sakta dhe të gabuara
   - Shpjegimin e çdo përgjigje
   - Krahasimin me klasën (nëse aktivizuar)`,
  },
  {
    keywords: ['join live quiz','live quiz student','pin quiz','fut pin','bashkohu quiz'],
    roles: ['student'],
    answer: `Si të bashkoheni në Live Quiz:
1. Mësuesit ju jep një PIN 6-shifror
2. Klikoni "Live Quiz" në menunë anësore
3. Shkruani PIN-in në fushën "Quiz PIN"
4. Klikoni "Join Quiz!"
5. Prisni mesazhin "Waiting for teacher to start..."
6. Kur mësuesi fillon, pyetjet shfaqen njëra pas tjetrës
7. Klikoni opsionin tuaj shpejt — ka kohëzgjatje!
8. Rezultatet dhe renditja shfaqen menjëherë`,
  },

  /* ═══ STUDENT — COURSES ═══ */
  {
    keywords: ['my courses','kurset e mia','regjistrohu kurs','join course','shiko kurset'],
    roles: ['student'],
    answer: `Si të shihni dhe regjistroheni në kurse:
1. Klikoni "My Courses" në menunë anësore
2. Shihni kurset ku jeni regjistruar
3. Klikoni kursin për të hapur detajet
4. Shihni modulet, mësimet dhe progresin tuaj
5. Klikoni "Continue" për të vazhduar nga ku e latë`,
  },
  {
    keywords: ['continue learning','vazhdo mesimin','continue lesson','ku ndala'],
    roles: ['student'],
    answer: `Si të vazhdoni mësimin:
1. Klikoni "Continue Learning" në menunë anësore
2. Shfaqet mësimi i fundit ku ndalet
3. Klikoni "Continue" për ta hapur
4. Ose shkoni te kursi specifik → Module → Mësim
5. Progresi ruhet automatikisht`,
  },
  {
    keywords: ['lesson video','shiko mesimin','hap mesimin','leksioni','watch lesson'],
    roles: ['student'],
    answer: `Si të hapni dhe shikoni një mësim:
1. Shkoni te kursi → moduli → mësimi
2. Klikoni mësimin nga lista
3. Nëse është video: shtypni Play dhe shikoni
4. Nëse është tekst: lexoni dhe scrolloni
5. Nëse është quiz: plotësonit drejtpërdrejt
6. Pasi përfundoni, statusi "Completed" shënohet automatikisht`,
  },

  /* ═══ STUDENT — LIVE SESSIONS ═══ */
  {
    keywords: ['live session student','bashkohu sesion','join live session','sesion video student'],
    roles: ['student'],
    answer: `Si të bashkoheni në sesion live:
1. Klikoni "Live Sessions" në menunë anësore
2. Shihni sesionet e disponueshme (aktive ose të ardhshme)
3. Prisni derisa sesioni të bëhet "Live Now"
4. Klikoni "Join Session"
5. Brenda dhomës mund të:
   - Rrisni dorën (Raise Hand 🤚)
   - Dërgoni emoji reactions
   - Bisedoni në chat-in e grupit
6. Pasi sesioni mbaron, mund të shihni rekordimet`,
  },

  /* ═══ STUDENT — ASSIGNMENTS ═══ */
  {
    keywords: ['assignment student','detyra ime','submit assignment','dorëzo detyrën','dorzo detyre','ngarko detyre'],
    roles: ['student'],
    answer: `Si të dorëzoni një detyrë:
1. Klikoni "Assignments" në menunë anësore
2. Zgjidhni detyrën nga lista
3. Lexoni udhëzimet dhe afatin
4. Klikoni "Submit Assignment"
5. Ngarkoni fajlin ose shkruani përgjigjen
6. Klikoni "Submit" — ruhet me timestamp
7. Shihni statusin: Pending / Graded`,
  },
  {
    keywords: ['deadline','afati','due date','kur skadon'],
    roles: ['student'],
    answer: `Afatet e detyrave:
- Shfaqen te faqja "Assignments" si datë dhe orë
- Afati i kaluar: detyra shënohet "Late" ose bllokohet
- Klikoni detyrën për të parë afatin e saktë
- Dorëzoni para afatit për të shmangur vonesa
- Kontaktoni mësuerin nëse keni probleme teknike`,
  },

  /* ═══ STUDENT — PROGRESS ═══ */
  {
    keywords: ['my progress','progresi im','statistics','statistika','shiko progresin'],
    roles: ['student'],
    answer: `Si të shihni progresin tuaj:
1. Klikoni "My Progress" në menunë anësore
2. Shihni:
   - Kurset e filluana dhe të plotësuara
   - Numrin e mësimeve të shikuara
   - Pikët mesatare të quiz-eve
   - Streak i mësuarjes (ditët radhazi)
3. Grafiku tregon aktivitetin tuaj javor`,
  },

  /* ═══ STUDENT — CERTIFICATES ═══ */
  {
    keywords: ['certificate student','certifikata ime','download certificate','shkarko certifikat'],
    roles: ['student'],
    answer: `Si të shikoni dhe shkarkoni certifikatat:
1. Klikoni "Certificates" në menunë anësore
2. Shihni certifikatat e lëshuara nga mësuesi
3. Klikoni certifikatën për të parë vizualisht
4. Klikoni "Download" ose "Print" për ta ruajtur
5. Certifikata tregon: emrin, kursin, notën, datën, numrin unik`,
  },

  /* ═══ STUDENT — BADGES ═══ */
  {
    keywords: ['badge','badges','shperblimet','trofete','arritjet'],
    roles: ['student'],
    answer: `Rreth Badges (Shpërblimet):
1. Klikoni "Badges" në menunë anësore
2. Shihni badgeset e fituara dhe ato ende pa fituar
3. Badges fitohen kur:
   - Plotësoni kurse
   - Arrini pikë të larta
   - Kryeni mësime radhazi
   - Fitoni Live Quiz-e`,
  },

  /* ═══ STUDENT — COMMUNITY ═══ */
  {
    keywords: ['ask question','posto pyetje','diskutim student','community student','bej pyetje'],
    roles: ['student'],
    answer: `Si të bëni pyetje në Community:
1. Klikoni "Community" në menunë anësore
2. Zgjidhni mësimin nga lista
3. Klikoni "Ask a Question"
4. Shkruani titullin dhe detajet e pyetjes
5. Klikoni "Post Question"
6. Mësuesi ose studentë të tjerë do të përgjigjen
7. Klikoni "Mark as Solved" kur pyetja juaj ka përgjigje

Mund të votoni (upvote) përgjigjet e dobishme.`,
  },

  /* ═══ STUDENT — PROFILE ═══ */
  {
    keywords: ['student profile','profili student','ndrysho emrin student','edit profile'],
    roles: ['student'],
    answer: `Si të ndryshoni profilin:
1. Klikoni "Profile" në menunë anësore
2. Ndryshoni emrin e shfaqur
3. Ngarkoni foto profili
4. Ruani ndryshimet me "Save"`,
  },

  /* ═══ ADMIN — STUDENTS ═══ */
  {
    keywords: ['add student','shto student','create student','regjistro student','student i ri'],
    roles: ['admin'],
    answer: `Si të shtoni një Student:
1. Klikoni "Students" në menunë anësore
2. Klikoni "Add Student"
3. Plotësoni:
   - Emri i plotë
   - Email-i
   - Fjalëkalimi fillestar
4. Klikoni "Create Student"

Sistemi krijon llogarinë dhe dërgon email konfirmimi (nëse email-i është konfiguruar).`,
  },
  {
    keywords: ['manage students','menaxho studentet','shiko gjithe studentet','lista e studenteve'],
    roles: ['admin'],
    answer: `Si të menaxhoni studentët:
1. Klikoni "Students" në menunë anësore
2. Shihni listën e plotë të studentëve
3. Kërkoni sipas emrit ose email-it
4. Klikoni studentin për:
   - Parë detajet e profilit
   - Shikuar progresin dhe rezultatet
   - Çaktivizuar ose fshirë llogarinë
5. Eksportoni listën si CSV nëse disponohet`,
  },

  /* ═══ ADMIN — TEACHERS ═══ */
  {
    keywords: ['add teacher','shto mesues','create teacher','mesues i ri'],
    roles: ['admin'],
    answer: `Si të shtoni një Mësues:
1. Klikoni "Teachers" në menunë anësore
2. Klikoni "Add Teacher"
3. Plotësoni emrin, email-in dhe fjalëkalimin
4. Klikoni "Create Teacher"

Mësuesi mund të hyjë menjëherë me kredencialet e dhëna.`,
  },

  /* ═══ ADMIN — COURSES ═══ */
  {
    keywords: ['admin course','admin kurs','menaxho kurset','te gjitha kurset'],
    roles: ['admin'],
    answer: `Si të menaxhoni Kurset si Admin:
1. Klikoni "Courses" në menunë anësore
2. Shihni të gjitha kurset e platformës
3. Mund të:
   - Filtroni sipas statusit, kategorisë ose mësuesit
   - Klikoni kursin për detajet
   - Fshini ose çaktivizoni kurse problematike
4. Mësuesit menaxhojnë kurset e tyre vetë`,
  },

  /* ═══ ADMIN — CLASSES ═══ */
  {
    keywords: ['admin class','klasa admin','create class admin','menaxho klasa'],
    roles: ['admin'],
    answer: `Si të krijoni dhe menaxhoni Klasa:
1. Klikoni "Classes" në menunë anësore
2. Klikoni "Add Class"
3. Shkruani emrin e klasës
4. Shtoni studentë dhe caktoni mësueson
5. Klikoni "Save"

Klasat lidhin studentë me mësusin e tyre specifik.`,
  },

  /* ═══ ADMIN — SETTINGS ═══ */
  {
    keywords: ['settings','cilesimet','konfigurim','platform settings','general settings'],
    roles: ['admin'],
    answer: `Cilësimet e Platformës kanë 5 tab-e:
1. General — Emri i shkollës, email kontakti, gjuha, timezone
2. Notifications — Aktivizo/çaktivizo njoftime email
3. Email — Konfiguro SMTP (host, port, username)
4. Security — 2FA për role (Student/Teacher/Admin)
5. Advanced — Regjistrim i hapur, verifikim email

Klikoni "Save" pas çdo ndryshimi.`,
  },
  {
    keywords: ['2fa','dy faktor','two factor','siguria','security settings','autentifikim'],
    roles: ['admin'],
    answer: `Si të konfiguroni 2FA (Autentifikimi Dyshortësh):
1. Shkoni te Settings → tab "Security"
2. Shihni 3 role: Students, Teachers, Admins
3. Aktivizoni toggle-in për rolin e dëshiruar
4. Klikoni "Save"

Kur 2FA është aktiv, përdoruesit marrin kod 6-shifror me email pas hyrjes.
Konfiguroni email-in te tab "Email" para se të aktivizoni 2FA.`,
  },
  {
    keywords: ['enable feature','aktivizo vecorine','community enable','live session enable','announcement enable','payment enable'],
    roles: ['admin'],
    answer: `Si të aktivizoni/çaktivizoni veçoritë e platformës:
1. Shkoni te Settings → tab "Advanced"
2. Gjeni togglet e veçorive:
   - Community (diskutimet)
   - Live Sessions (video klasa)
   - Announcements (njoftime)
   - Payments (pagesat)
3. Aktivizoni ose çaktivizoni me toggle
4. Klikoni "Save"

Veçoritë çaktivizuara fshihen nga menuja e të gjithë përdoruesve.`,
  },

  /* ═══ ADMIN — BRANDING ═══ */
  {
    keywords: ['branding','logo','emri shkolles','ndrysho logon','brand','customize'],
    roles: ['admin'],
    answer: `Si të personalizoni platformën (Branding):
1. Klikoni "Branding" në menunë anësore
2. Ndryshoni:
   - Emri i shkollës / organizatës
   - Logo (ngarkoni PNG/SVG)
   - Ngjyrat e temës (primary, secondary)
   - Favicon
3. Klikoni "Save Branding"

Logo shfaqet kudo: sidebar, topbar, faqja e hyrjes.`,
  },

  /* ═══ ADMIN — ROLES & PERMISSIONS ═══ */
  {
    keywords: ['roles','permissions','leje','role i ri','cakto leje','access control'],
    roles: ['admin'],
    answer: `Si të menaxhoni Rolet dhe Lejet:
1. Klikoni "Roles & Permissions" në menunë anësore
2. Shihni rolet ekzistuese (Teacher, Student, Admin)
3. Klikoni rolin për të ndryshuar lejet
4. Aktivizoni/çaktivizoni leje specifike:
   - Krijimi i kurseve, quiz-eve
   - Menaxhimi i studentëve
   - Qasja te raporteve
5. Klikoni "Save Permissions"`,
  },

  /* ═══ ADMIN — ANALYTICS ═══ */
  {
    keywords: ['analytics','statistika admin','raportet','reports','shiko analitike'],
    roles: ['admin'],
    answer: `Si të shihni Analitikën e Platformës:
1. Klikoni "Analytics" ose "Reports" në menunë anësore
2. Shihni:
   - Numri total i studentëve, mësuesve, kurseve
   - Aktiviteti ditor/javor
   - Quiz-et më të popullarizuara
   - Kurset me regjistrim më të lartë
3. Eksportoni raportet si CSV/Excel`,
  },

  /* ═══ ADMIN — CERTIFICATES ═══ */
  {
    keywords: ['admin certificate','leshoni certifikata','issue cert admin','certifikata admin'],
    roles: ['admin'],
    answer: `Si të lëshoni Certifikata si Admin:
1. Klikoni "Certificates" në menunë anësore
2. Klikoni "Issue Certificate"
3. Zgjidhni studentin, kursin
4. Plotësoni: notën, pikët, numrin e certifikatës
5. Klikoni "Issue"

Studentët shohin certifikatën e tyre menjëherë.`,
  },

  /* ═══ ADMIN — PAYMENTS ═══ */
  {
    keywords: ['payments','pagesat','transaksione','invoice','fatura'],
    roles: ['admin'],
    answer: `Si të menaxhoni Pagesat dhe Faturat:
1. Klikoni "Payments" ose "Invoices" në menunë anësore
2. Shihni listën e transaksioneve
3. Filtroni sipas statusit (Pending, Paid, Refunded)
4. Klikoni transaksionin për detaje
5. Eksportoni fatura si PDF

Aktivizoni pagesat te Settings → Advanced → Payments.`,
  },

  /* ═══ ADMIN — LIVE SESSIONS ═══ */
  {
    keywords: ['admin live session','menaxho sesionet','te gjitha sesionet'],
    roles: ['admin'],
    answer: `Si të menaxhoni sesionet live si Admin:
1. Klikoni "Live Sessions" në menunë anësore
2. Shihni të gjitha sesionet e të gjithë mësuesve
3. Filtroni sipas statusit: Scheduled, Live, Ended
4. Mund të fshini ose anuloni sesione
5. Shihni rekordim të sesioneve të kaluara`,
  },

  /* ═══ SHARED — NAVIGATION ═══ */
  {
    keywords: ['sidebar','menu','navigim','ku ndodhet','ku eshte','hap menune'],
    answer: `Navigimi në platformë:
- Menuja anësore (sidebar) ndodhet majtas
- Klikoni ikonën ☰ (mobile) për ta hapur
- Mësuesi: ka seksione Main, Students, Learning, Interaction, Analytics
- Studenti: ka seksione Main, Learning, Progress, Extra, Compete, Interaction
- Admini: ka seksione Main, Users, Learning, Interaction, Analytics, Business, System

Klikoni çdo ikonë ose etiketë për të naviguar.`,
  },
  {
    keywords: ['logout','sign out','dal','dil','exit','mbyll llogarinë'],
    answer: `Si të dilni nga llogaria:
1. Shkoni te fundi i menusë anësore
2. Klikoni "Sign out" (ikona e daljes)
3. Ktheheni automatikisht te faqja e hyrjes`,
  },
  {
    keywords: ['login','hyrja','sign in','fjalëkalim','password','email hyrja'],
    answer: `Si të hyni në platformë:
1. Hapni faqen e platformës
2. Shkruani email-in tuaj
3. Shkruani fjalëkalimin
4. Klikoni "Sign In"
5. Nëse 2FA është aktiv, do të merrni kod me email

Nëse keni harruar fjalëkalimin, kontaktoni administratorin.`,
  },
  {
    keywords: ['notification','njoftim','notifications','bell','alarmet'],
    answer: `Njoftimet (Notifications):
- Ikona e ziles ndodhet lart djathtas (topbar)
- Klikoni të shihni njoftimet e fundit
- Llojet: Kurse të reja, Quiz të reja, Rezultate, Sesione live
- Njoftimet lexuar shënohen automatikisht si "Read"`,
  },
  {
    keywords: ['profile password','ndrysho fjalekalim','change password','fjalëkalim i ri'],
    answer: `Si të ndryshoni fjalëkalimin:
1. Shkoni te "Profile" ose "Security" nga menuja
2. Klikoni "Change Password"
3. Shkruani fjalëkalimin aktual
4. Shkruani fjalëkalimin e ri (2 herë)
5. Klikoni "Save"`,
  },

  /* ═══ SHARED — GENERAL PLATFORM ═══ */
  {
    keywords: ['what is this','cfare eshte','cfare ben','platform','quizmaster'],
    answer: `QuizMaster është platformë edukative me:
- Krijim kursesh dhe mësimesh me video/tekst
- Quiz dhe provime me vlerësim automatik
- Live Quiz me PIN dhe konkurrencë live
- Sesione video (klasa live) me Jitsi
- Komunitet dhe diskutime per cdo mesim
- Ndjekje e progresit dhe certifikata
- Tre role: Admin, Mësues dhe Student`,
  },
  {
    keywords: ['help','ndihme','nuk di','si','how','how to'],
    answer: `Jam këtu për t'ju ndihmuar! Pyetni mua:
- "Si të krijoni quiz?" / "How to create quiz?"
- "Si të bashkohem në Live Quiz?"
- "Ku janë rezultatet e mia?"
- "Si të shtoj student?"
- "Si të konfiguroj 2FA?"

Gjithashtu mund të klikoni çipat e sugjerimeve poshtë 👆`,
  },
];

/* ─────────────────────────────────────────────
   MATCHING ENGINE
───────────────────────────────────────────── */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ëê]/g, 'e')
    .replace(/[àáâã]/g, 'a')
    .replace(/[ç]/g, 'c')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getResponse(userText: string, role: Role, pathname: string): string {
  const q = normalize(userText);
  const words = q.split(' ');

  let bestEntry: KBEntry | null = null;
  let bestScore = 0;

  for (const entry of KB) {
    if (entry.roles && !entry.roles.includes(role)) continue;

    if (entry.pages) {
      const matchesPage = entry.pages.some((p) => pathname.includes(p));
      if (!matchesPage) continue;
    }

    let score = 0;
    for (const kw of entry.keywords) {
      const normalizedKw = normalize(kw);
      if (q.includes(normalizedKw)) {
        score += normalizedKw.split(' ').length * 3;
      } else {
        const kwWords = normalizedKw.split(' ');
        const matchedWords = kwWords.filter((w) => words.includes(w));
        score += matchedWords.length;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  if (bestEntry && bestScore >= 1) {
    return bestEntry.answer;
  }

  // Fallback
  const fallbacks: Record<Role, string> = {
    teacher: `Nuk gjeta përgjigje të saktë për: "${userText}"

Mund të pyesni për:
- Si të krijoni quiz, kurs ose mësim
- Si të filloni Live Quiz ose sesion video
- Si të menaxhoni studentët, prezencën ose certifikatat
- Si të shihni rezultatet dhe progresin

Provoni të reformuloni pyetjen ose klikoni një çip sugjerimi.`,
    student: `Nuk gjeta përgjigje të saktë për: "${userText}"

Mund të pyesni për:
- Si të bëni quiz ose të bashkoheni në Live Quiz
- Ku janë rezultatet ose certifikatat tuaja
- Si të dorëzoni një detyrë
- Si të bashkoheni në sesion live

Provoni të reformuloni pyetjen ose klikoni një çip sugjerimi.`,
    admin: `Nuk gjeta përgjigje të saktë për: "${userText}"

Mund të pyesni për:
- Si të shtoni studentë ose mësues
- Si të konfiguroni Settings ose Branding
- Si të menaxhoni rolet dhe lejet
- Si të shihni analitikën

Provoni të reformuloni pyetjen ose klikoni një çip sugjerimi.`,
  };

  return fallbacks[role];
}

/* ─────────────────────────────────────────────
   PAGE CONTEXT
───────────────────────────────────────────── */

function getPageLabel(pathname: string): string {
  const map: Record<string, string> = {
    '/teacher': 'Dashboard',
    '/teacher/courses': 'Kurset e Mia',
    '/teacher/modules': 'Modulet',
    '/teacher/lessons': 'Mësimet',
    '/teacher/quizzes': 'Quiz Builder',
    '/teacher/exams': 'Provime',
    '/teacher/students': 'Studentët e Mi',
    '/teacher/classes': 'Klasat',
    '/teacher/assignments': 'Detyrat',
    '/teacher/attendance': 'Prezenca',
    '/teacher/certificates': 'Certifikatat',
    '/teacher/live-quiz': 'Live Quiz',
    '/teacher/live-quiz/reports': 'Raporte Live Quiz',
    '/teacher/live-sessions': 'Sesionet Live',
    '/teacher/community': 'Community',
    '/teacher/announcements': 'Njoftime',
    '/teacher/progress': 'Progresi Studentëve',
    '/teacher/results': 'Rezultate Quiz',
    '/teacher/profile': 'Profili',
    '/student': 'Dashboard',
    '/student/courses': 'Kurset e Mia',
    '/student/continue': 'Vazhdo Mësimet',
    '/student/lessons': 'Mësimet',
    '/student/quizzes': 'Quiz-et',
    '/student/exams': 'Provimet',
    '/student/assignments': 'Detyrat',
    '/student/progress': 'Progresi Im',
    '/student/results': 'Rezultatet',
    '/student/certificates': 'Certifikatat',
    '/student/badges': 'Badget',
    '/student/live-quiz': 'Live Quiz',
    '/student/community': 'Community',
    '/student/live-classes': 'Klasat Live',
    '/student/live-sessions': 'Sesionet Live',
    '/student/profile': 'Profili',
    '/admin': 'Dashboard',
    '/admin/courses': 'Kurset',
    '/admin/modules': 'Modulet',
    '/admin/lessons': 'Mësimet',
    '/admin/quizzes': 'Quiz-et',
    '/admin/students': 'Studentët',
    '/admin/teachers': 'Mësuesit',
    '/admin/classes': 'Klasat',
    '/admin/assignments': 'Detyrat',
    '/admin/attendance': 'Prezenca',
    '/admin/certificates': 'Certifikatat',
    '/admin/live-sessions': 'Sesionet Live',
    '/admin/community': 'Community',
    '/admin/announcements': 'Njoftime',
    '/admin/analytics': 'Analitika',
    '/admin/reports': 'Raportet',
    '/admin/payments': 'Pagesat',
    '/admin/invoices': 'Faturat',
    '/admin/settings': 'Cilësimet',
    '/admin/branding': 'Branding',
    '/admin/roles': 'Rolet & Lejet',
    '/admin/profile': 'Profili',
    '/admin/security': 'Siguria',
  };
  if (map[pathname]) return map[pathname];
  for (const [k, v] of Object.entries(map)) {
    if (pathname.startsWith(k + '/')) return v;
  }
  return 'Platforma';
}

function getQuickChips(pathname: string, role: Role): string[] {
  if (role === 'teacher') {
    if (pathname.includes('/quizzes') || pathname.includes('/quiz')) return ['Si të krijoj quiz?', 'Si të shtoj pyetje?', 'Si të publikoj quiz?', 'Live quiz me PIN'];
    if (pathname.includes('/courses')) return ['Si të krijoj kurs?', 'Si të shtoj module?', 'Si të publikoj kursin?'];
    if (pathname.includes('/lessons')) return ['Si të krijoj mësim?', 'Llojet e mësimeve', 'Si të ngark video?'];
    if (pathname.includes('/live-quiz')) return ['Si të filloj Live Quiz?', 'Si të ndaj PIN-in?', 'Si të shoh rezultatet?'];
    if (pathname.includes('/live-sessions')) return ['Si të krijoj sesion live?', 'Si të ftoj studentë?', 'Si të regjistrojë sesionin?'];
    if (pathname.includes('/students')) return ['Si të shoh progresin?', 'Si të menaxhoj studentët?'];
    if (pathname.includes('/assignments')) return ['Si të krijoj detyrë?', 'Si t\'i notoj detyrat?'];
    if (pathname.includes('/attendance')) return ['Si të shënoj prezencën?', 'Llojet e prezencës'];
    if (pathname.includes('/community')) return ['Si t\'u përgjigjem pyetjeve?', 'Si të pinoj diskutime?'];
    return ['Si të krijoj quiz?', 'Si të filloj Live Quiz?', 'Si të shoh progresin?', 'Si të krijoj kurs?'];
  }
  if (role === 'student') {
    if (pathname.includes('/quizzes') || pathname.includes('/quiz')) return ['Si të bëj quiz?', 'Sa kohë kam?', 'Si dorëzoj quiz?', 'Ku janë rezultatet?'];
    if (pathname.includes('/live-quiz')) return ['Si të bashkohem?', 'Ku fut PIN-in?', 'Si shoh pikët?'];
    if (pathname.includes('/courses')) return ['Si të shoh kurset?', 'Si të vazhdoj mësimet?'];
    if (pathname.includes('/assignments')) return ['Si të dorëzoj detyrën?', 'Kur është afati?'];
    if (pathname.includes('/live-sessions')) return ['Si të bashkohem sesionin?', 'Si ngre dorën?'];
    if (pathname.includes('/results')) return ['Si shoh rezultatet?', 'Ku janë përgjigjet?'];
    if (pathname.includes('/community')) return ['Si të bëj pyetje?', 'Si votoj përgjigje?'];
    if (pathname.includes('/certificates')) return ['Si ta shkarkoj?', 'Çfarë tregon certifikata?'];
    return ['Si të bëj quiz?', 'Ku janë rezultatet?', 'Si bashkohem live quiz?', 'Si dorëzoj detyrë?'];
  }
  if (role === 'admin') {
    if (pathname.includes('/students')) return ['Si të shtoj student?', 'Si të çaktivizoj llogari?'];
    if (pathname.includes('/teachers')) return ['Si të shtoj mësues?', 'Si t\'i jap leje?'];
    if (pathname.includes('/settings')) return ['Si konfigurojë 2FA?', 'Si aktivizojë veçoritë?', 'Si konfiguroj email?'];
    if (pathname.includes('/branding')) return ['Si ndryshojna logon?', 'Si ndryshoj emrin?'];
    if (pathname.includes('/roles')) return ['Si krijoj rol?', 'Si caktoj leje?'];
    if (pathname.includes('/analytics')) return ['Si shoh statistikat?', 'Si eksportojë raportet?'];
    return ['Si të shtoj student?', 'Si konfigurojë 2FA?', 'Si aktivizojë veçoritë?', 'Si ndryshoj branding?'];
  }
  return ['Si mund të ndihmoj?'];
}

/* ─────────────────────────────────────────────
   THEME
───────────────────────────────────────────── */

const ROLE_THEME = {
  teacher: {
    bubble: 'from-violet-600 to-indigo-600',
    headerGrad: 'from-violet-900/80 to-indigo-900/80',
    chipBg: 'bg-violet-500/10',
    chipBorder: 'border-violet-500/20',
    chipText: 'text-violet-300 hover:text-violet-100',
    userBubble: 'bg-gradient-to-br from-violet-600 to-indigo-600',
    sendBtn: 'from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500',
    accent: 'text-violet-500',
    dotColor: 'bg-violet-400',
  },
  student: {
    bubble: 'from-emerald-600 to-teal-600',
    headerGrad: 'from-emerald-900/80 to-teal-900/80',
    chipBg: 'bg-emerald-500/10',
    chipBorder: 'border-emerald-500/20',
    chipText: 'text-emerald-300 hover:text-emerald-100',
    userBubble: 'bg-gradient-to-br from-emerald-600 to-teal-600',
    sendBtn: 'from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500',
    accent: 'text-emerald-500',
    dotColor: 'bg-emerald-400',
  },
  admin: {
    bubble: 'from-indigo-600 to-slate-600',
    headerGrad: 'from-indigo-900/80 to-slate-900/80',
    chipBg: 'bg-indigo-500/10',
    chipBorder: 'border-indigo-500/20',
    chipText: 'text-indigo-300 hover:text-indigo-100',
    userBubble: 'bg-gradient-to-br from-indigo-600 to-slate-700',
    sendBtn: 'from-indigo-600 to-slate-700 hover:from-indigo-500 hover:to-slate-600',
    accent: 'text-indigo-400',
    dotColor: 'bg-indigo-400',
  },
};

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

function TypingDots({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-1 py-1 px-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={cn('w-2 h-2 rounded-full animate-bounce', color)}
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.8s' }}
        />
      ))}
    </div>
  );
}

function FormattedMessage({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, '').trim());
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="space-y-1 mt-1 ml-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2 text-sm leading-relaxed">
              <span className="shrink-0 font-bold opacity-60">{idx + 1}.</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }
    if (/^[-•]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-•]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-•]\s/, '').trim());
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="space-y-0.5 mt-1 ml-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2 text-sm leading-relaxed">
              <span className="shrink-0 opacity-50 mt-1">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }
    if (line.trim()) {
      const isBold = line.endsWith(':') && line.length < 60;
      elements.push(
        <p key={`p-${i}`} className={cn('text-sm leading-relaxed', isBold && 'font-semibold text-white/90 mt-1')}>
          {line}
        </p>
      );
    }
    i++;
  }
  return <div className="space-y-1">{elements}</div>;
}

/* ─────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────── */

export default function AIChatbot({ userRole }: AIChatbotProps) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const location = useLocation();

  const theme = ROLE_THEME[userRole];
  const pageLabel = getPageLabel(location.pathname);
  const chips = getQuickChips(location.pathname, userRole);

  const greeting: Record<Role, string> = {
    teacher: `Mirë se vini! Jam asistenti juaj AI për QuizMaster.\n\nJu gjeni në faqen: ${pageLabel}\n\nMund t'ju ndihmoj me:\n- Krijim quiz-esh, kursesh dhe mësimesh\n- Live Quiz dhe Sesione Video\n- Menaxhim studentësh dhe rezultatesh\n\nÇfarë dëshironi të dini?`,
    student: `Përshëndetje! Jam asistenti juaj AI për QuizMaster.\n\nJu gjeni në faqen: ${pageLabel}\n\nMund t'ju ndihmoj me:\n- Bërjen e quiz-eve dhe detyrave\n- Bashkimin në sesione live\n- Shikimin e rezultateve dhe certifikatave\n\nSi mund t'ju ndihmoj?`,
    admin: `Mirë se vini! Jam asistenti juaj AI për QuizMaster.\n\nJu gjeni në faqen: ${pageLabel}\n\nMund t'ju ndihmoj me:\n- Menaxhim studentësh dhe mësuesish\n- Konfigurimi i Settings, Branding dhe Roleve\n- Analitika dhe Raportet\n\nÇfarë dëshironi të konfiguroni?`,
  };

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: 'assistant', content: greeting[userRole], timestamp: new Date() }]);
    }
  }, [open]);

  useEffect(() => {
    if (open && !minimized) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    }
  }, [messages, open, minimized]);

  useEffect(() => {
    if (open && !minimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, minimized]);

  // Reset when navigating to a new page
  useEffect(() => {
    if (messages.length > 0) {
      setMessages([]);
    }
  }, [location.pathname]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setMessages((prev) => [...prev, { role: 'user', content: trimmed, timestamp: new Date() }]);
    setInput('');
    setLoading(true);

    // Simulate slight delay for natural feel
    await new Promise((r) => setTimeout(r, 400));

    const reply = getResponse(trimmed, userRole, location.pathname);
    setMessages((prev) => [...prev, { role: 'assistant', content: reply, timestamp: new Date() }]);
    setLoading(false);
  }, [loading, userRole, location.pathname]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const resetChat = () => {
    setMessages([{ role: 'assistant', content: greeting[userRole], timestamp: new Date() }]);
    setInput('');
  };

  return (
    <>
      {/* Floating Bubble */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="AI Assistant"
          className={cn(
            'fixed bottom-6 right-6 z-[999] w-14 h-14 rounded-2xl',
            'flex items-center justify-center',
            'bg-gradient-to-br shadow-2xl',
            'transition-all duration-300 hover:scale-110 active:scale-95',
            theme.bubble
          )}
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.12)' }}
        >
          <MessageCircle className="w-6 h-6 text-white" />
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-slate-900 animate-pulse" />
        </button>
      )}

      {/* Chat Panel */}
      {open && (
        <div
          className="fixed bottom-6 right-6 z-[999] flex flex-col rounded-2xl overflow-hidden"
          style={{
            width: '370px',
            height: minimized ? 'auto' : '540px',
            background: 'linear-gradient(160deg,#090b12 0%,#0d1022 100%)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.07)',
          }}
        >
          {/* Accent line */}
          <div className={cn('h-0.5 bg-gradient-to-r from-transparent via-current to-transparent opacity-70', theme.accent)} />

          {/* Header */}
          <div className={cn('px-4 py-3 flex items-center justify-between shrink-0 bg-gradient-to-r', theme.headerGrad)}>
            <div className="flex items-center gap-2.5">
              <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-lg', theme.bubble)}>
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">AI Assistant</div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse inline-block" />
                  {pageLabel}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <button onClick={resetChat} title="Bisedë e re" className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/8 transition-all">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setMinimized((m) => !m)} title={minimized ? 'Zgjero' : 'Minimizo'} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/8 transition-all">
                <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-200', minimized && 'rotate-180')} />
              </button>
              <button onClick={() => { setOpen(false); setMinimized(false); }} title="Mbyll" className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/8 transition-all">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3 min-h-0 scrollbar-none">
                {messages.map((msg, idx) => (
                  <div key={idx} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    {msg.role === 'assistant' && (
                      <div className={cn('w-6 h-6 rounded-lg shrink-0 mt-0.5 flex items-center justify-center bg-gradient-to-br', theme.bubble)}>
                        <Sparkles className="w-3 h-3 text-white" />
                      </div>
                    )}
                    <div
                      className={cn(
                        'max-w-[84%] rounded-2xl px-3.5 py-2.5',
                        msg.role === 'user'
                          ? cn('text-white rounded-tr-sm text-sm', theme.userBubble)
                          : 'bg-white/[0.06] text-slate-200 rounded-tl-sm border border-white/[0.06]'
                      )}
                    >
                      {msg.role === 'assistant'
                        ? <FormattedMessage text={msg.content} />
                        : <p className="text-sm leading-relaxed">{msg.content}</p>
                      }
                      <div className="text-[9px] text-white/25 mt-1.5 text-right">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex gap-2 justify-start">
                    <div className={cn('w-6 h-6 rounded-lg shrink-0 mt-0.5 flex items-center justify-center bg-gradient-to-br', theme.bubble)}>
                      <Sparkles className="w-3 h-3 text-white" />
                    </div>
                    <div className="bg-white/[0.06] border border-white/[0.06] rounded-2xl rounded-tl-sm px-3.5 py-2">
                      <TypingDots color={theme.dotColor} />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick Chips */}
              {messages.length <= 1 && !loading && (
                <div className="px-3.5 pb-2.5 flex flex-wrap gap-1.5 shrink-0">
                  {chips.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => void sendMessage(chip)}
                      className={cn(
                        'text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-all',
                        theme.chipBg, theme.chipBorder, theme.chipText
                      )}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}

              {/* Input */}
              <div className="px-3 pb-3 pt-1.5 border-t border-white/[0.06] shrink-0">
                <div className="flex items-end gap-2 bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 focus-within:border-white/[0.18] transition-all">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Shkruani pyetjen tuaj..."
                    rows={1}
                    disabled={loading}
                    className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 resize-none focus:outline-none leading-relaxed max-h-24 scrollbar-none disabled:opacity-40"
                    style={{ minHeight: '22px' }}
                  />
                  <button
                    onClick={() => void sendMessage(input)}
                    disabled={!input.trim() || loading}
                    className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                      'bg-gradient-to-br shadow-lg transition-all active:scale-95',
                      'disabled:opacity-30 disabled:cursor-not-allowed',
                      theme.sendBtn
                    )}
                  >
                    {loading
                      ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                      : <Send className="w-3.5 h-3.5 text-white" />
                    }
                  </button>
                </div>
                <p className="text-[10px] text-slate-700 mt-1.5 text-center">Enter për dërgim · Shift+Enter rresht i ri</p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
