npm ls @supabase/supabase-js --depth=0   # already in dependencies: ^2.58.0, so no install needed
npm run build                            # type-check + bundle: should pass with no TS errors
npm run dev                              # app should boot; a missing/blank env var surfaces the [supabase] error
