export interface TourStep {
  title: string;
  description: string;
  icon: string;
  tip?: string;
  navigateTo?: string;
  actionLabel?: string;
}

export interface Tour {
  id: string;
  title: string;
  subtitle: string;
  color: string;
  gradient: string;
  steps: TourStep[];
}

export const TOURS: Record<string, Tour> = {
  create_course: {
    id: 'create_course',
    title: 'Create a Course',
    subtitle: 'Step-by-step guide to building your first course',
    color: 'indigo',
    gradient: 'from-indigo-500 to-violet-600',
    steps: [
      {
        title: 'Go to Courses',
        description: 'From the sidebar, click on "Courses" under your role menu. This is where all your courses are managed.',
        icon: '📚',
        navigateTo: '/teacher/courses',
        actionLabel: 'Open Courses',
        tip: 'Both teachers and admins can manage courses from their respective dashboards.',
      },
      {
        title: 'Click "New Course"',
        description: 'Look for the "+ New Course" button in the top-right corner of the Courses page. Click it to open the course creation form.',
        icon: '➕',
        tip: 'You can also duplicate an existing course to save time.',
      },
      {
        title: 'Fill in Course Details',
        description: 'Enter the course title, description, language, and level (Beginner / Intermediate / Advanced). Add a short description that students will see in listings.',
        icon: '✏️',
        tip: 'A good description helps students decide if the course is right for them.',
      },
      {
        title: 'Set Pricing & Thumbnail',
        description: 'Choose whether the course is free or paid. Upload a thumbnail image or select a gradient color to make it visually appealing.',
        icon: '🖼️',
        tip: 'Courses with thumbnails get more engagement.',
      },
      {
        title: 'Assign a Teacher',
        description: 'If you are an admin, select the teacher responsible for this course from the dropdown. Teachers can manage and edit the course content.',
        icon: '👨‍🏫',
        tip: 'A course must have a teacher assigned to be publishable.',
      },
      {
        title: 'Save & Publish',
        description: 'Click "Save as Draft" to save your progress, or "Publish" to make the course visible to students immediately.',
        icon: '🚀',
        tip: 'You can always unpublish a course later if you need to make edits.',
      },
    ],
  },

  create_quiz: {
    id: 'create_quiz',
    title: 'Create a Quiz',
    subtitle: 'Build interactive quizzes with multiple question types',
    color: 'violet',
    gradient: 'from-violet-500 to-purple-600',
    steps: [
      {
        title: 'Open Quiz Management',
        description: 'From the sidebar, click "Quizzes" under the Teacher menu. This shows all your existing quizzes.',
        icon: '📝',
        navigateTo: '/teacher/quizzes',
        actionLabel: 'Open Quizzes',
        tip: 'Quizzes are linked to courses and modules for organized learning.',
      },
      {
        title: 'Click "New Quiz"',
        description: 'Press the "+ New Quiz" button. You will be taken to the Quiz Builder where you can design your quiz from scratch.',
        icon: '➕',
        tip: 'You can create unlimited quizzes per course.',
      },
      {
        title: 'Name & Link to Course',
        description: 'Give your quiz a clear title and optionally link it to a specific course or lesson. This helps students find it in the right context.',
        icon: '🔗',
        tip: 'A descriptive title like "Chapter 3 Review" helps students know what to expect.',
      },
      {
        title: 'Add Questions',
        description: 'Click "+ Add Question" to start adding questions. Choose from: Multiple Choice, True/False, Short Answer, Long Answer, or File Upload.',
        icon: '❓',
        tip: 'Mix different question types to create more engaging assessments.',
      },
      {
        title: 'Set Correct Answers & Points',
        description: 'For each question, mark the correct answer and assign a point value. You can also add an explanation that shows after the student answers.',
        icon: '✅',
        tip: 'Explanations help students learn from their mistakes.',
      },
      {
        title: 'Configure Quiz Settings',
        description: 'Set a time limit, passing score, maximum attempts, and whether to shuffle questions or show correct answers after completion.',
        icon: '⚙️',
        tip: 'Setting a passing score enables automatic pass/fail grading.',
      },
      {
        title: 'Publish the Quiz',
        description: 'When ready, toggle the quiz to "Published". Students will now be able to see and take the quiz from their dashboard.',
        icon: '🚀',
        tip: 'Unpublished quizzes are invisible to students — perfect for drafting!',
      },
    ],
  },

  create_module: {
    id: 'create_module',
    title: 'Create a Module',
    subtitle: 'Organize course content into structured modules',
    color: 'emerald',
    gradient: 'from-emerald-500 to-teal-600',
    steps: [
      {
        title: 'Go to Modules',
        description: 'Click "Modules" in the sidebar under the Teacher menu. Modules are sections within a course — like chapters in a book.',
        icon: '📦',
        navigateTo: '/teacher/modules',
        actionLabel: 'Open Modules',
        tip: 'A well-structured course typically has 5–10 modules.',
      },
      {
        title: 'Click "+ New Module"',
        description: 'Press the New Module button to open the module creation form. You will select which course this module belongs to.',
        icon: '➕',
        tip: 'Modules are always associated with a specific course.',
      },
      {
        title: 'Select a Course',
        description: 'From the dropdown, pick the course this module belongs to. If no courses appear, make sure you have created at least one course first.',
        icon: '📚',
        tip: 'You must have at least one course before creating modules.',
      },
      {
        title: 'Name & Describe the Module',
        description: 'Enter a clear module title and optional description. For example: "Unit 1: Introduction to Algebra" or "Week 3: Advanced Grammar".',
        icon: '✏️',
        tip: 'Clear module names help students navigate the course content easily.',
      },
      {
        title: 'Set Order & Status',
        description: 'Assign an order number to control where the module appears in the course. Set status to "Published" to make it visible to students.',
        icon: '🔢',
        tip: 'You can reorder modules later using the drag handles.',
      },
      {
        title: 'Save the Module',
        description: 'Click "Save" to create the module. You can then add lessons to it from the Lessons page.',
        icon: '💾',
        tip: 'After saving, head to Lessons to fill this module with content.',
      },
    ],
  },

  create_lesson: {
    id: 'create_lesson',
    title: 'Create a Lesson',
    subtitle: 'Add video, text, or quiz lessons to your modules',
    color: 'amber',
    gradient: 'from-amber-500 to-orange-500',
    steps: [
      {
        title: 'Go to Lessons',
        description: 'Click "Lessons" in the sidebar. This page shows all lessons across your courses, organized by module.',
        icon: '🎓',
        navigateTo: '/teacher/lessons',
        actionLabel: 'Open Lessons',
        tip: 'Lessons are the actual learning content inside modules.',
      },
      {
        title: 'Click "+ New Lesson"',
        description: 'Press the New Lesson button to open the lesson creation form.',
        icon: '➕',
        tip: 'You can create video lessons, text lessons, or quiz lessons.',
      },
      {
        title: 'Select Course & Module',
        description: 'Pick which course and module this lesson belongs to. The module must be created first.',
        icon: '📦',
        tip: 'A lesson without a module will still work, but modules help organize content.',
      },
      {
        title: 'Choose Lesson Type',
        description: 'Select the lesson type: Video (paste a YouTube or video URL), Text (rich written content), or Quiz (links to a quiz).',
        icon: '🎬',
        tip: 'Video lessons tend to have the highest student engagement.',
      },
      {
        title: 'Add Content & Details',
        description: 'Fill in the lesson title, description, and content. For video lessons, paste the video URL. Set the estimated duration in minutes.',
        icon: '✏️',
        tip: 'Keep lessons focused — 10–15 minutes is the ideal length.',
      },
      {
        title: 'Toggle Free Preview',
        description: 'Enable "Free Preview" to let students preview this lesson before enrolling. Great for showcasing your teaching style.',
        icon: '👁️',
        tip: 'Setting the first lesson as a free preview boosts course enrollment.',
      },
      {
        title: 'Publish the Lesson',
        description: 'Set status to "Published" and click Save. Students in the course can now access this lesson.',
        icon: '🚀',
        tip: 'Draft lessons are only visible to you.',
      },
    ],
  },

  add_student: {
    id: 'add_student',
    title: 'Add a Student',
    subtitle: 'Create and manage student accounts on the platform',
    color: 'rose',
    gradient: 'from-rose-500 to-pink-600',
    steps: [
      {
        title: 'Go to Students',
        description: 'Click "Students" in the sidebar. Admins see all students platform-wide; teachers see their assigned students.',
        icon: '👨‍🎓',
        navigateTo: '/admin/students',
        actionLabel: 'Open Students',
        tip: 'Students are created by admins and then assigned to teachers.',
      },
      {
        title: 'Click "Add Student"',
        description: 'Press the "+ Add Student" button to open the new student form.',
        icon: '➕',
        tip: 'You can also bulk-import students via CSV — contact support for this feature.',
      },
      {
        title: 'Enter Personal Info',
        description: 'Fill in the student\'s full name, email address, and a secure password. The student will use these credentials to log in.',
        icon: '👤',
        tip: 'Use a naming convention like firstname.lastname@school.com for consistency.',
      },
      {
        title: 'Assign to a Teacher',
        description: 'Select which teacher this student belongs to. This controls which teacher can see and manage this student.',
        icon: '👨‍🏫',
        tip: 'A student can only be assigned to one teacher at a time.',
      },
      {
        title: 'Add Optional Details',
        description: 'Optionally fill in: phone number, date of birth, gender, preferred language, and current level.',
        icon: '📋',
        tip: 'These details help personalize the learning experience.',
      },
      {
        title: 'Create the Account',
        description: 'Click "Create Student" to finalize. The student will receive login credentials and can immediately access the platform.',
        icon: '✅',
        tip: 'Share the login details securely with the student.',
      },
    ],
  },

  create_class: {
    id: 'create_class',
    title: 'Create a Class',
    subtitle: 'Group students into classes for organized learning',
    color: 'blue',
    gradient: 'from-blue-500 to-cyan-500',
    steps: [
      {
        title: 'Go to Classes',
        description: 'Click "Classes" in the Admin sidebar. Classes are groups of students assigned to a teacher for a specific course.',
        icon: '🏫',
        navigateTo: '/admin/classes',
        actionLabel: 'Open Classes',
        tip: 'Classes help you organize large numbers of students efficiently.',
      },
      {
        title: 'Click "New Class"',
        description: 'Press the "+ New Class" button to open the class creation form.',
        icon: '➕',
        tip: 'You can create multiple classes for the same course.',
      },
      {
        title: 'Name the Class',
        description: 'Give the class a clear name, such as "Math 101 – Morning Group" or "English B2 – Spring 2025".',
        icon: '✏️',
        tip: 'Include the course name and time/group in the class name for clarity.',
      },
      {
        title: 'Link to Course & Teacher',
        description: 'Select the course this class is for and assign a teacher. The teacher will manage this class\'s students and content.',
        icon: '🔗',
        tip: 'Only published courses appear in the dropdown.',
      },
      {
        title: 'Set Dates & Capacity',
        description: 'Set start and end dates for the class and the maximum number of students (capacity).',
        icon: '📅',
        tip: 'Setting capacity helps prevent overcrowding in live sessions.',
      },
      {
        title: 'Save the Class',
        description: 'Click "Create Class" to save. You can then add students to the class and start scheduling live sessions.',
        icon: '🎉',
        tip: 'After creating the class, use Live Sessions to schedule virtual meetings.',
      },
    ],
  },

  live_session: {
    id: 'live_session',
    title: 'Start a Live Session',
    subtitle: 'Host virtual classrooms with video and chat',
    color: 'teal',
    gradient: 'from-teal-500 to-emerald-600',
    steps: [
      {
        title: 'Go to Live Sessions',
        description: 'Click "Live Sessions" in the Teacher sidebar. Here you can see upcoming, live, and past sessions.',
        icon: '📹',
        navigateTo: '/teacher/live-sessions',
        actionLabel: 'Open Live Sessions',
        tip: 'Students receive notifications when a live session is scheduled.',
      },
      {
        title: 'Click "New Session"',
        description: 'Press "+ New Session" to create a new live class. Fill in the session title, description, and scheduled time.',
        icon: '➕',
        tip: 'Schedule sessions in advance so students can prepare.',
      },
      {
        title: 'Invite Participants',
        description: 'Search for students by name or select a whole class to invite. Invited participants get a notification.',
        icon: '👥',
        tip: 'You can invite individual students or an entire class at once.',
      },
      {
        title: 'Start the Session',
        description: 'When it\'s time, click "Start" on the session card. This launches the virtual classroom with video, audio, and screen sharing.',
        icon: '▶️',
        tip: 'Test your microphone and camera before starting.',
      },
      {
        title: 'Use Classroom Features',
        description: 'During the session: mute/unmute, share your screen, use the chat, raise hands, and react with emojis. Students can do the same.',
        icon: '🎤',
        tip: 'Use screen sharing to show presentations or live demonstrations.',
      },
      {
        title: 'End & Review',
        description: 'Click "End Session" when done. Recordings (if enabled) are automatically saved and available for students to replay.',
        icon: '⏹️',
        tip: 'Session recordings help students who missed the live class.',
      },
    ],
  },
};

export const TOUR_KEYWORDS: { keywords: string[]; tourId: string }[] = [
  { keywords: ['create course', 'new course', 'add course', 'make course', 'build course', 'kurs', 'kursit'], tourId: 'create_course' },
  { keywords: ['create quiz', 'new quiz', 'add quiz', 'make quiz', 'build quiz', 'kuiz', 'quiz'], tourId: 'create_quiz' },
  { keywords: ['create module', 'new module', 'add module', 'modul'], tourId: 'create_module' },
  { keywords: ['create lesson', 'new lesson', 'add lesson', 'mesim', 'ligjeratë', 'leksion'], tourId: 'create_lesson' },
  { keywords: ['add student', 'new student', 'create student', 'student account', 'student', 'nxënës'], tourId: 'add_student' },
  { keywords: ['create class', 'new class', 'add class', 'klasë', 'klas'], tourId: 'create_class' },
  { keywords: ['live session', 'live class', 'virtual class', 'start session', 'video class', 'sesion', 'live'], tourId: 'live_session' },
];

export function detectTourFromMessage(message: string): string | null {
  const lower = message.toLowerCase();
  for (const { keywords, tourId } of TOUR_KEYWORDS) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return tourId;
    }
  }
  return null;
}
