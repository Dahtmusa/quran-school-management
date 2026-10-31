'use client';
// Admin landing page. One pattern throughout: a scorecard of
// "what needs your attention now" tiles that each lead to one CTA.
// Mirrors the Digital School Launch Readiness aesthetic the admin
// liked. Everything else moved to its dedicated page.
import Link from 'next/link';
import AdminShell from '@/components/AdminShell';
import {
  loadEvaluations, loadStudents, loadStaffProfiles, loadAdminDashboardSnapshot, loadDigitalLaunchReadiness
} from '@/lib/live-store';
import { loadCMSSettings } from '@/lib/cms-live-store';
import { useEffect, useState } from 'react';

type Readiness = Record<string, number | boolean | null | undefined>;

function PriorityTile({ title, value, status, cta, href, note }:
  { title: string; value: string; status: 'ok' | 'warn' | 'alert' | 'neutral'; cta: string; href: string; note?: string }) {
  const tone =
    status === 'ok'     ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
  : status === 'warn'   ? 'border-amber-200 bg-amber-50 text-amber-900'
  : status === 'alert'  ? 'border-rose-200 bg-rose-50 text-rose-900'
  :                       'border-slate-200 bg-white text-slate-900';
  const btn =
    status === 'ok'     ? 'bg-emerald-700 text-white hover:bg-emerald-800'
  : status === 'warn'   ? 'bg-amber-600  text-white hover:bg-amber-700'
  : status === 'alert'  ? 'bg-rose-600   text-white hover:bg-rose-700'
  :                       'bg-slate-900  text-white hover:bg-slate-800';
  return <div className={`flex flex-col rounded-2xl border-2 p-5 ${tone}`}>
    <div className="text-[10px] font-black uppercase tracking-wider opacity-70">{title}</div>
    <div className="mt-1 text-3xl font-black">{value}</div>
    {note && <div className="mt-1 text-[11px] opacity-80">{note}</div>}
    <Link href={href} className={`mt-4 inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-black transition ${btn}`}>
      {cta} →
    </Link>
  </div>;
}

