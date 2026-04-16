import "dotenv/config";
import express, { Request, Response } from "express";
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

function addDaysToYmd(ymd: string, days: number): string {
  const parts = ymd.split("-").map((x) => parseInt(x, 10));
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  const [y, m, day] = parts;
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function paymentStatusToInvoiceRowStatus(
  paymentStatus: string,
): "paid" | "pending" | "draft" {
  if (paymentStatus === "completed") return "paid";
  if (paymentStatus === "pending") return "pending";
  return "draft";
}

function resolveInvoiceDisplayStatus(
  dbStatus: string,
  dueYmd: string,
): "paid" | "pending" | "overdue" | "draft" {
  if (dbStatus === "draft") return "draft";
  if (dbStatus === "paid") return "paid";
  const due = new Date(`${dueYmd}T12:00:00Z`);
  const today = new Date();
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const tDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (dueDay < tDay) return "overdue";
  return "pending";
}

async function nextInvoiceNumberForPaymentDate(paymentDateYmd: string): Promise<string> {
  const yStr = (paymentDateYmd || "").slice(0, 4);
  const year =
    yStr.length === 4 && /^\d{4}$/.test(yStr) ? parseInt(yStr, 10) : new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select("invoice_number")
    .like("invoice_number", `${prefix}%`);
  if (error) throw error;
  let maxSeq = 0;
  const re = new RegExp(`^INV-${year}-(\\d+)$`);
  for (const row of data || []) {
    const m = String((row as any).invoice_number || "").match(re);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

async function startServer() {
  const app = express();
  const parsedPort = Number(process.env.PORT);
  const preferredPort = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 5000;
  const preferredHost = process.env.HOST || "0.0.0.0";
  const hostCandidates = preferredHost === "0.0.0.0" ? [preferredHost] : [preferredHost, "0.0.0.0"];
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

  /** Missing-column errors from Postgres/PostgREST; retry with a narrower select. */
  const isRecoverableSchemaColumnError = (error: any) => {
    if (!error) return false;
    if (error.code === "42703") return true;
    const hay = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
    return hay.includes("does not exist") && hay.includes("column");
  };

  /** Older DBs may omit columns referenced in the select list. */
  const fetchCertificatesSelectWithFallback = async (selects: string[]): Promise<any[]> => {
    for (const sel of selects) {
      const res = await supabaseAdmin.from("certificates").select(sel as any);
      if (!res.error) return res.data || [];
      if (!isRecoverableSchemaColumnError(res.error)) throw res.error;
    }
    return [];
  };

  /** Analytics needs quiz counts only; avoid depending on `quizzes.published`. */
  const loadQuizzesRowsForAnalytics = async (): Promise<any[]> => {
    const selects = [
      "id, title, created_at",
      "id, created_at",
      "id",
      "*",
    ];
    for (const sel of selects) {
      const res = await supabaseAdmin.from("quizzes").select(sel as any);
      if (!res.error) return res.data || [];
      if (!isRecoverableSchemaColumnError(res.error)) throw res.error;
    }
    return [];
  };

  const loadCertificateRowsForReports = async (): Promise<
    Array<{ student_id: string | null; course_id: string | null; status: string }>
  > => {
    const rows = await fetchCertificatesSelectWithFallback([
      "student_id, course_id, status",
      "student_id, course_id",
      "student_id, status",
      "course_id, status",
      "student_id",
      "course_id",
      "*",
    ]);
    return rows.map((c: any) => ({
      student_id: c.student_id != null ? String(c.student_id) : null,
      course_id: c.course_id != null ? String(c.course_id) : null,
      status: c.status != null && String(c.status) !== "" ? String(c.status) : "issued",
    }));
  };

  const getTeacherIdCandidates = async (teacherId: string) => {
    const candidates = new Set<string>();
    if (teacherId) candidates.add(teacherId);

    const { data: teacherRows, error: teacherLookupError } = await supabaseAdmin
      .from("teachers")
      .select("id, user_id")
      .or(`id.eq.${teacherId},user_id.eq.${teacherId}`)
      .limit(20);

    if (teacherLookupError) throw teacherLookupError;

    (teacherRows || []).forEach((row: any) => {
      if (row?.id) candidates.add(String(row.id));
      if (row?.user_id) candidates.add(String(row.user_id));
    });

    return [...candidates];
  };

  const CONFIG_SECTIONS = new Set(["settings", "branding", "domain", "roles"]);

  const getConfigSection = async (section: string) => {
    const res = await supabaseAdmin
      .from("platform_config")
      .select("section, value, updated_at")
      .eq("section", section)
      .maybeSingle();
    if (res.error) throw res.error;
    return res.data?.value ?? null;
  };

  const upsertConfigSection = async (section: string, value: unknown) => {
    const res = await supabaseAdmin
      .from("platform_config")
      .upsert({ section, value, updated_at: new Date().toISOString() }, { onConflict: "section" })
      .select("section, value, updated_at")
      .single();
    if (res.error) throw res.error;
    return res.data;
  };

  const isPlatformConfigMissing = (error: any) => {
    const hay = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
    return error?.code === "42P01" || (error?.code === "PGRST205" && hay.includes("platform_config"));
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

  app.get("/api/admin/config/:section", async (req, res) => {
    try {
      const section = String(req.params.section || "").trim();
      if (!CONFIG_SECTIONS.has(section)) {
        return res.status(400).json({ error: "Unsupported config section" });
      }
      const value = await getConfigSection(section);
      res.json({ success: true, section, value });
    } catch (e: any) {
      if (isPlatformConfigMissing(e)) {
        return res.status(400).json({
          error: "platform_config table is missing. Please run the updated database_setup.sql script.",
        });
      }
      res.status(500).json({ error: e.message || "Failed to load config" });
    }
  });

  app.put("/api/admin/config/:section", async (req, res) => {
    try {
      const section = String(req.params.section || "").trim();
      if (!CONFIG_SECTIONS.has(section)) {
        return res.status(400).json({ error: "Unsupported config section" });
      }
      const value = req.body?.value;
      if (value === undefined) {
        return res.status(400).json({ error: "value is required" });
      }
      const data = await upsertConfigSection(section, value);
      res.json({ success: true, config: data });
    } catch (e: any) {
      if (isPlatformConfigMissing(e)) {
        return res.status(400).json({
          error: "platform_config table is missing. Please run the updated database_setup.sql script.",
        });
      }
      res.status(500).json({ error: e.message || "Failed to save config" });
    }
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
    // Teacher courses (service-role query to avoid RLS/ID-mapping mismatches)
  app.get('/api/teacher/courses', async (req, res) => {
    try {
      const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
      if (!userId) return res.status(400).json({ error: 'userId is required' });

      const teacherIds = await getTeacherIdCandidates(userId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [userId];

      const { data, error } = await supabaseAdmin
        .from('courses')
        .select('*')
        .in('teacher_id', scopedIds)
        .order('created_at', { ascending: false });

      if (error) throw error;
      res.json({ success: true, courses: data || [] });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Teacher quizzes (service role) — same scoping as courses; avoids PostgREST 400s when RLS/schema differ.
  const teacherQuizzesGetHandler = async (req: Request, res: Response) => {
    try {
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!userId) return res.status(400).json({ error: "userId is required" });

      const teacherIds = await getTeacherIdCandidates(userId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [userId];

      let { data, error } = await supabaseAdmin
        .from("quizzes")
        .select("*")
        .in("teacher_id", scopedIds)
        .order("created_at", { ascending: false });
      if (error) {
        const retry = await supabaseAdmin.from("quizzes").select("*").in("teacher_id", scopedIds);
        if (retry.error) throw error;
        data = retry.data;
        error = null;
      }
      if (error) throw error;
      const rows = data || [];
      rows.sort((a: any, b: any) => {
        const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
      res.json({ success: true, quizzes: rows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  };
  app.get("/api/teacher/quizzes", teacherQuizzesGetHandler);
  app.get("/api/teacher/quizzes/", teacherQuizzesGetHandler);

  // Teacher modules (service role) — same scoping as POST /api/teacher/modules so rows always
  // show after create even when RLS differs between environments.
  app.get("/api/teacher/modules", async (req, res) => {
    try {
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!userId) return res.status(400).json({ error: "userId is required" });

      const teacherIds = await getTeacherIdCandidates(userId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [userId];

      const { data: courseRows, error: coursesError } = await supabaseAdmin
        .from("courses")
        .select("id")
        .in("teacher_id", scopedIds);
      if (coursesError) throw coursesError;

      const courseIds = (courseRows || []).map((c: any) => c?.id).filter(Boolean);
      if (courseIds.length === 0) {
        return res.json({ success: true, modules: [] });
      }

      const { data, error } = await supabaseAdmin.from("modules").select("*").in("course_id", courseIds);
      if (error) throw error;

      const rows = data || [];
      rows.sort((a: any, b: any) => (Number(a?.order) || 0) - (Number(b?.order) || 0));
      res.json({ success: true, modules: rows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  const teacherCourseDeleteHandler = async (req: any, res: any) => {
    try {
      const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
      if (!id) return res.status(400).json({ error: "Course id is required" });
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!userId) return res.status(400).json({ error: "userId is required" });

      const teacherIds = await getTeacherIdCandidates(userId);
      const scopedArr = teacherIds.length > 0 ? teacherIds : [userId];

      const { data: deleted, error: delError } = await supabaseAdmin
        .from("courses")
        .delete()
        .eq("id", id)
        .in("teacher_id", scopedArr)
        .select("id");

      if (delError) {
        if (delError.code === "23503") {
          return res.status(409).json({
            error:
              "This course cannot be deleted because other data still references it. Remove linked quizzes, classes, or enrollments first.",
          });
        }
        throw delError;
      }
      if (!deleted || deleted.length === 0) {
        return res.status(404).json({
          error:
            "Course not found or you do not have permission to delete it. Use the app URL printed when you run npm run dev (Express + API on the same port).",
        });
      }
      res.json({ success: true });
    } catch (e: any) {
      console.error("/api/teacher/courses delete", e);
      res.status(500).json({ error: e.message });
    }
  };

  app.delete("/api/teacher/courses/:id", teacherCourseDeleteHandler);
  app.post("/api/teacher/courses/:id/delete", teacherCourseDeleteHandler);

  const assertTeacherOwnsCourse = async (userId: string, courseId: string) => {
    const teacherIds = await getTeacherIdCandidates(userId);
    const scoped = new Set((teacherIds.length > 0 ? teacherIds : [userId]).map((x) => String(x)));
    const { data: course, error } = await supabaseAdmin
      .from("courses")
      .select("id, teacher_id")
      .eq("id", courseId)
      .maybeSingle();
    if (error) throw error;
    if (!course) return { ok: false as const, reason: "not_found" as const };
    if (!scoped.has(String(course.teacher_id ?? ""))) {
      return { ok: false as const, reason: "forbidden" as const };
    }
    return { ok: true as const, course };
  };

  app.post("/api/teacher/modules", async (req, res) => {
    try {
      const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
      if (!userId) return res.status(400).json({ error: "userId is required" });
      const course_id = req.body?.course_id;
      const title = req.body?.title;
      if (!course_id || typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ error: "course_id and title are required" });
      }

      const gate = await assertTeacherOwnsCourse(userId, String(course_id));
      if (!gate.ok) {
        return res.status(422).json({
          error:
            gate.reason === "not_found"
              ? "Course not found (check that this course exists in Supabase and matches your account)."
              : "You do not have access to this course.",
          code: gate.reason,
        });
      }

      const slugIn =
        typeof req.body.slug === "string" && req.body.slug.trim() ? req.body.slug.trim() : String(title)
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .trim();
      const description =
        req.body.description === null || req.body.description === undefined || req.body.description === ""
          ? null
          : String(req.body.description);
      const order = Number(req.body.order) || 1;
      const status =
        req.body.status === "inactive" || req.body.status === "active" ? req.body.status : "active";

      const insertRow: Record<string, unknown> = {
        course_id: String(course_id),
        title: title.trim(),
        slug: slugIn || null,
        description,
        status,
      };
      insertRow["order"] = order;

      const { data, error } = await supabaseAdmin.from("modules").insert(insertRow).select().single();
      if (error) {
        console.error("POST /api/teacher/modules insert", error);
        const msg = [error.message, error.details, error.hint].filter((x) => typeof x === "string" && x).join(" — ") || error.code || "Database error";
        return res.status(400).json({ error: msg, code: error.code });
      }
      res.json({ success: true, module: data });
    } catch (e: any) {
      console.error("POST /api/teacher/modules", e);
      const msg =
        typeof e?.message === "string" && e.message
          ? e.message
          : String(e?.details || e || "Server error");
      res.status(500).json({ error: msg });
    }
  });

  app.patch("/api/teacher/modules/:id", async (req, res) => {
    try {
      const moduleId = typeof req.params.id === "string" ? req.params.id.trim() : "";
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!moduleId) return res.status(400).json({ error: "Module id is required" });
      if (!userId) return res.status(400).json({ error: "userId is required" });

      const { data: mod, error: mErr } = await supabaseAdmin
        .from("modules")
        .select("id, course_id")
        .eq("id", moduleId)
        .maybeSingle();
      if (mErr) throw mErr;
      if (!mod) return res.status(404).json({ error: "Module not found." });

      const gate = await assertTeacherOwnsCourse(userId, String(mod.course_id));
      if (!gate.ok) {
        return res.status(403).json({ error: "You do not have access to this module." });
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof req.body.title === "string") updates.title = req.body.title.trim();
      if (req.body.description !== undefined) {
        updates.description =
          req.body.description === null || req.body.description === "" ? null : String(req.body.description);
      }
      if (typeof req.body.slug === "string") updates.slug = req.body.slug.trim() || null;
      if (req.body.order !== undefined) updates["order"] = Number(req.body.order) || 1;
      if (req.body.status === "active" || req.body.status === "inactive") updates.status = req.body.status;
      if (typeof req.body.course_id === "string") {
        const cg = await assertTeacherOwnsCourse(userId, req.body.course_id);
        if (!cg.ok) return res.status(403).json({ error: "Invalid course for this module." });
        updates.course_id = req.body.course_id;
      }

      const { data, error } = await supabaseAdmin.from("modules").update(updates).eq("id", moduleId).select().single();
      if (error) throw error;
      res.json({ success: true, module: data });
    } catch (e: any) {
      console.error("PATCH /api/teacher/modules/:id", e);
      res.status(500).json({ error: e.message });
    }
  });

  const teacherModuleDeleteHandler = async (req: any, res: any) => {
    try {
      const moduleId = typeof req.params.id === "string" ? req.params.id.trim() : "";
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!moduleId) return res.status(400).json({ error: "Module id is required" });
      if (!userId) return res.status(400).json({ error: "userId is required" });

      const { data: mod, error: mErr } = await supabaseAdmin
        .from("modules")
        .select("id, course_id")
        .eq("id", moduleId)
        .maybeSingle();
      if (mErr) throw mErr;
      if (!mod) return res.status(404).json({ error: "Module not found." });

      const gate = await assertTeacherOwnsCourse(userId, String(mod.course_id));
      if (!gate.ok) {
        return res.status(403).json({ error: "You do not have access to this module." });
      }

      const { error: dErr } = await supabaseAdmin.from("modules").delete().eq("id", moduleId);
      if (dErr) throw dErr;
      res.json({ success: true });
    } catch (e: any) {
      console.error("DELETE /api/teacher/modules/:id", e);
      res.status(500).json({ error: e.message });
    }
  };

  app.delete("/api/teacher/modules/:id", teacherModuleDeleteHandler);
  app.post("/api/teacher/modules/:id/delete", teacherModuleDeleteHandler);

  // ── Teacher Lesson routes (service-role, bypasses RLS) ──────────────────
  app.get("/api/teacher/lessons", async (req, res) => {
    try {
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!userId) return res.status(400).json({ error: "userId is required" });

      const teacherIds = await getTeacherIdCandidates(userId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [userId];

      const { data: courseRows, error: coursesError } = await supabaseAdmin
        .from("courses").select("id").in("teacher_id", scopedIds);
      if (coursesError) throw coursesError;

      const courseIds = (courseRows || []).map((c: any) => c?.id).filter(Boolean);
      if (courseIds.length === 0) return res.json({ success: true, lessons: [] });

      const { data, error } = await supabaseAdmin
        .from("lessons").select("*").in("course_id", courseIds).order("order", { ascending: true });
      if (error) throw error;
      res.json({ success: true, lessons: data || [] });
    } catch (e: any) {
      console.error("GET /api/teacher/lessons", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  });

  app.post("/api/teacher/lessons", async (req, res) => {
    try {
      const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
      if (!userId) return res.status(400).json({ error: "userId is required" });
      const { course_id, module_id, title, slug, short_description, type, duration_minutes, order, status, is_free_preview } = req.body;
      if (!course_id || !module_id || typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ error: "course_id, module_id and title are required" });
      }
      const gate = await assertTeacherOwnsCourse(userId, String(course_id));
      if (!gate.ok) return res.status(403).json({ error: "You do not have access to this course." });

      const payload: Record<string, unknown> = {
        course_id: String(course_id),
        module_id: String(module_id),
        title: title.trim(),
        slug: typeof slug === "string" && slug.trim() ? slug.trim() : title.trim().toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-"),
        short_description: short_description || null,
        type: type || "video",
        duration_minutes: Number(duration_minutes) || 0,
        order: Number(order) || 1,
        status: status || "published",
        is_free_preview: Boolean(is_free_preview),
      };

      const { data, error } = await supabaseAdmin.from("lessons").insert(payload).select().single();
      if (error) {
        const msg = [error.message, error.details, error.hint].filter(Boolean).join(" — ") || error.code || "Database error";
        return res.status(400).json({ error: msg, code: error.code });
      }
      res.json({ success: true, lesson: data });
    } catch (e: any) {
      console.error("POST /api/teacher/lessons", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  });

  app.patch("/api/teacher/lessons/:id", async (req, res) => {
    try {
      const lessonId = typeof req.params.id === "string" ? req.params.id.trim() : "";
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!lessonId) return res.status(400).json({ error: "Lesson id is required" });
      if (!userId) return res.status(400).json({ error: "userId is required" });

      const { data: lesson, error: lErr } = await supabaseAdmin
        .from("lessons").select("id, course_id").eq("id", lessonId).maybeSingle();
      if (lErr) throw lErr;
      if (!lesson) return res.status(404).json({ error: "Lesson not found." });

      const gate = await assertTeacherOwnsCourse(userId, String(lesson.course_id));
      if (!gate.ok) return res.status(403).json({ error: "You do not have access to this lesson." });

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof req.body.title === "string") updates.title = req.body.title.trim();
      if (req.body.slug !== undefined) updates.slug = req.body.slug || null;
      if (req.body.short_description !== undefined) updates.short_description = req.body.short_description || null;
      if (req.body.type !== undefined) updates.type = req.body.type;
      if (req.body.duration_minutes !== undefined) updates.duration_minutes = Number(req.body.duration_minutes) || 0;
      if (req.body.order !== undefined) updates.order = Number(req.body.order) || 1;
      if (req.body.status !== undefined) updates.status = req.body.status;
      if (req.body.is_free_preview !== undefined) updates.is_free_preview = Boolean(req.body.is_free_preview);
      if (req.body.module_id !== undefined) updates.module_id = req.body.module_id;
      if (req.body.course_id !== undefined) {
        const cg = await assertTeacherOwnsCourse(userId, req.body.course_id);
        if (!cg.ok) return res.status(403).json({ error: "Invalid course for this lesson." });
        updates.course_id = req.body.course_id;
      }

      const { data, error } = await supabaseAdmin.from("lessons").update(updates).eq("id", lessonId).select().single();
      if (error) {
        const msg = [error.message, error.details, error.hint].filter(Boolean).join(" — ") || error.code || "Database error";
        return res.status(400).json({ error: msg, code: error.code });
      }
      res.json({ success: true, lesson: data });
    } catch (e: any) {
      console.error("PATCH /api/teacher/lessons/:id", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  });

  const teacherLessonDeleteHandler = async (req: any, res: any) => {
    try {
      const lessonId = typeof req.params.id === "string" ? req.params.id.trim() : "";
      const userId = typeof (req.query.userId ?? req.body?.userId) === "string"
        ? String(req.query.userId ?? req.body?.userId).trim() : "";
      if (!lessonId) return res.status(400).json({ error: "Lesson id is required" });
      if (!userId) return res.status(400).json({ error: "userId is required" });

      const { data: lesson, error: lErr } = await supabaseAdmin
        .from("lessons").select("id, course_id").eq("id", lessonId).maybeSingle();
      if (lErr) throw lErr;
      if (!lesson) return res.status(404).json({ error: "Lesson not found." });

      const gate = await assertTeacherOwnsCourse(userId, String(lesson.course_id));
      if (!gate.ok) return res.status(403).json({ error: "You do not have access to this lesson." });

      const { error } = await supabaseAdmin.from("lessons").delete().eq("id", lessonId);
      if (error) throw error;
      res.json({ success: true });
    } catch (e: any) {
      console.error("DELETE /api/teacher/lessons/:id", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  };

  app.delete("/api/teacher/lessons/:id", teacherLessonDeleteHandler);
  app.post("/api/teacher/lessons/:id/delete", teacherLessonDeleteHandler);

  app.get('/api/admin/analytics', async (req, res) => {
    try {
      const certsPromise = (async () => {
        const certRows = await fetchCertificatesSelectWithFallback([
          "id, status, created_at",
          "id, status",
          "id, created_at",
          "id",
        ]);
        return {
          data: certRows.map((c: any) => ({
            id: c.id,
            status: c.status ?? "issued",
            created_at: c.created_at ?? null,
          })),
          error: null,
        } as any;
      })();
      const classesPromise = (async () => {
        const selects = [
          'id, status, created_at, student_ids, capacity',
          'id, created_at, student_ids, capacity',
          'id, created_at, student_ids',
          'id, created_at',
        ];
        for (const sel of selects) {
          const res = await supabaseAdmin.from('classes').select(sel as any);
          if (!res.error) {
            return {
              data: (res.data || []).map((c: any) => ({
                id: c.id,
                status: c.status ?? 'active',
                created_at: c.created_at ?? null,
                student_ids: Array.isArray(c.student_ids) ? c.student_ids : [],
                capacity: typeof c.capacity === 'number' ? c.capacity : 0,
              })),
              error: null,
            } as any;
          }
          // Missing column in older schema; retry with a narrower select.
          if (res.error.code !== '42703') return res as any;
        }
        return { data: [], error: null } as any;
      })();
      const quizzesPromise = (async () => ({
        data: await loadQuizzesRowsForAnalytics(),
        error: null,
      }))();

      const [profilesRes, coursesRes, classesRes, quizzesRes, certsRes, assignmentsRes, lessonsRes, attendanceRes] = await Promise.all([
        supabaseAdmin.from('profiles').select('id, role, created_at, status'),
        supabaseAdmin.from('courses').select('id, category, status, created_at, total_students, level'),
        classesPromise,
        quizzesPromise,
        certsPromise,
        supabaseAdmin.from('assignments').select('id, status, created_at'),
        supabaseAdmin.from('lessons').select('id, created_at, type'),
        supabaseAdmin.from('attendance').select('id, status, date'),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (coursesRes.error) throw coursesRes.error;
      if (classesRes.error) throw classesRes.error;
      if (quizzesRes.error) throw quizzesRes.error;
      if (certsRes.error) throw certsRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;
      if (lessonsRes.error) throw lessonsRes.error;
      if (attendanceRes.error) throw attendanceRes.error;

      const profiles = profilesRes.data || [];
      const courses = coursesRes.data || [];
      const classes = classesRes.data || [];
      const quizzes = quizzesRes.data || [];
      const certs = certsRes.data || [];
      const assignments = assignmentsRes.data || [];
      const lessons = lessonsRes.data || [];
      const attendance = attendanceRes.data || [];
      const activeClasses = classes.filter((c: any) => c.status === 'active').length;
      const upcomingClasses = classes.filter((c: any) => c.status === 'upcoming').length;
      const totalClassEnrollments = classes.reduce((sum: number, c: any) => sum + ((c.student_ids || []).length || 0), 0);
      const avgClassFillRate = classes.length > 0
        ? Math.round(classes.reduce((sum: number, c: any) => {
            const enrolled = (c.student_ids || []).length || 0;
            const capacity = Number(c.capacity) > 0 ? Number(c.capacity) : 0;
            if (!capacity) return sum;
            return sum + Math.min((enrolled / capacity) * 100, 100);
          }, 0) / classes.length)
        : 0;

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
          totalClasses: classes.length,
          activeClasses,
          upcomingClasses,
          totalClassEnrollments,
          avgClassFillRate,
          totalCourses: courses.length,
          publishedCourses: courses.filter(c => c.status === 'published').length,
          totalQuizzes: quizzes.length,
          // Legacy DBs may not have quizzes.published; avoid column dependency.
          publishedQuizzes: quizzes.length,
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
      const [studentsRes, enrollmentsResWithIds, certs] = await Promise.all([
        supabaseAdmin.from('profiles').select('id, display_name, email, status, created_at').eq('role', 'student'),
        supabaseAdmin.from('courses').select('id, student_ids'),
        loadCertificateRowsForReports(),
      ]);

      if (studentsRes.error) throw studentsRes.error;
      let courses: any[] = [];
      if (enrollmentsResWithIds.error) {
        const isMissingStudentIdsColumn =
          enrollmentsResWithIds.error?.code === '42703' ||
          String(enrollmentsResWithIds.error?.message || '').includes('courses.student_ids');
        if (!isMissingStudentIdsColumn) throw enrollmentsResWithIds.error;
      } else {
        courses = enrollmentsResWithIds.data || [];
      }

      const students = studentsRes.data || [];
      const attempts = normalizeAttempts(await fetchAllAttemptRows());

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
          certificates: certs.filter((c) => c.student_id === s.id && c.status === 'issued').length,
        };
      });

      res.json({ success: true, report });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/admin/reports/courses', async (req, res) => {
    try {
      const [coursesResWithIds, lessonsRes, certs] = await Promise.all([
        supabaseAdmin.from('courses').select('id, title, category, level, status, created_at, total_students, teacher_id, student_ids'),
        supabaseAdmin.from('lessons').select('course_id'),
        loadCertificateRowsForReports(),
      ]);

      if (lessonsRes.error) throw lessonsRes.error;
      let courses: any[] = [];
      let usesStudentIds = true;
      if (coursesResWithIds.error) {
        const isMissingStudentIdsColumn =
          coursesResWithIds.error?.code === '42703' ||
          String(coursesResWithIds.error?.message || '').includes('courses.student_ids');
        if (!isMissingStudentIdsColumn) throw coursesResWithIds.error;
        const coursesResFallback = await supabaseAdmin
          .from('courses')
          .select('id, title, category, level, status, created_at, total_students, teacher_id');
        if (coursesResFallback.error) throw coursesResFallback.error;
        courses = coursesResFallback.data || [];
        usesStudentIds = false;
      } else {
        courses = coursesResWithIds.data || [];
      }

      const lessonsList = lessonsRes.data || [];

      const report = courses.map(c => ({
        id: c.id,
        title: c.title,
        category: c.category || 'Other',
        level: c.level || 'beginner',
        status: c.status,
        createdAt: c.created_at,
        enrolledStudents: usesStudentIds
          ? (c.student_ids || []).length
          : Number(c.total_students || 0),
        totalLessons: lessonsList.filter((l: any) => l.course_id === c.id).length,
        certificatesIssued: certs.filter((cert) => cert.course_id === c.id && cert.status === 'issued').length,
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

  app.get('/api/admin/reports/roles', async (req, res) => {
    try {
      const [profilesRes, coursesRes, quizzesRes, certs] = await Promise.all([
        supabaseAdmin.from('profiles').select('id, role, status, created_at'),
        supabaseAdmin.from('courses').select('teacher_id'),
        supabaseAdmin.from('quizzes').select('teacher_id'),
        loadCertificateRowsForReports(),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (coursesRes.error) throw coursesRes.error;
      if (quizzesRes.error) throw quizzesRes.error;

      const profiles = profilesRes.data || [];
      const courses = coursesRes.data || [];
      const quizzes = quizzesRes.data || [];
      const attempts = normalizeAttempts(await fetchAllAttemptRows());

      const roleByUserId: Record<string, 'admin' | 'teacher' | 'student'> = {};
      profiles.forEach((p: any) => {
        const role = p?.role === 'admin' || p?.role === 'teacher' ? p.role : 'student';
        roleByUserId[p.id] = role;
      });

      const roleStats: Record<'admin' | 'teacher' | 'student', {
        role: 'admin' | 'teacher' | 'student';
        users: number;
        activeUsers: number;
        newUsers30d: number;
        coursesCreated: number;
        quizzesCreated: number;
        attempts: number;
        certificates: number;
      }> = {
        admin: { role: 'admin', users: 0, activeUsers: 0, newUsers30d: 0, coursesCreated: 0, quizzesCreated: 0, attempts: 0, certificates: 0 },
        teacher: { role: 'teacher', users: 0, activeUsers: 0, newUsers30d: 0, coursesCreated: 0, quizzesCreated: 0, attempts: 0, certificates: 0 },
        student: { role: 'student', users: 0, activeUsers: 0, newUsers30d: 0, coursesCreated: 0, quizzesCreated: 0, attempts: 0, certificates: 0 },
      };

      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      profiles.forEach((p: any) => {
        const role = p?.role === 'admin' || p?.role === 'teacher' ? p.role : 'student';
        roleStats[role].users += 1;
        if (p?.status === 'active') roleStats[role].activeUsers += 1;
        const created = p?.created_at ? new Date(p.created_at).getTime() : 0;
        if (created > 0 && now - created <= thirtyDaysMs) roleStats[role].newUsers30d += 1;
      });

      courses.forEach((c: any) => {
        const ownerRole = roleByUserId[c?.teacher_id] || 'teacher';
        roleStats[ownerRole].coursesCreated += 1;
      });

      quizzes.forEach((q: any) => {
        const ownerRole = roleByUserId[q?.teacher_id] || 'teacher';
        roleStats[ownerRole].quizzesCreated += 1;
      });

      attempts.forEach((a: any) => {
        const role = roleByUserId[a?.student_id] || 'student';
        roleStats[role].attempts += 1;
      });

      certs.forEach((c: any) => {
        if (c?.status !== 'issued') return;
        const role = roleByUserId[c?.student_id] || 'student';
        roleStats[role].certificates += 1;
      });

      const report = [roleStats.admin, roleStats.teacher, roleStats.student];
      res.json({ success: true, report });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── PAYMENTS ────────────────────────────────────────────────
  app.get('/api/admin/payments', async (req, res) => {
    try {
      const [teachersRes, studentsRes] = await Promise.all([
        supabaseAdmin.from('profiles').select('id, display_name, email').eq('role', 'teacher'),
        supabaseAdmin.from('profiles').select('id, display_name, email, teacher_id').eq('role', 'student'),
      ]);

      if (teachersRes.error) throw teachersRes.error;
      if (studentsRes.error) throw studentsRes.error;

      const paymentsRes = await supabaseAdmin
        .from('payments')
        .select('id, teacher_id, student_id, amount, currency, status, method, payment_date, description, reference, created_at')
        .order('payment_date', { ascending: false });

      let paymentsRows: any[] = [];
      if (paymentsRes.error) {
        const message = String(paymentsRes.error?.message || '');
        const isMissingPaymentsTable =
          paymentsRes.error?.code === '42P01' ||
          message.includes("Could not find the table 'public.payments'") ||
          message.includes("Could not find the table 'payments'");
        if (!isMissingPaymentsTable) throw paymentsRes.error;
      } else {
        paymentsRows = paymentsRes.data || [];
      }

      const teacherMap: Record<string, { name: string; email: string }> = {};
      (teachersRes.data || []).forEach((t: any) => {
        teacherMap[t.id] = {
          name: t.display_name || t.email || 'Unknown teacher',
          email: t.email || '',
        };
      });

      const studentMap: Record<string, { name: string; email: string; teacher_id: string | null }> = {};
      (studentsRes.data || []).forEach((s: any) => {
        studentMap[s.id] = {
          name: s.display_name || s.email || 'Unknown student',
          email: s.email || '',
          teacher_id: s.teacher_id || null,
        };
      });

      const payments = paymentsRows.map((p: any) => ({
        ...p,
        teacher_name: p.teacher_id ? (teacherMap[p.teacher_id]?.name || '—') : '—',
        student_name: p.student_id ? (studentMap[p.student_id]?.name || '—') : '—',
        student_email: p.student_id ? (studentMap[p.student_id]?.email || '') : '',
      }));

      const teacherOptions = (teachersRes.data || []).map((t: any) => ({
        id: t.id,
        name: t.display_name || t.email || 'Unnamed teacher',
      }));
      const studentOptions = (studentsRes.data || []).map((s: any) => ({
        id: s.id,
        name: s.display_name || s.email || 'Unnamed student',
        email: s.email || '',
        teacherId: s.teacher_id || null,
      }));

      res.json({ success: true, payments, teacherOptions, studentOptions });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to load payments' });
    }
  });

  app.post('/api/admin/payments', async (req, res) => {
    try {
      const {
        teacher_id,
        student_id,
        amount,
        currency = 'USD',
        status = 'completed',
        method = 'bank',
        payment_date,
        description = '',
        reference = '',
      } = req.body || {};

      if (!teacher_id) return res.status(400).json({ error: 'Teacher is required' });
      if (!student_id) return res.status(400).json({ error: 'Student is required' });
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than zero' });
      }
      if (!payment_date) return res.status(400).json({ error: 'Payment date is required' });

      const { data: studentProfile, error: studentErr } = await supabaseAdmin
        .from('profiles')
        .select('id, teacher_id')
        .eq('id', student_id)
        .eq('role', 'student')
        .single();
      if (studentErr || !studentProfile) return res.status(400).json({ error: 'Invalid student selected' });
      if (studentProfile.teacher_id !== teacher_id) {
        return res.status(400).json({ error: 'Selected student does not belong to this teacher' });
      }

      const { data, error } = await supabaseAdmin
        .from('payments')
        .insert({
          teacher_id,
          student_id,
          amount: numericAmount,
          currency,
          status,
          method,
          payment_date,
          description,
          reference,
        })
        .select('id')
        .single();
      if (error) throw error;

      const paymentId = data?.id as string | undefined;
      if (paymentId) {
        const invStatus = paymentStatusToInvoiceRowStatus(String(status));
        const issued = String(payment_date).slice(0, 10);
        let due = issued;
        if (invStatus === 'paid') due = issued;
        else if (invStatus === 'pending') due = addDaysToYmd(issued, 14);
        else due = addDaysToYmd(issued, 30);

        const paidDate = invStatus === 'paid' ? issued : null;
        const lineDesc =
          String(description || '').trim() ||
          `Payment — ${String(method).replace(/_/g, ' ')}`;
        const courseTitle =
          String(description || '').trim().slice(0, 160) || 'Program / services';
        const items = [{ description: lineDesc, qty: 1, unit_price: numericAmount }];
        const noteLines = ['Auto-generated from payment registration.'];
        if (String(reference || '').trim()) noteLines.push(`Reference: ${String(reference).trim()}`);
        if (String(status) !== 'completed') noteLines.push(`Payment record status: ${String(status)}.`);

        let invoiceNumber: string;
        try {
          invoiceNumber = await nextInvoiceNumberForPaymentDate(issued);
        } catch (invNumErr: any) {
          await supabaseAdmin.from('payments').delete().eq('id', paymentId);
          throw invNumErr;
        }

        const invInsert = await supabaseAdmin
          .from('invoices')
          .insert({
            payment_id: paymentId,
            invoice_number: invoiceNumber,
            teacher_id,
            student_id,
            currency,
            status: invStatus,
            issued_date: issued,
            due_date: due,
            paid_date: paidDate,
            course_title: courseTitle,
            items,
            notes: noteLines.join('\n'),
            student_address: '',
            student_phone: '',
          })
          .select('id, invoice_number')
          .single();

        if (invInsert.error) {
          await supabaseAdmin.from('payments').delete().eq('id', paymentId);
          const im = String(invInsert.error?.message || '');
          if (
            invInsert.error?.code === '42P01' ||
            im.includes("Could not find the table 'public.invoices'")
          ) {
            return res.status(400).json({
              error:
                "Could not create invoice: table 'invoices' is missing. Run sql/add_invoices_table.sql in Supabase, then try again.",
            });
          }
          throw invInsert.error;
        }

        return res.json({
          success: true,
          id: paymentId,
          invoice_id: invInsert.data?.id,
          invoice_number: invInsert.data?.invoice_number,
        });
      }

      res.json({ success: true, id: data?.id });
    } catch (e: any) {
      const message = String(e?.message || '');
      if (
        e?.code === '42P01' ||
        message.includes("Could not find the table 'public.payments'") ||
        message.includes("Could not find the table 'payments'")
      ) {
        return res.status(400).json({
          error:
            "Payments are not available yet because table 'payments' is missing. Run sql/add_payments_table.sql in Supabase, then try again.",
        });
      }
      res.status(500).json({ error: e.message || 'Failed to create payment' });
    }
  });

  app.get('/api/admin/invoices', async (req, res) => {
    try {
      const invRes = await supabaseAdmin
        .from('invoices')
        .select(
          'id, payment_id, invoice_number, teacher_id, student_id, currency, status, issued_date, due_date, paid_date, course_title, items, notes, student_address, student_phone, created_at',
        )
        .order('issued_date', { ascending: false });

      if (invRes.error) {
        const msg = String(invRes.error?.message || '');
        if (
          invRes.error?.code === '42P01' ||
          msg.includes("Could not find the table 'public.invoices'")
        ) {
          return res.json({ success: true, invoices: [] });
        }
        throw invRes.error;
      }

      const rows = invRes.data || [];
      const ids = new Set<string>();
      rows.forEach((r: any) => {
        if (r.student_id) ids.add(r.student_id);
        if (r.teacher_id) ids.add(r.teacher_id);
      });
      const idList = [...ids];
      let profMap: Record<string, { name: string; email: string }> = {};
      if (idList.length) {
        const { data: profs, error: pErr } = await supabaseAdmin
          .from('profiles')
          .select('id, display_name, email')
          .in('id', idList);
        if (pErr) throw pErr;
        (profs || []).forEach((p: any) => {
          profMap[p.id] = {
            name: p.display_name || p.email || 'Unknown',
            email: p.email || '',
          };
        });
      }

      const invoices = rows.map((r: any) => {
        const dueYmd = String(r.due_date || '').slice(0, 10);
        const displayStatus = resolveInvoiceDisplayStatus(String(r.status || 'draft'), dueYmd);
        const rawItems = Array.isArray(r.items) ? r.items : [];
        const items = rawItems.map((it: any) => ({
          description: String(it?.description ?? ''),
          qty: Math.max(1, Number(it?.qty) || 1),
          unit_price: Number(it?.unit_price) || 0,
        }));
        const stu = profMap[r.student_id] || { name: '—', email: '' };
        const tea = profMap[r.teacher_id] || { name: '—', email: '' };
        return {
          id: r.id,
          payment_id: r.payment_id,
          invoice_number: r.invoice_number,
          student_name: stu.name,
          student_email: stu.email,
          student_address: r.student_address || '',
          student_phone: r.student_phone || '',
          teacher_name: tea.name,
          teacher_email: tea.email,
          course_title: r.course_title || '',
          status: displayStatus,
          currency: r.currency || 'USD',
          issued_date: String(r.issued_date || '').slice(0, 10),
          due_date: dueYmd,
          paid_date: r.paid_date ? String(r.paid_date).slice(0, 10) : null,
          items,
          notes: r.notes || '',
        };
      });

      res.json({ success: true, invoices });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to load invoices' });
    }
  });

  // ── TEACHER LIVE SESSIONS ───────────────────────────────────

  // Auth helper: validates Bearer token and returns { userId, role } or null
  const getAuthUser = async (req: Request): Promise<{ userId: string; role: string } | null> => {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) return null;
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;
    const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
    return { userId: user.id, role: profile?.role || 'student' };
  };

  // Check caller is a teacher/admin who is host of the given session
  const assertSessionHost = async (req: Request, res: Response, sessionId: string): Promise<string | null> => {
    const caller = await getAuthUser(req);
    if (!caller) { res.status(401).json({ error: 'Unauthorized' }); return null; }
    if (caller.role !== 'teacher' && caller.role !== 'admin') { res.status(403).json({ error: 'Forbidden: teacher or admin role required' }); return null; }
    // For admins, skip host check
    if (caller.role === 'admin') return caller.userId;
    const { data: session } = await supabaseAdmin.from('live_sessions').select('host_id').eq('id', sessionId).single();
    if (!session || session.host_id !== caller.userId) { res.status(403).json({ error: 'Forbidden: you are not the host of this session' }); return null; }
    return caller.userId;
  };

  // Assert authenticated participant (teacher or student who can access the session)
  const assertAuthenticated = async (req: Request, res: Response): Promise<{ userId: string; role: string } | null> => {
    const caller = await getAuthUser(req);
    if (!caller) { res.status(401).json({ error: 'Unauthorized' }); return null; }
    return caller;
  };

  // Admin users list for dashboard user management
  app.get('/api/admin/users', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden: admin role required' });

      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('id, email, display_name, role, teacher_id, status, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      res.json({ success: true, users: data || [] });
    } catch (e: unknown) {
      res.status(500).json({ error: (e as Error).message || 'Failed to load users' });
    }
  });

  // List sessions for logged-in teacher (teacher or admin only)
  app.get('/api/teacher/live-sessions', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: teacher or admin role required' });
      }
      const { host_id } = req.query;
      // Teachers can only list their own; admins can filter by host_id
      const effectiveHostId = caller.role === 'admin' ? (host_id as string | undefined) : caller.userId;
      let query = supabaseAdmin
        .from('live_sessions')
        .select('*, host:profiles!host_id(id,display_name,email), course:courses!course_id(id,title)')
        .order('scheduled_at', { ascending: false });
      if (effectiveHostId) query = query.eq('host_id', effectiveHostId);
      const { data, error } = await query;
      if (error) throw error;

      const ids = (data || []).map((s: { id: string }) => s.id);
      const invitedCounts: Record<string, number> = {};
      const joinedCounts: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: pData } = await supabaseAdmin
          .from('session_participants')
          .select('session_id,joined_at')
          .in('session_id', ids);
        (pData || []).forEach((p: { session_id: string; joined_at: string | null }) => {
          invitedCounts[p.session_id] = (invitedCounts[p.session_id] || 0) + 1;
          if (p.joined_at) joinedCounts[p.session_id] = (joinedCounts[p.session_id] || 0) + 1;
        });
      }

      const sessions = (data || []).map((s: Record<string, unknown>) => ({
        ...s,
        participant_count: s.status === 'ended'
          ? (joinedCounts[s.id as string] || 0)
          : (invitedCounts[s.id as string] || 0),
        invited_count: invitedCounts[s.id as string] || 0,
        joined_count: joinedCounts[s.id as string] || 0,
      }));
      res.json({ success: true, sessions });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Create session
  app.post('/api/teacher/live-sessions', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden: teacher role required' });

      const { participant_ids, class_id, ...sessionData } = req.body;
      // Force host_id to the authenticated caller
      const payload = {
        ...sessionData,
        host_id: caller.userId,
        class_id: class_id || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { data: session, error } = await supabaseAdmin
        .from('live_sessions').insert(payload).select().single();
      if (error) throw error;

      const inviteIds: string[] = Array.isArray(participant_ids) ? [...participant_ids] : [];

      if (class_id) {
        const { data: classRow } = await supabaseAdmin.from('classes').select('student_ids').eq('id', class_id).single();
        ((classRow?.student_ids as string[]) || []).forEach((uid: string) => {
          if (!inviteIds.includes(uid)) inviteIds.push(uid);
        });
      }

      if (inviteIds.length > 0) {
        const participantRows = inviteIds.map((uid: string) => ({
          session_id: session.id,
          user_id: uid,
          role: 'student',
          invited_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        }));
        await supabaseAdmin.from('session_participants').upsert(participantRows, { onConflict: 'session_id,user_id' });

        const notifRows = inviteIds.map((uid: string) => ({
          user_id: uid,
          title: 'Live Session Invitation',
          message: `You've been invited to "${session.title}" — join now`,
          type: 'info',
          action_url: `/student/live-sessions/${session.id}`,
          created_at: new Date().toISOString(),
        }));
        await supabaseAdmin.from('notifications').insert(notifRows);
      }

      res.json({ success: true, session });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Update session — host only; strict whitelist of mutable fields
  app.patch('/api/teacher/live-sessions/:id', async (req, res) => {
    try {
      const hostId = await assertSessionHost(req, res, req.params.id);
      if (!hostId) return;

      // Whitelist the fields a host is permitted to change
      const ALLOWED_FIELDS = ['status', 'title', 'description', 'scheduled_at', 'duration_minutes', 'recording_url', 'jitsi_room_name', 'started_at'];
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const key of ALLOWED_FIELDS) {
        if (key in req.body) update[key] = req.body[key];
      }
      if (Object.keys(update).length === 1) {
        return res.status(400).json({ error: 'No updatable fields provided' });
      }

      const { data, error } = await supabaseAdmin
        .from('live_sessions')
        .update(update)
        .eq('id', req.params.id).select().single();
      if (error) throw error;

      if (req.body.status === 'live') {
        update.started_at = new Date().toISOString();
        const { data: parts } = await supabaseAdmin
          .from('session_participants').select('user_id').eq('session_id', req.params.id);
        if (parts && parts.length > 0) {
          const notifRows = (parts as Array<{ user_id: string }>).map((p) => ({
            user_id: p.user_id,
            title: 'Session is Live Now!',
            message: `"${data.title}" has started — join now`,
            type: 'info',
            action_url: `/student/live-sessions/${req.params.id}`,
            created_at: new Date().toISOString(),
          }));
          await supabaseAdmin.from('notifications').insert(notifRows);
        }
      }

      res.json({ success: true, session: data });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Delete session (host only)
  app.delete('/api/teacher/live-sessions/:id', async (req, res) => {
    try {
      const hostId = await assertSessionHost(req, res, req.params.id);
      if (!hostId) return;
      const { error } = await supabaseAdmin.from('live_sessions').delete().eq('id', req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Helper: check if caller has access to a given session
  // Access granted if: admin, session host, invited+non-removed participant, OR enrolled in session's course/class (for ended sessions)
  // assertSessionParticipantAccess — only host, admin, or explicitly invited (non-removed) participants
  const assertSessionParticipantAccess = async (req: Request, res: Response, sessionId: string): Promise<string | null> => {
    const caller = await getAuthUser(req);
    if (!caller) { res.status(401).json({ error: 'Unauthorized' }); return null; }
    if (caller.role === 'admin') return caller.userId;
    const { data: sessionRow } = await supabaseAdmin
      .from('live_sessions').select('host_id').eq('id', sessionId).single();
    if (!sessionRow) { res.status(404).json({ error: 'Session not found' }); return null; }
    if (sessionRow.host_id === caller.userId) return caller.userId;
    const { data: participation } = await supabaseAdmin
      .from('session_participants').select('id,is_removed').eq('session_id', sessionId).eq('user_id', caller.userId).single();
    if (participation && (participation as { id: string; is_removed?: boolean }).is_removed) {
      res.status(403).json({ error: 'Forbidden: you have been removed from this session' }); return null;
    }
    if (participation) return caller.userId;
    res.status(403).json({ error: 'Forbidden: you are not a participant of this session' }); return null;
  };

  // assertSessionAccess — broader: host/admin/invited participant OR enrolled student for ended sessions (recording access only)
  const assertSessionAccess = async (req: Request, res: Response, sessionId: string): Promise<string | null> => {
    const caller = await getAuthUser(req);
    if (!caller) { res.status(401).json({ error: 'Unauthorized' }); return null; }
    if (caller.role === 'admin') return caller.userId;
    // Check if host
    const { data: sessionRow } = await supabaseAdmin
      .from('live_sessions').select('host_id,course_id,class_id,status').eq('id', sessionId).single();
    if (!sessionRow) { res.status(404).json({ error: 'Session not found' }); return null; }
    if (sessionRow.host_id === caller.userId) return caller.userId;
    // Check if invited participant AND not removed by host
    const { data: participation } = await supabaseAdmin
      .from('session_participants').select('id,is_removed').eq('session_id', sessionId).eq('user_id', caller.userId).single();
    if (participation && !(participation as { id: string; is_removed?: boolean }).is_removed) {
      return caller.userId;
    }
    if (participation && (participation as { id: string; is_removed?: boolean }).is_removed) {
      res.status(403).json({ error: 'Forbidden: you have been removed from this session' }); return null;
    }
    // For ended sessions: also allow students enrolled in the session's course or class (recording access)
    if (sessionRow.status === 'ended') {
      if (sessionRow.course_id) {
        const { data: course } = await supabaseAdmin
          .from('courses').select('student_ids').eq('id', sessionRow.course_id).single();
        if (course && Array.isArray(course.student_ids) && course.student_ids.includes(caller.userId)) {
          return caller.userId;
        }
      }
      if (sessionRow.class_id) {
        const { data: cls } = await supabaseAdmin
          .from('classes').select('student_ids').eq('id', sessionRow.class_id).single();
        if (cls && Array.isArray(cls.student_ids) && cls.student_ids.includes(caller.userId)) {
          return caller.userId;
        }
      }
    }
    res.status(403).json({ error: 'Forbidden: you are not a participant of this session' }); return null;
  };

  // Student session detail — accessible to invited participants AND enrolled students (for ended sessions)
  app.get('/api/student/live-sessions/:id', async (req, res) => {
    try {
      const userId = await assertSessionAccess(req, res, req.params.id);
      if (!userId) return;
      const { data, error } = await supabaseAdmin
        .from('live_sessions')
        .select('*, host:profiles!host_id(id,display_name,email), course:courses!course_id(id,title)')
        .eq('id', req.params.id).single();
      if (error) throw error;
      res.json({ success: true, session: data });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Student recordings endpoint — list recordings accessible to caller (invited or enrolled)
  app.get('/api/student/live-sessions/:id/recording', async (req, res) => {
    try {
      const userId = await assertSessionAccess(req, res, req.params.id);
      if (!userId) return;
      const { data, error } = await supabaseAdmin
        .from('live_sessions')
        .select('id,title,recording_url,status,scheduled_at')
        .eq('id', req.params.id).single();
      if (error) throw error;
      if (!data.recording_url) return res.json({ success: true, recording_url: null });
      res.json({ success: true, recording_url: data.recording_url, title: data.title });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Single session fetch — accessible by host or invited participants only (not enrolled-only students)
  app.get('/api/teacher/live-sessions/:id', async (req, res) => {
    try {
      const userId = await assertSessionParticipantAccess(req, res, req.params.id);
      if (!userId) return;
      const { data, error } = await supabaseAdmin
        .from('live_sessions')
        .select('*, host:profiles!host_id(id,display_name,email), course:courses!course_id(id,title)')
        .eq('id', req.params.id).single();
      if (error) throw error;
      res.json({ success: true, session: data });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Get participants — host or explicitly invited participant only
  app.get('/api/teacher/live-sessions/:id/participants', async (req, res) => {
    try {
      const userId = await assertSessionParticipantAccess(req, res, req.params.id);
      if (!userId) return;
      const { data, error } = await supabaseAdmin
        .from('session_participants')
        .select('*, user:profiles!user_id(id,display_name,email,avatar_url)')
        .eq('session_id', req.params.id);
      if (error) throw error;
      res.json({ success: true, participants: data || [] });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Invite participants to existing session (host only)
  app.post('/api/teacher/live-sessions/:id/invite', async (req, res) => {
    try {
      const hostId = await assertSessionHost(req, res, req.params.id);
      if (!hostId) return;

      const { user_ids, class_id } = req.body;
      const inviteIds: string[] = Array.isArray(user_ids) ? [...user_ids] : [];

      if (class_id) {
        const { data: classRow } = await supabaseAdmin.from('classes').select('student_ids').eq('id', class_id).single();
        ((classRow?.student_ids as string[]) || []).forEach((uid: string) => {
          if (!inviteIds.includes(uid)) inviteIds.push(uid);
        });
      }

      if (inviteIds.length === 0) return res.status(400).json({ error: 'No user IDs provided' });

      const { data: session } = await supabaseAdmin.from('live_sessions').select('title').eq('id', req.params.id).single();

      const rows = inviteIds.map((uid: string) => ({
        session_id: req.params.id,
        user_id: uid,
        role: 'student',
        invited_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }));
      await supabaseAdmin.from('session_participants').upsert(rows, { onConflict: 'session_id,user_id' });

      const notifRows = inviteIds.map((uid: string) => ({
        user_id: uid,
        title: 'Live Session Invitation',
        message: `You've been invited to "${session?.title || 'a session'}" — join now`,
        type: 'info',
        action_url: `/student/live-sessions/${req.params.id}`,
        created_at: new Date().toISOString(),
      }));
      await supabaseAdmin.from('notifications').insert(notifRows);

      res.json({ success: true, invited: inviteIds.length });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Update participant status — host can mute/pin/remove; participants can only update own left_at
  app.patch('/api/teacher/live-sessions/:id/participants/:userId', async (req, res) => {
    try {
      const { id, userId } = req.params;
      const caller = await getAuthUser(req);
      if (!caller) { return res.status(401).json({ error: 'Unauthorized' }); }

      // Determine if this is a participant leaving their own record
      const isSelfLeave = caller.userId === userId;

      if (isSelfLeave) {
        // Participants may ONLY update their own left_at or is_hand_raised — nothing else
        const { left_at, is_hand_raised } = req.body;
        if (left_at === undefined && is_hand_raised === undefined) {
          return res.status(403).json({ error: 'Forbidden: participants may only set their own left_at or is_hand_raised' });
        }
        const selfUpdate: Record<string, unknown> = {};
        if (left_at !== undefined) selfUpdate.left_at = left_at;
        if (is_hand_raised !== undefined) selfUpdate.is_hand_raised = is_hand_raised;
        const { data, error } = await supabaseAdmin
          .from('session_participants')
          .update(selfUpdate)
          .eq('session_id', id).eq('user_id', userId)
          .select().single();
        if (error) throw error;
        return res.json({ success: true, participant: data });
      }

      // All other updates require host ownership
      const sessionRow = await assertSessionHost(req, res, id);
      if (!sessionRow) return;

      // Whitelist host-mutable fields
      const HOST_FIELDS = ['is_muted', 'is_pinned', 'left_at', 'is_removed', 'is_hand_raised'];
      const update: Record<string, unknown> = {};
      for (const key of HOST_FIELDS) {
        if (key in req.body) update[key] = req.body[key];
      }
      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: 'No updatable fields provided' });
      }
      const { data, error } = await supabaseAdmin
        .from('session_participants')
        .update(update)
        .eq('session_id', id).eq('user_id', userId)
        .select().single();
      if (error) throw error;
      res.json({ success: true, participant: data });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Log attendance (join) — session participants only, can only log own join
  app.post('/api/teacher/live-sessions/:id/join', async (req, res) => {
    try {
      const caller = await getAuthUser(req);
      if (!caller) return res.status(401).json({ error: 'Unauthorized' });
      const { user_id } = req.body;
      if (!user_id) return res.status(400).json({ error: 'user_id is required' });
      if (caller.userId !== user_id && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: can only log own attendance' });
      }

      // Verify session is currently live
      const { data: sessionRow, error: sErr } = await supabaseAdmin
        .from('live_sessions').select('id,status,host_id').eq('id', req.params.id).single();
      if (sErr || !sessionRow) return res.status(404).json({ error: 'Session not found' });
      const isHost = caller.userId === sessionRow.host_id || caller.role === 'admin';
      if (sessionRow.status !== 'live' && !isHost) {
        return res.status(403).json({ error: 'Session is not live' });
      }

      // Non-admin non-host callers must be an explicitly invited, non-removed participant
      if (!isHost) {
        const { data: pRow } = await supabaseAdmin
          .from('session_participants')
          .select('id,is_removed')
          .eq('session_id', req.params.id).eq('user_id', user_id)
          .maybeSingle();
        if (!pRow) return res.status(403).json({ error: 'Not invited to this session' });
        if (pRow.is_removed) return res.status(403).json({ error: 'You have been removed from this session' });
      }

      const { data, error } = await supabaseAdmin
        .from('session_participants')
        .upsert({ session_id: req.params.id, user_id, role: 'student', joined_at: new Date().toISOString(), created_at: new Date().toISOString() }, { onConflict: 'session_id,user_id' })
        .select().single();
      if (error) throw error;
      res.json({ success: true, participant: data });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Log attendance (leave) — must be currently an active invited participant
  app.post('/api/teacher/live-sessions/:id/leave', async (req, res) => {
    try {
      const caller = await getAuthUser(req);
      if (!caller) return res.status(401).json({ error: 'Unauthorized' });
      const { user_id } = req.body;
      if (!user_id) return res.status(400).json({ error: 'user_id is required' });
      if (caller.userId !== user_id && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: can only log own attendance' });
      }

      // Verify session exists
      const { data: sessionRow, error: sErr } = await supabaseAdmin
        .from('live_sessions').select('id,status,host_id').eq('id', req.params.id).single();
      if (sErr || !sessionRow) return res.status(404).json({ error: 'Session not found' });
      const isHost = caller.userId === sessionRow.host_id || caller.role === 'admin';

      // Non-host must have an explicit participant row with a joined_at (and not removed)
      if (!isHost) {
        const { data: pRow } = await supabaseAdmin
          .from('session_participants')
          .select('id,is_removed,joined_at')
          .eq('session_id', req.params.id).eq('user_id', user_id)
          .maybeSingle();
        if (!pRow) return res.status(403).json({ error: 'Not a participant of this session' });
        if (pRow.is_removed) return res.status(403).json({ error: 'You have been removed from this session' });
        if (!pRow.joined_at) return res.status(400).json({ error: 'Cannot leave a session you have not joined' });
      }

      const { data, error } = await supabaseAdmin
        .from('session_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('session_id', req.params.id).eq('user_id', user_id)
        .select().single();
      if (error) throw error;
      res.json({ success: true, participant: data });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Get chat messages — host or explicitly invited participants only (not enrolled-only)
  app.get('/api/teacher/live-sessions/:id/chat', async (req, res) => {
    try {
      const caller = await assertSessionParticipantAccess(req, res, req.params.id);
      if (!caller) return;
      const { data, error } = await supabaseAdmin
        .from('session_chat_messages')
        .select('*, sender:profiles!sender_id(id,display_name,avatar_url)')
        .eq('session_id', req.params.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      res.json({ success: true, messages: data || [] });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Send chat message — invited participants only, sender_id must match caller
  app.post('/api/teacher/live-sessions/:id/chat', async (req, res) => {
    try {
      const accessUserId = await assertSessionParticipantAccess(req, res, req.params.id);
      if (!accessUserId) return;
      const caller = await getAuthUser(req);
      if (!caller) return;
      const { sender_id, message } = req.body;
      if (caller.userId !== sender_id) {
        return res.status(403).json({ error: 'Forbidden: sender_id must match authenticated user' });
      }
      const { data, error } = await supabaseAdmin
        .from('session_chat_messages')
        .insert({ session_id: req.params.id, sender_id, message, created_at: new Date().toISOString() })
        .select('*, sender:profiles!sender_id(id,display_name,avatar_url)').single();
      if (error) throw error;
      res.json({ success: true, message: data });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Persist reaction — invited participants/host only (not enrolled-only)
  app.post('/api/teacher/live-sessions/:id/reactions', async (req, res) => {
    try {
      const userId = await assertSessionParticipantAccess(req, res, req.params.id);
      if (!userId) return;
      const caller = await getAuthUser(req);
      if (!caller) return;
      const { emoji } = req.body;
      if (!emoji) return res.status(400).json({ error: 'emoji required' });
      const { data, error } = await supabaseAdmin
        .from('session_reactions')
        .insert({ session_id: req.params.id, user_id: caller.userId, emoji, created_at: new Date().toISOString() })
        .select().single();
      if (error) throw error;
      res.json({ success: true, reaction: data });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Recording upload URL (host only)
  app.post('/api/teacher/live-sessions/:id/upload-url', async (req, res) => {
    try {
      const hostId = await assertSessionHost(req, res, req.params.id);
      if (!hostId) return;
      const { id } = req.params;
      const filename = `session-${id}-${Date.now()}.webm`;
      const storagePath = `recordings/${filename}`;
      await supabaseAdmin.storage.createBucket('live-recordings', { public: true }).catch(() => {});
      const { data, error } = await supabaseAdmin.storage.from('live-recordings').createSignedUploadUrl(storagePath);
      if (error) {
        await supabaseAdmin.storage.createBucket('recordings', { public: true }).catch(() => {});
        const { data: d2, error: e2 } = await supabaseAdmin.storage.from('recordings').createSignedUploadUrl(storagePath);
        if (e2) throw e2;
        const { data: { publicUrl } } = supabaseAdmin.storage.from('recordings').getPublicUrl(storagePath);
        return res.json({ success: true, signedUrl: d2.signedUrl, publicUrl, bucket: 'recordings' });
      }
      const { data: { publicUrl } } = supabaseAdmin.storage.from('live-recordings').getPublicUrl(storagePath);
      res.json({ success: true, signedUrl: data.signedUrl, publicUrl, bucket: 'live-recordings' });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Search users for invitation (teacher only)
  app.get('/api/teacher/users/search', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
      const { q, role } = req.query;
      let query = supabaseAdmin.from('profiles').select('id, display_name, email, role, avatar_url');
      if (role) query = query.eq('role', role as string);
      if (q) query = query.or(`display_name.ilike.%${q}%,email.ilike.%${q}%`);
      query = query.limit(20);
      const { data, error } = await query;
      if (error) throw error;
      res.json({ success: true, users: data || [] });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // List classes (teacher only)
  app.get('/api/teacher/classes', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
      const { teacher_id } = req.query;
      const effectiveTeacherId = caller.role === 'admin' ? (teacher_id as string | undefined) : caller.userId;
      let query = supabaseAdmin.from('classes').select('id, name, student_ids, course_id');
      if (effectiveTeacherId) query = query.eq('teacher_id', effectiveTeacherId);
      const { data, error } = await query;
      if (error) throw error;
      res.json({ success: true, classes: data || [] });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ── STUDENT LIVE SESSIONS ───────────────────────────────────

  // Get live sessions for which the authenticated student is an invited participant
  app.get('/api/student/live-sessions', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'student' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: student or admin role required' });
      }
      const { status } = req.query;

      // Find session_ids where this user is a non-removed participant
      const { data: participantRows, error: pErr } = await supabaseAdmin
        .from('session_participants')
        .select('session_id,is_removed')
        .eq('user_id', caller.userId);
      if (pErr) throw pErr;

      const invitedSessionIds = (participantRows || [])
        .filter((p: { session_id: string; is_removed?: boolean }) => !p.is_removed)
        .map((p: { session_id: string }) => p.session_id);

      // Also find ended sessions from courses or classes the student is enrolled in
      const [{ data: enrolledCourses }, { data: enrolledClasses }] = await Promise.all([
        supabaseAdmin.from('courses').select('id').contains('student_ids', [caller.userId]),
        supabaseAdmin.from('classes').select('id').contains('student_ids', [caller.userId]),
      ]);
      const courseIds = (enrolledCourses || []).map((c: { id: string }) => c.id);
      const classIds = (enrolledClasses || []).map((c: { id: string }) => c.id);
      let enrolledSessionIds: string[] = [];
      if (courseIds.length > 0) {
        const { data: rows } = await supabaseAdmin.from('live_sessions').select('id').in('course_id', courseIds).eq('status', 'ended');
        enrolledSessionIds.push(...(rows || []).map((s: { id: string }) => s.id));
      }
      if (classIds.length > 0) {
        const { data: rows } = await supabaseAdmin.from('live_sessions').select('id').in('class_id', classIds).eq('status', 'ended');
        enrolledSessionIds.push(...(rows || []).map((s: { id: string }) => s.id));
      }

      const allSessionIds = Array.from(new Set([...invitedSessionIds, ...enrolledSessionIds]));
      if (allSessionIds.length === 0) return res.json({ success: true, sessions: [] });

      let query = supabaseAdmin
        .from('live_sessions')
        .select('id, title, status, scheduled_at, duration_minutes, recording_url, host:profiles!host_id(id,display_name)')
        .in('id', allSessionIds)
        .order('scheduled_at', { ascending: false });

      if (status) query = query.eq('status', status as string);

      const { data, error } = await query;
      if (error) throw error;
      res.json({ success: true, sessions: data || [] });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
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

  // ── MODULES (ADMIN) ───────────────────────────────────────────
  app.get('/api/admin/modules', async (req, res) => {
    try {
      const [modulesSnap, coursesSnap, teachersSnap] = await Promise.all([
        supabaseAdmin.from('modules').select('*').order('order', { ascending: true }),
        supabaseAdmin.from('courses').select('id, title, teacher_id'),
        supabaseAdmin.from('teachers').select('user_id, first_name, last_name'),
      ]);

      if (modulesSnap.error) throw modulesSnap.error;
      if (coursesSnap.error) throw coursesSnap.error;
      if (teachersSnap.error) throw teachersSnap.error;

      let lessonsSnap = await supabaseAdmin
        .from('lessons')
        .select('*')
        .order('order', { ascending: true });
      if (lessonsSnap.error) {
        lessonsSnap = await supabaseAdmin
          .from('lessons')
          .select('*')
          .order('created_at', { ascending: true });
      }
      if (lessonsSnap.error) throw lessonsSnap.error;

      res.json({
        success: true,
        modules: modulesSnap.data || [],
        courses: coursesSnap.data || [],
        teachers: teachersSnap.data || [],
        lessons: lessonsSnap.data || [],
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/admin/modules', async (req, res) => {
    try {
      const payload = {
        ...req.body,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabaseAdmin.from('modules').insert(payload).select().single();
      if (error) throw error;
      res.json({ success: true, module: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch('/api/admin/modules/:id', async (req, res) => {
    try {
      const payload = {
        ...req.body,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabaseAdmin.from('modules').update(payload).eq('id', req.params.id).select().single();
      if (error) throw error;
      res.json({ success: true, module: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/admin/modules/:id', async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from('modules').delete().eq('id', req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── LESSONS (ADMIN, service role — bypasses RLS) ─────────────
  // List/load: use GET /api/admin/modules (includes lessons + courses + modules + teachers).

  app.post('/api/admin/lessons', async (req, res) => {
    try {
      const { title, short_description, course_id, module_id, type, duration_minutes, status, is_free_preview, slug, order } = req.body || {};
      if (!course_id || !module_id || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'course_id, module_id and title are required' });
      }
      const slugFinal =
        typeof slug === 'string' && slug.trim()
          ? slug.trim()
          : title
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/(^-|-$)+/g, '');
      const now = new Date().toISOString();
      const payload = {
        title: title.trim(),
        short_description: short_description ?? null,
        course_id: String(course_id),
        module_id: String(module_id),
        type: type || 'video',
        duration_minutes: Number(duration_minutes) || 0,
        status: status || 'published',
        is_free_preview: Boolean(is_free_preview),
        slug: slugFinal,
        order: Number(order) || 1,
        created_at: now,
        updated_at: now,
      };
      const { data, error } = await supabaseAdmin.from('lessons').insert(payload).select().single();
      if (error) {
        const msg = [error.message, error.details, error.hint].filter(Boolean).join(' — ') || error.code || 'Database error';
        return res.status(400).json({ error: msg, code: error.code });
      }
      res.json({ success: true, lesson: data });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/api/admin/lessons/:id', async (req, res) => {
    try {
      const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
      if (!id) return res.status(400).json({ error: 'Lesson id is required' });
      const { title, short_description, course_id, module_id, type, duration_minutes, status, is_free_preview, order } = req.body || {};
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof title === 'string') updates.title = title.trim();
      if (short_description !== undefined) updates.short_description = short_description;
      if (course_id !== undefined) updates.course_id = String(course_id);
      if (module_id !== undefined) updates.module_id = String(module_id);
      if (type !== undefined) updates.type = type;
      if (duration_minutes !== undefined) updates.duration_minutes = Number(duration_minutes) || 0;
      if (status !== undefined) updates.status = status;
      if (is_free_preview !== undefined) updates.is_free_preview = Boolean(is_free_preview);
      if (order !== undefined) updates.order = Number(order) || 1;
      const { data, error } = await supabaseAdmin.from('lessons').update(updates).eq('id', id).select().single();
      if (error) {
        const msg = [error.message, error.details, error.hint].filter(Boolean).join(' — ') || error.code || 'Database error';
        return res.status(400).json({ error: msg, code: error.code });
      }
      res.json({ success: true, lesson: data });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/admin/lessons/:id', async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from('lessons').delete().eq('id', req.params.id);
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

  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return res.status(404).json({
        error:
          "No API route matched. Start the app with npm run dev (tsx server.ts) and use the printed URL, or set VITE_API_BASE_URL to your API server.",
        method: req.method,
        path: req.path,
      });
    }
    next();
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

