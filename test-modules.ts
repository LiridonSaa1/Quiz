import { config } from 'dotenv';
config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log("Fetching courses...");
  const courses = await supabase.from('courses').select('id, title');
  console.log(courses.data?.length, "courses found");

  console.log("Fetching modules...");
  const res = await supabase.from('modules').select('*');
  console.log("Modules:", res.data);
  if (res.error) console.error("Error:", res.error);
}
run();