// Production: the hosted Supabase project.
//
// The anon key is public by design: it ships inside the browser bundle and
// every table is guarded by Row Level Security, so holding it grants nothing
// on its own. The secret / service_role key must NEVER go here.
export const environment = {
  supabaseUrl: 'https://lsxwqzpwunoubnbpbfhc.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzeHdxenB3dW5vdWJuYnBiZmhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMTczMDYsImV4cCI6MjEwNjc5MzMwNn0.JUwLg-OI0mqfTR8-hskG9Cb3UOpCCvbvq_AZZZBOCRU',
};
