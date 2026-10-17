npm create vite@latest . -- --template react-ts   # answer "Ignore files and continue" to keep piano.md
npm install
npm install @supabase/supabase-js react-router-dom
mkdir -p src/pages src/components src/lib src/hooks
npm run dev      # expect http://localhost:5173
npm run build    # type-check + dist/
