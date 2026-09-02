# Quran School Management

Production-oriented Quran memorization school website and management system for a two-year, six-term programme with three formal evaluations per term.

## Architecture
- Next.js 16 + React 19
- Supabase Auth/Postgres/RLS
- Quran metadata: 6,236 ayahs / 114 surahs / 604 pages / 30 Juz / 60 Hizb
- Role-aware application routes
- Admin, Teacher, Parent, Admissions, Finance, Security, Reports, CMS and Alumni modules
- Evaluation approval workflow with database-enforced position validation and approved-record locking
- Structure-driven graduation and certificate workflow
- Attendance submission/review/notification gating

## Supabase
The application targets the dedicated Supabase project:
`ziyeasotnfijggecbqwf` (`https://ziyeasotnfijggecbqwf.supabase.co`).

Copy `.env.example` to `.env.local` and set the Supabase publishable key from the Supabase project API settings.

All database migrations are in `supabase/migrations/` and should be applied before first use.

## Authentication
Create users through Supabase Authentication. For each user, create the corresponding `public.profiles` row with the appropriate role. Do not insert into `auth.users` through SQL.

## Local development
Requires Node 22+.

```bash
npm install
npm run dev
```

## Verification
```bash
npm run qa:static
npm run build
```

`qa:static` validates the Quran metadata and critical workflow guards. A full build must be run in an environment with successful npm registry access.

## Deployment
Deploy the repository to Vercel and configure:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Do not commit `.env.local` or any secret/service-role key.