export default function AdminDashboard() {
  const [snapshot, setSnapshot] = useState<any>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [settings, setSettings]   = useState<any>({});
  const [studentCount, setStudentCount] = useState<number>(0);
  const [staffCount, setStaffCount]     = useState<number>(0);
  const [pendingEvals, setPendingEvals] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      loadStudents(), loadEvaluations(), loadStaffProfiles(),
      loadCMSSettings(), loadAdminDashboardSnapshot(), loadDigitalLaunchReadiness(),
    ]).then(([s, e, st, ss, d, r]) => {
      setStudentCount(s.length);
      setStaffCount(st.filter((p: any) => p.employment_status === 'active' && p.role !== 'parent').length);
      setPendingEvals(e.filter((ev: any) => ev.status === 'Pending Approval').length);
      setSettings(ss);
      setSnapshot(d);
      setReadiness(r as Readiness);
    }).finally(() => setLoading(false));
  }, []);

  const currency = settings.currency?.symbol || '₦';
  const expected    = Number(snapshot?.fees_due ?? 0);
  const collected   = Number(snapshot?.fees_paid ?? 0);
  const outstanding = Math.max(0, expected - collected);
  const collectRate = expected ? Math.round((collected / expected) * 100) : 0;
  const presentToday = Number(snapshot?.attendance_present_today ?? 0);
  const recordedToday = Number(snapshot?.attendance_today ?? 0);
  const totalActive = Number(snapshot?.students ?? studentCount);
  const attRate = totalActive ? Math.round((presentToday / totalActive) * 100) : 0;

  const parentLinksMissing = Number(readiness?.students_without_parent_link ?? 0);
  const ready = Boolean(readiness?.ready);

  return <AdminShell title="Admin Dashboard">
    <div className="space-y-6">
      {/* Hero. Short and quiet. The scorecard carries the detail. */}
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#06372f] via-emerald-900 to-[#a77d25] p-6 text-white shadow-xl md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[.24em] text-amber-300">AMQM Control Center</div>
            <h2 className="mt-1 text-3xl font-black sm:text-4xl">Here's what's due today.</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-emerald-50/80">
              {snapshot?.term?.name ? `${snapshot?.term?.name} · ` : ''}
              {totalActive} active students · {staffCount} active staff
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 px-5 py-3 text-sm backdrop-blur-sm ring-1 ring-white/15">
            <div className="text-[10px] font-black uppercase tracking-wider text-amber-200">Digital launch</div>
            <div className="mt-1 text-xl font-black">{ready ? 'Ready' : 'Not yet'}</div>
            <Link href="/calendar" className="mt-1 inline-block text-[11px] font-bold text-amber-200 hover:text-white">Launch control →</Link>
          </div>
        </div>
      </section>

      {/* Today's priority scorecard. Each tile == one thing to act on. */}
      <section>
        <h3 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">Priorities</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <PriorityTile
            title="Pending reviews"
            value={String(pendingEvals)}
            note={pendingEvals ? 'Teachers waiting for approval' : 'No reviews waiting'}
            status={pendingEvals > 0 ? 'warn' : 'ok'}
            cta={pendingEvals > 0 ? 'Review now' : 'Open evaluations'}
            href="/evaluations"
          />
          <PriorityTile
            title="Outstanding fees"
            value={`${currency}${outstanding.toLocaleString()}`}
            note={expected ? `${collectRate}% collection rate` : 'No fees configured'}
            status={outstanding > expected * 0.5 ? 'alert' : outstanding > 0 ? 'warn' : 'ok'}
            cta="Open finance"
            href="/fees"
          />
          <PriorityTile
            title="Attendance today"
            value={recordedToday ? `${presentToday}/${totalActive}` : '—'}
            note={recordedToday ? `${attRate}% present` : 'Not marked yet today'}
            status={recordedToday === 0 ? 'alert' : attRate >= 90 ? 'ok' : 'warn'}
            cta="Open attendance"
            href="/attendance"
          />
          <PriorityTile
            title="Admissions pipeline"
            value={String(snapshot?.pending_admissions ?? 0)}
            note="Applicants awaiting a decision"
            status={Number(snapshot?.pending_admissions ?? 0) > 0 ? 'warn' : 'neutral'}
            cta="Open admissions"
            href="/admissions/manage"
          />
        </div>
      </section>

      {/* Launch readiness -- the admin liked this exact card. */}
      <section className="card p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-black">Digital school launch readiness</h2>
            <p className="mt-1 text-sm text-slate-500">The system will not start Second Term until the historical baseline and required operational setup are complete.</p>
          </div>
          <Link href="/calendar" className="btn bg-slate-100">Open launch control →</Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Ready label="Historical baseline"      value={`${readiness?.baseline_rows ?? 0}/${readiness?.active_students ?? 0}`}            ok={Number(readiness?.missing_baseline ?? 1) === 0} />
          <Ready label="Second-Term fees"         value={String(readiness?.second_term_fee_structures ?? 0)}                               ok={Number(readiness?.second_term_fee_structures ?? 0) >= 2} />
          <Ready label="Evaluation windows"       value={`${readiness?.second_term_evaluation_windows ?? 0}/3`}                            ok={Number(readiness?.second_term_evaluation_windows ?? 0) === 3} />
          <Ready label="Second-Term enrolment"    value={`${readiness?.second_term_enrollments ?? 0}/${readiness?.active_students ?? 0}`} ok={Number(readiness?.missing_second_term_enrollments ?? 1) === 0} />
        </div>
        <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm">
          <b>{ready ? 'Ready for digital launch' : 'Not ready for digital launch yet.'}</b>
          {parentLinksMissing > 0 && <span className="text-slate-500"> Parent links still missing for {parentLinksMissing} active students; this is a warning, not an academic/finance launch blocker.</span>}
        </div>
      </section>

      {!loading && null /* placeholder in case we want a last section later */}
    </div>
  </AdminShell>;
}

function Ready({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div className={`rounded-2xl border p-4 ${ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
    <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</div>
    <div className={`mt-1 text-2xl font-black ${ok ? 'text-emerald-800' : 'text-amber-900'}`}>{value}</div>
    <div className={`mt-1 text-xs font-bold ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>{ok ? 'Ready' : 'Needs setup'}</div>
  </div>;
}
