import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let supabaseAdminInstance: any = null;

const getSupabaseAdmin = () => {
  if (!supabaseAdminInstance) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in environment variables.');
    }

    supabaseAdminInstance = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  return supabaseAdminInstance;
};

// Proxy for supabaseAdmin
const supabaseAdmin = new Proxy({} as any, {
  get: (target, prop, receiver) => {
    const instance = getSupabaseAdmin();
    const value = Reflect.get(instance, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});

async function startServer() {
  const app = express();
  const parsedPort = Number(process.env.PORT);
  const preferredPort = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 5000;
  const preferredHost = process.env.HOST || "127.0.0.1";
  const hostCandidates = preferredHost === "127.0.0.1" ? [preferredHost] : [preferredHost, "127.0.0.1"];
  const maxPortAttempts = 10;
  const recoverableListenErrors = new Set(["EACCES", "EADDRINUSE"]);

  app.use(express.json());

  const COURSE_MUTABLE_KEYS = new Set([
    "teacher_id",
    "title",
    "description",
    "short_description",
    "language",
    "level",
    "price",
    "is_free",
    "status",
    "thumbnail",
    "student_ids",
    "total_lessons",
    "total_students",
    "certificate_enabled",
    "gradient",
    "category",
    "updated_at",
  ]);

  const sanitizeCoursePayload = (payload: any) => {
    const sanitized: Record<string, any> = {};
    if (!payload || typeof payload !== "object") return sanitized;

    Object.keys(payload).forEach((key) => {
      if (COURSE_MUTABLE_KEYS.has(key) && payload[key] !== undefined) {
        sanitized[key] = payload[key];
      }
    });

    return sanitized;
  };

  const normalizeTeacherId = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";

  const toFiniteNumber = (value: unknown, fallback = 0) => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const toAttemptPercent = (scoreValue: unknown, totalPointsValue: unknown) => {
    const score = toFiniteNumber(scoreValue, 0);
    const totalPoints = toFiniteNumber(totalPointsValue, 0);
    if (totalPoints > 0) return clamp(Math.round((score / totalPoints) * 100), 0, 100);
    if (score >= 0 && score <= 1) return clamp(Math.round(score * 100), 0, 100);
    return clamp(Math.round(score), 0, 100);
  };

  const isAttemptsTableMissing = (error: any) => {
    const haystack = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
    return (
      (error?.code === "PGRST205" && haystack.includes("public.attempts")) ||
      (error?.code === "42P01" && haystack.includes("attempts")) ||
      haystack.includes("could not find the table 'public.attempts'")
    );
  };

  const normalizeAttempts = (rows: any[], passingScoreByQuiz: Record<string, number> = {}) => {
    return (rows || []).map((row: any) => {
      const rawScore = toFiniteNumber(row?.score, 0);
      const totalPointsRaw = toFiniteNumber(row?.total_points, 0);
      const totalPoints = totalPointsRaw > 0 ? totalPointsRaw : 100;
      const scorePercent = toAttemptPercent(rawScore, totalPointsRaw);
      const score = totalPointsRaw > 0 ? rawScore : Math.round((scorePercent / 100) * totalPoints);
      const quizId = row?.quiz_id ? String(row.quiz_id) : "";
      const passingScore = passingScoreByQuiz[quizId] ?? 50;
      const passed = typeof row?.passed === "boolean" ? row.passed : scorePercent >= passingScore;
      return {
        ...row,
        id: row?.id ? String(row.id) : "",
        quiz_id: quizId,
        student_id: row?.student_id ? String(row.student_id) : "",
        score,
        total_points: totalPoints,
        score_percent: scorePercent,
        passed,
        status: row?.status || ((row?.completed_at || row?.created_at) ? "completed" : "in_progress"),
        started_at: row?.started_at || row?.created_at || null,
        completed_at: row?.completed_at || row?.created_at || row?.started_at || null,
        created_at: row?.created_at || row?.completed_at || row?.started_at || null,
      };
    });
  };

  const fetchAllAttemptRows = async () => {
    const legacy = await supabaseAdmin.from("attempts").select("*");
    if (!legacy.error) return legacy.data || [];
    if (!isAttemptsTableMissing(legacy.error)) throw legacy.error;

    const modern = await supabaseAdmin.from("quiz_attempts").select("*");
    if (modern.error) throw modern.error;
    return modern.data || [];
  };

  const getTeacherIdCandidates = async (teacherId: string) => {
    const candidates = new Set<string>();
    if (teacherId) candidates.add(teacherId);

    const { data: teacherRows, error: teacherLookupError } = await supabaseAdmin
      .from("teachers")
      .select("id, user_id")
      .or(`id.eq.${teacherId},user_id.eq.${teacherId}`)
      .limit(2);

    if (teacherLookupError) throw teacherLookupError;

    (teacherRows || []).forEach((row: any) => {
      if (row?.id) candidates.add(String(row.id));
      if (row?.user_id) candidates.add(String(row.user_id));
    });

    return [...candidates];
  };

  // API routes FIRST
  app.get("/api/health", async (req, res) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    let supabaseStatus = 'unknown';
    let supabaseError = null;

    if (supabaseUrl && supabaseServiceKey) {
      try {
        const { error } = await supabaseAdmin.from('profiles').select('count').limit(1);
        if (error) {
          supabaseStatus = 'error';
          supabaseError = error.message;
        } else {
          supabaseStatus = 'connected';
        }
      } catch (err: any) {
        supabaseStatus = 'failed';
        supabaseError = err.message;
      }
    }

    res.json({ 
      status: "ok",
      config: {
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!supabaseServiceKey,
        urlPrefix: supabaseUrl ? supabaseUrl.substring(0, 15) + '...' : null
      },
      supabase: {
        status: supabaseStatus,
        error: supabaseError
      }
    });
  });

  // Route to fetch all students (bypasses RLS using service role)
  app.get("/api/admin/students", async (req, res) => {
    try {
      const [profilesRes, teachersRes, coursesRes] = await Promise.all([
        supabaseAdmin.from('profiles').select('*').eq('role', 'student'),
        supabaseAdmin.from('teachers').select('user_id, first_name, last_name'),
        supabaseAdmin.from('courses').select('id, student_ids, teacher_id'),
      ]);

      if (profilesRes.error) throw profilesRes.error;

      const teacherMap: Record<string, string> = {};
      const teacherOptions: { id: string; name: string }[] = [];
      (teachersRes.data || []).forEach((t: any) => {
        const name = `${t.first_name} ${t.last_name}`.trim();
        teacherMap[t.user_id] = name;
        teacherOptions.push({ id: t.user_id, name });
      });

      const enrolledCountMap: Record<string, number> = {};
      (coursesRes.data || []).forEach((c: any) => {
        (c.student_ids || []).forEach((sid: string) => {
          enrolledCountMap[sid] = (enrolledCountMap[sid] || 0) + 1;
        });
      });

      const students = (profilesRes.data || []).map((p: any) => ({
        uid: p.id,
        email: p.email,
        displayName: p.display_name,
        role: p.role,
        teacherId: p.teacher_id,
        status: p.status || 'active',
        createdAt: p.created_at,
        teacherName: p.teacher_id ? (teacherMap[p.teacher_id] || '—') : '—',
        enrolledCourseCount: enrolledCountMap[p.id] || 0,
      }));

      res.json({ success: true, students, teacherOptions });
    } catch (error: any) {
      console.error('Error fetching students:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Route to fetch all teachers (bypasses RLS using service role)
  app.get("/api/admin/teachers", async (req, res) => {
    try {
      const [profilesRes, teachersRes] = await Promise.all([
        supabaseAdmin.from("profiles").select("*").eq("role", "teacher"),
        supabaseAdmin.from("teachers").select("id, user_id"),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (teachersRes.error) throw teachersRes.error;

      const teacherIdByUserId: Record<string, string> = {};
      (teachersRes.data || []).forEach((t: any) => {
        if (t?.user_id && t?.id) {
          teacherIdByUserId[t.user_id] = t.id;
        }
      });

      const teachers = (profilesRes.data || []).map((p: any) => ({
        uid: p.id,
        teacherId: teacherIdByUserId[p.id] || null,
        email: p.email,
        displayName: p.display_name,
        role: p.role,
        status: p.status || 'active',
        createdAt: p.created_at,
      }));
      res.json({ success: true, teachers });
    } catch (error: any) {
      console.error('Error fetching teachers:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Route to seed the initial admin account
  app.get("/api/admin/seed", async (req, res) => {
    const adminEmail = "liridon.salihi123@gmail.com";
    const adminPassword = "Admin123!";
    
    try {
      // 1. Check if profiles table exists
      const { error: tableCheckError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .limit(1);
      
      if (tableCheckError && tableCheckError.code === 'PGRST116') {
        // This is fine, it just means the table is empty
      } else if (tableCheckError && tableCheckError.message.includes('does not exist')) {
        return res.status(400).send(`
          <h1>Database Table Missing</h1>
          <p>The <b>profiles</b> table does not exist in your Supabase database.</p>
          <p>Please go to your Supabase SQL Editor and run the SQL script provided in the chat to create the tables.</p>
        `);
      }

      // 2. Create or find user in Supabase Auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { displayName: 'Super Admin', role: 'admin' }
      });

      let userId = authData.user?.id;

      // If creation failed, try to find the user by email
      if (!userId) {
        const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (!listError) {
          const existingUser = usersData.users.find(u => u.email === adminEmail);
          if (existingUser) {
            userId = existingUser.id;
            
            // Update password to ensure it matches Admin123!
            await supabaseAdmin.auth.admin.updateUserById(userId, {
              password: adminPassword,
              user_metadata: { displayName: 'Super Admin', role: 'admin' }
            });
          }
        }
      }

      if (!userId) {
        // If we still don't have a userId, throw the original creation error if it exists
        if (authError) throw authError;
        throw new Error("Could not find or create user in Supabase Auth.");
      }

      // 4. Create profile in public.profiles table
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: userId,
          email: adminEmail,
          display_name: 'Super Admin',
          role: 'admin',
          status: 'active',
          created_at: new Date().toISOString()
        });

      if (profileError) throw profileError;

      // 5. Also create a teacher record for the admin
      await supabaseAdmin
        .from('teachers')
        .upsert({
          user_id: userId,
          first_name: 'Super',
          last_name: 'Admin',
          email: adminEmail,
          specialization: 'System Administration',
          status: 'active'
        });

      res.send(`
        <h1>Success!</h1>
        <p>Admin account seeded successfully.</p>
        <ul>
          <li><b>Email:</b> ${adminEmail}</li>
          <li><b>Password:</b> ${adminPassword}</li>
        </ul>
        <p><a href="/">Go to Login</a></p>
      `);
    } catch (error: any) {
      console.error('Error seeding admin:', error);
      res.status(500).send(`
        <h1>Seed Failed</h1>
        <p>Error: ${error.message}</p>
        <p>Please check your Supabase URL and Service Role Key in the Secrets menu.</p>
      `);
    }
  });

  // Route to create a course (bypasses RLS using service role)
  app.post("/api/admin/create-course", async (req, res) => {
    try {
      const requestedTeacherId = normalizeTeacherId(req.body.teacher_id);
      if (!requestedTeacherId) {
        return res.status(400).json({ error: "teacher_id is required." });
      }

      const teacherIdCandidates = await getTeacherIdCandidates(requestedTeacherId);
      if (teacherIdCandidates.length === 0) {
        return res.status(400).json({ error: "Selected teacher was not found." });
      }

      const baseSlug = (req.body.title || 'course')
        .toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const slug = `${baseSlug}-${Date.now()}`;
      const payloadBase = {
        ...sanitizeCoursePayload(req.body),
        slug,
        created_at: new Date().toISOString(),
      };

      let createdCourse: any = null;
      let lastForeignKeyError: any = null;

      for (const teacherId of teacherIdCandidates) {
        const payload = { ...payloadBase, teacher_id: teacherId };
        const { data, error } = await supabaseAdmin.from("courses").insert(payload).select().single();
        if (!error) {
          createdCourse = data;
          break;
        }

        const isTeacherFkError =
          error.code === "23503" &&
          typeof error.message === "string" &&
          error.message.includes("courses_teacher_id_fkey");

        if (!isTeacherFkError) {
          throw error;
        }

        lastForeignKeyError = error;
      }

      if (!createdCourse) {
        if (lastForeignKeyError) {
          return res.status(400).json({
            error: "Selected teacher is invalid for courses. Please re-select a teacher and try again.",
          });
        }
        throw new Error("Could not create course for the selected teacher.");
      }

      res.json({ success: true, course: createdCourse });
    } catch (error: any) {
      console.error('Error creating course:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Route to update a course (bypasses RLS using service role)
  app.patch("/api/admin/update-course/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = sanitizeCoursePayload(req.body);

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid course fields provided for update." });
      }

      if (Object.prototype.hasOwnProperty.call(updates, "teacher_id")) {
        const requestedTeacherId = normalizeTeacherId(updates.teacher_id);
        if (!requestedTeacherId) {
          return res.status(400).json({ error: "teacher_id cannot be empty." });
        }

        const teacherIdCandidates = await getTeacherIdCandidates(requestedTeacherId);
        if (teacherIdCandidates.length === 0) {
          return res.status(400).json({ error: "Selected teacher was not found." });
        }

        let updatedCourse: any = null;
        let lastForeignKeyError: any = null;

        for (const teacherId of teacherIdCandidates) {
          const candidateUpdates = { ...updates, teacher_id: teacherId };
          const { data, error } = await supabaseAdmin
            .from("courses")
            .update(candidateUpdates)
            .eq("id", id)
            .select()
            .single();

          if (!error) {
            updatedCourse = data;
            break;
          }

          const isTeacherFkError =
            error.code === "23503" &&
            typeof error.message === "string" &&
            error.message.includes("courses_teacher_id_fkey");

          if (!isTeacherFkError) {
            throw error;
          }

          lastForeignKeyError = error;
        }

        if (!updatedCourse) {
          if (lastForeignKeyError) {
            return res.status(400).json({
              error: "Selected teacher is invalid for courses. Please re-select a teacher and try again.",
            });
          }
          throw new Error("Could not update course teacher.");
        }

        return res.json({ success: true, course: updatedCourse });
      }

      const { data, error } = await supabaseAdmin
        .from("courses")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      res.json({ success: true, course: data });
    } catch (error: any) {
      console.error('Error updating course:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Route to create a teacher (Admin only)
  app.post("/api/admin/create-teacher", async (req, res) => {
    const { name, email, password, phone, specialization } = req.body;
    
    try {
      // 1. Create or find user in Supabase Auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { displayName: name, role: 'teacher' }
      });

      let userId = authData.user?.id;

      if (!userId) {
        const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (!listError) {
          const existingUser = usersData.users.find(u => u.email === email);
          if (existingUser) {
            userId = existingUser.id;
            // Update metadata to ensure role is teacher
            await supabaseAdmin.auth.admin.updateUserById(userId, {
              user_metadata: { displayName: name, role: 'teacher' }
            });
          }
        }
      }

      if (!userId) {
        if (authError) throw authError;
        throw new Error("Could not find or create user in Supabase Auth.");
      }

      // 2. Create profile in public.profiles table
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: userId,
          email,
          display_name: name,
          role: 'teacher',
          status: 'active',
          created_at: new Date().toISOString()
        });

      if (profileError) throw profileError;

      // 3. Create teacher record
      const names = name.split(' ');
      const firstName = names[0];
      const lastName = names.slice(1).join(' ') || 'Teacher';

      const teacherPayload: any = {
        user_id: userId,
        first_name: firstName,
        last_name: lastName,
        email: email,
        status: 'active',
      };
      if (phone) teacherPayload.phone = phone;
      if (specialization) teacherPayload.specialization = specialization;

      const { error: teacherError } = await supabaseAdmin
        .from('teachers')
        .upsert(teacherPayload);

      if (teacherError) throw teacherError;

      res.json({ success: true, uid: userId });
    } catch (error: any) {
      console.error('Error creating teacher:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Route to create a student
  app.post("/api/admin/create-student", async (req, res) => {
    const {
      name, email, password, teacherId,
      phone, dateOfBirth, gender, preferredLanguage, currentLevel, notes
    } = req.body;
    
    try {
      // Resolve teacher ID — prefer the verified JWT identity over the body value
      const authHeader = req.headers.authorization as string | undefined;
      const token = authHeader?.replace('Bearer ', '');
      let resolvedTeacherId: string | undefined = teacherId;
      if (token) {
        const { data: { user: callerUser } } = await supabaseAdmin.auth.getUser(token);
        if (callerUser?.id) resolvedTeacherId = callerUser.id;
      }
      if (!resolvedTeacherId) throw new Error('Could not determine teacher identity.');

      // 1. Create or find user in Supabase Auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { displayName: name, role: 'student' }
      });

      let userId = authData.user?.id;

      if (!userId) {
        const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (!listError) {
          const existingUser = usersData.users.find((u: any) => u.email === email);
          if (existingUser) {
            userId = existingUser.id;
            await supabaseAdmin.auth.admin.updateUserById(userId, {
              user_metadata: { displayName: name, role: 'student' }
            });
          }
        }
      }

      if (!userId) {
        if (authError) throw authError;
        throw new Error("Could not find or create user in Supabase Auth.");
      }

      // 2. Upsert profile — insert if new, update all key fields if the row already exists
      // (Supabase Auth may auto-create a bare profile row via trigger; the update ensures
      //  teacher_id and role are always written correctly.)
      const profilePayload = {
        id: userId,
        email,
        display_name: name,
        role: 'student',
        teacher_id: resolvedTeacherId,
        status: 'active',
      };

      const { error: upsertError } = await supabaseAdmin
        .from('profiles')
        .upsert(profilePayload, { onConflict: 'id' });

      // If the upsert silently skipped (e.g. existing row with different owner), force an update
      if (!upsertError) {
        await supabaseAdmin
          .from('profiles')
          .update({ teacher_id: resolvedTeacherId, role: 'student', display_name: name, status: 'active', email })
          .eq('id', userId);
      } else {
        throw upsertError;
      }

      // 3. Create student record with all available fields
      const names = name.trim().split(' ');
      const firstName = names[0];
      const lastName = names.slice(1).join(' ') || '';

      const studentPayload: any = {
        user_id: userId,
        first_name: firstName,
        last_name: lastName,
        email: email,
        status: 'active',
        joined_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (phone) studentPayload.phone = phone;
      if (dateOfBirth) studentPayload.date_of_birth = dateOfBirth;
      if (gender) studentPayload.gender = gender;
      if (preferredLanguage) studentPayload.preferred_language = preferredLanguage;
      if (currentLevel) studentPayload.current_level = currentLevel;

      const { error: studentError } = await supabaseAdmin
        .from('students')
        .upsert(studentPayload);

      if (studentError) throw studentError;

      res.json({ success: true, uid: userId });
    } catch (error: any) {
      console.error('Error creating student:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Courses list (for dropdowns)
  app.get('/api/admin/courses-list', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from('courses').select('id, title').order('title');
      if (error) throw error;
      res.json({ success: true, courses: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── ANALYTICS ──────────────────────────────────────────────
  app.get('/api/admin/analytics', async (req, res) => {
    try {
      const [profilesRes, coursesRes, quizzesRes, certsRes, assignmentsRes, lessonsRes, attendanceRes] = await Promise.all([
        supabaseAdmin.from('profiles').select('id, role, created_at, status'),
        supabaseAdmin.from('courses').select('id, category, status, created_at, total_students, level'),
        supabaseAdmin.from('quizzes').select('id, title, created_at, published'),
        supabaseAdmin.from('certificates').select('id, status, created_at'),
        supabaseAdmin.from('assignments').select('id, status, created_at'),
        supabaseAdmin.from('lessons').select('id, created_at, type'),
        supabaseAdmin.from('attendance').select('id, status, date'),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (coursesRes.error) throw coursesRes.error;
      if (quizzesRes.error) throw quizzesRes.error;
      if (certsRes.error) throw certsRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;
      if (lessonsRes.error) throw lessonsRes.error;
      if (attendanceRes.error) throw attendanceRes.error;

      const profiles = profilesRes.data || [];
      const courses = coursesRes.data || [];
      const quizzes = quizzesRes.data || [];
      const certs = certsRes.data || [];
      const assignments = assignmentsRes.data || [];
      const lessons = lessonsRes.data || [];
      const attendance = attendanceRes.data || [];

      const attempts = normalizeAttempts(await fetchAllAttemptRows());

      const completedAttempts = attempts.filter(a => a.status === 'completed');
      const passedAttempts = completedAttempts.filter(a => a.passed);
      const passRate = completedAttempts.length > 0 ? Math.round((passedAttempts.length / completedAttempts.length) * 100) : 0;
      const avgScore = completedAttempts.length > 0
        ? Math.round(completedAttempts.reduce((sum, a) => sum + a.score_percent, 0) / completedAttempts.length)
        : 0;

      // Last 30 days trend
      const now = new Date();
      const days30: string[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        days30.push(d.toISOString().slice(0, 10));
      }

      const signupMap: Record<string, number> = Object.fromEntries(days30.map(d => [d, 0]));
      profiles.filter(p => p.role === 'student').forEach(p => {
        const day = (p.created_at || '').slice(0, 10);
        if (signupMap[day] !== undefined) signupMap[day]++;
      });

      const attemptsMap: Record<string, number> = Object.fromEntries(days30.map(d => [d, 0]));
      attempts.forEach(a => {
        const day = (a.started_at || '').slice(0, 10);
        if (attemptsMap[day] !== undefined) attemptsMap[day]++;
      });

      const trend = days30.map(date => ({
        date: date.slice(5), // MM-DD
        signups: signupMap[date],
        attempts: attemptsMap[date],
      }));

      // Course by category
      const catMap: Record<string, number> = {};
      courses.forEach(c => { catMap[c.category || 'Other'] = (catMap[c.category || 'Other'] || 0) + 1; });
      const courseByCategory = Object.entries(catMap).map(([name, value]) => ({ name, value }));

      // Course by level
      const lvlMap: Record<string, number> = {};
      courses.forEach(c => { lvlMap[c.level || 'beginner'] = (lvlMap[c.level || 'beginner'] || 0) + 1; });
      const courseByLevel = Object.entries(lvlMap).map(([name, value]) => ({ name, value }));

      // Score distribution
      const buckets: Record<string, number> = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
      completedAttempts.forEach(a => {
        const pct = a.score_percent;
        if (pct <= 20) buckets['0-20']++;
        else if (pct <= 40) buckets['21-40']++;
        else if (pct <= 60) buckets['41-60']++;
        else if (pct <= 80) buckets['61-80']++;
        else buckets['81-100']++;
      });
      const scoreDistribution = Object.entries(buckets).map(([range, count]) => ({ range, count }));

      // Attendance rate
      const presentCount = attendance.filter(a => a.status === 'present').length;
      const attendanceRate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;

      res.json({
        success: true,
        overview: {
          totalStudents: profiles.filter(p => p.role === 'student').length,
          activeStudents: profiles.filter(p => p.role === 'student' && p.status === 'active').length,
          totalTeachers: profiles.filter(p => p.role === 'teacher').length,
          totalCourses: courses.length,
          publishedCourses: courses.filter(c => c.status === 'published').length,
          totalQuizzes: quizzes.length,
          publishedQuizzes: quizzes.filter(q => q.published).length,
          totalAttempts: attempts.length,
          completedAttempts: completedAttempts.length,
          totalCertificates: certs.filter(c => c.status === 'issued').length,
          totalLessons: lessons.length,
          totalAssignments: assignments.length,
          passRate,
          avgScore,
          attendanceRate,
          totalAttendance: attendance.length,
        },
        trend,
        courseByCategory,
        courseByLevel,
        scoreDistribution,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── REPORTS ─────────────────────────────────────────────────
  app.get('/api/admin/reports/students', async (req, res) => {
    try {
      const [studentsRes, certsRes, enrollmentsRes] = await Promise.all([
        supabaseAdmin.from('profiles').select('id, display_name, email, status, created_at').eq('role', 'student'),
        supabaseAdmin.from('certificates').select('student_id, status'),
        supabaseAdmin.from('courses').select('id, student_ids'),
      ]);

      if (studentsRes.error) throw studentsRes.error;
      if (certsRes.error) throw certsRes.error;
      if (enrollmentsRes.error) throw enrollmentsRes.error;

      const students = studentsRes.data || [];
      const attempts = normalizeAttempts(await fetchAllAttemptRows());
      const certs = certsRes.data || [];
      const courses = enrollmentsRes.data || [];

      const enrollmentMap: Record<string, number> = {};
      courses.forEach((c: any) => {
        (c.student_ids || []).forEach((sid: string) => {
          enrollmentMap[sid] = (enrollmentMap[sid] || 0) + 1;
        });
      });

      const report = students.map(s => {
        const myAttempts = attempts.filter(a => a.student_id === s.id && a.status === 'completed');
        const avgScore = myAttempts.length > 0
          ? Math.round(myAttempts.reduce((sum, a) => sum + a.score_percent, 0) / myAttempts.length)
          : null;
        return {
          id: s.id,
          name: s.display_name,
          email: s.email,
          status: s.status,
          joinedAt: s.created_at,
          enrolledCourses: enrollmentMap[s.id] || 0,
          totalAttempts: attempts.filter(a => a.student_id === s.id).length,
          completedQuizzes: myAttempts.length,
          avgScore,
          certificates: certs.filter(c => c.student_id === s.id && c.status === 'issued').length,
        };
      });

      res.json({ success: true, report });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/admin/reports/courses', async (req, res) => {
    try {
      const [coursesRes, certsRes, lessonsRes] = await Promise.all([
        supabaseAdmin.from('courses').select('id, title, category, level, status, created_at, total_students, teacher_id, student_ids'),
        supabaseAdmin.from('certificates').select('course_id, status'),
        supabaseAdmin.from('lessons').select('course_id'),
      ]);

      if (coursesRes.error) throw coursesRes.error;
      if (certsRes.error) throw certsRes.error;
      if (lessonsRes.error) throw lessonsRes.error;

      const courses = coursesRes.data || [];
      const certs = certsRes.data || [];
      const lessonsList = lessonsRes.data || [];

      const report = courses.map(c => ({
        id: c.id,
        title: c.title,
        category: c.category || 'Other',
        level: c.level || 'beginner',
        status: c.status,
        createdAt: c.created_at,
        enrolledStudents: (c.student_ids || []).length,
        totalLessons: lessonsList.filter((l: any) => l.course_id === c.id).length,
        certificatesIssued: certs.filter((cert: any) => cert.course_id === c.id && cert.status === 'issued').length,
      }));

      res.json({ success: true, report });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/admin/reports/quizzes', async (req, res) => {
    try {
      const { data: quizzesData, error: quizzesError } = await supabaseAdmin
        .from('quizzes')
        .select('*');
      if (quizzesError) throw quizzesError;

      const quizzes = quizzesData || [];
      const passingScoreByQuiz = quizzes.reduce((acc: Record<string, number>, q: any) => {
        const value = Number(q?.settings?.passingScore ?? q?.passing_score ?? q?.pass_mark ?? q?.passMark);
        acc[q.id] = Number.isFinite(value) ? value : 50;
        return acc;
      }, {});
      const attempts = normalizeAttempts(await fetchAllAttemptRows(), passingScoreByQuiz);

      const report = quizzes.map(q => {
        const myAttempts = attempts.filter(a => a.quiz_id === q.id);
        const completed = myAttempts.filter(a => a.status === 'completed');
        const passed = completed.filter(a => a.passed);
        const avgScore = completed.length > 0
          ? Math.round(completed.reduce((sum, a) => sum + a.score_percent, 0) / completed.length)
          : null;
        const uniqueStudents = new Set(myAttempts.map(a => a.student_id)).size;
        return {
          id: q.id,
          title: q.title,
          published: q.published,
          createdAt: q.created_at,
          passingScore: Number(q?.settings?.passingScore ?? q?.passing_score ?? q?.pass_mark ?? q?.passMark) || 50,
          totalAttempts: myAttempts.length,
          completedAttempts: completed.length,
          passedAttempts: passed.length,
          passRate: completed.length > 0 ? Math.round((passed.length / completed.length) * 100) : null,
          avgScore,
          uniqueStudents,
        };
      });

      res.json({ success: true, report });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── LIVE SESSION RECORDING UPLOAD ──────────────────────────
  app.post('/api/admin/live-sessions/:id/upload-url', async (req, res) => {
    try {
      const { id } = req.params;
      const filename = `session-${id}-${Date.now()}.webm`;
      const storagePath = `recordings/${filename}`;
      // Create bucket if it doesn't exist
      await supabaseAdmin.storage.createBucket('recordings', { public: true }).catch(() => {});
      const { data, error } = await supabaseAdmin.storage.from('recordings').createSignedUploadUrl(storagePath);
      if (error) throw error;
      const { data: { publicUrl } } = supabaseAdmin.storage.from('recordings').getPublicUrl(storagePath);
      res.json({ success: true, signedUrl: data.signedUrl, publicUrl });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Single session fetch
  app.get('/api/admin/live-sessions/:id', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('live_sessions')
        .select('*, host:profiles!host_id(id,display_name,email), course:courses!course_id(id,title)')
        .eq('id', req.params.id)
        .single();
      if (error) throw error;
      res.json({ success: true, session: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── LIVE SESSIONS ──────────────────────────────────────────
  app.get('/api/admin/live-sessions', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('live_sessions')
        .select('*, host:profiles!host_id(id,display_name,email), course:courses!course_id(id,title)')
        .order('scheduled_at', { ascending: false });
      if (error) throw error;
      res.json({ success: true, sessions: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/admin/live-sessions', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('live_sessions').insert({ ...req.body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single();
      if (error) throw error;
      res.json({ success: true, session: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch('/api/admin/live-sessions/:id', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('live_sessions').update({ ...req.body, updated_at: new Date().toISOString() }).eq('id', req.params.id).select().single();
      if (error) throw error;
      res.json({ success: true, session: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/admin/live-sessions/:id', async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from('live_sessions').delete().eq('id', req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── COMMUNITY POSTS ─────────────────────────────────────────
  app.get('/api/admin/community', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('community_posts')
        .select('*, author:profiles!author_id(id,display_name,email)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ success: true, posts: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/admin/community', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('community_posts').insert({ ...req.body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single();
      if (error) throw error;
      res.json({ success: true, post: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch('/api/admin/community/:id', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('community_posts').update({ ...req.body, updated_at: new Date().toISOString() }).eq('id', req.params.id).select().single();
      if (error) throw error;
      res.json({ success: true, post: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/admin/community/:id', async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from('community_posts').delete().eq('id', req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── ANNOUNCEMENTS ────────────────────────────────────────────
  app.get('/api/admin/announcements', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('announcements')
        .select('*, author:profiles!author_id(id,display_name,email)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ success: true, announcements: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/admin/announcements', async (req, res) => {
    try {
      const payload = {
        ...req.body,
        published_at: req.body.status === 'published' ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabaseAdmin.from('announcements').insert(payload).select().single();
      if (error) throw error;
      res.json({ success: true, announcement: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch('/api/admin/announcements/:id', async (req, res) => {
    try {
      const payload = {
        ...req.body,
        updated_at: new Date().toISOString(),
        ...(req.body.status === 'published' ? { published_at: new Date().toISOString() } : {}),
      };
      const { data, error } = await supabaseAdmin.from('announcements').update(payload).eq('id', req.params.id).select().single();
      if (error) throw error;
      res.json({ success: true, announcement: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/admin/announcements/:id', async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from('announcements').delete().eq('id', req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const tryListen = (port: number, host: string) =>
    new Promise<void>((resolve, reject) => {
      const server = app.listen(port, host, () => {
        const displayHost = host === "0.0.0.0" ? "localhost" : host;
        console.log(`Server running on http://${displayHost}:${port}`);
        resolve();
      });
      server.once("error", (error) => reject(error));
    });

  let lastRecoverableError: NodeJS.ErrnoException | null = null;

  for (let portOffset = 0; portOffset < maxPortAttempts; portOffset++) {
    const portToTry = preferredPort + portOffset;

    for (const hostToTry of hostCandidates) {
      try {
        await tryListen(portToTry, hostToTry);
        return;
      } catch (error) {
        const listenError = error as NodeJS.ErrnoException;
        if (!listenError.code || !recoverableListenErrors.has(listenError.code)) {
          throw listenError;
        }

        lastRecoverableError = listenError;
        const triedFinalCandidate =
          portOffset === maxPortAttempts - 1 &&
          hostToTry === hostCandidates[hostCandidates.length - 1];

        if (!triedFinalCandidate) {
          console.warn(
            `Could not bind to ${hostToTry}:${portToTry} (${listenError.code}). Trying another address...`,
          );
        }
      }
    }
  }

  throw new Error(
    `Unable to start server after trying ports ${preferredPort}-${preferredPort + maxPortAttempts - 1}. Last error: ${lastRecoverableError?.code ?? "unknown"}`,
  );
}

startServer();
