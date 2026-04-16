import { config } from 'dotenv';
config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function run() {
  console.log("Fetching modules as anon...");
  const res = await supabase.from('modules').select('*');
  console.log("Modules:", res.data);
  if (res.error) console.error("Error:", res.error);
}
run();