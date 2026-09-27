'use client';

// AMQM virtual screening room. Uses Jitsi Meet as the video backend so we
// do not have to run our own STUN/TURN infrastructure -- Jitsi's public
// meet.jit.si server handles all the peer-to-peer negotiation across
// Nigerian mobile networks (where symmetric NAT is common and STUN alone
// fails). The screening_token is used verbatim as the Jitsi room name so
// the room is unguessable.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { loadAdmissionScreening } from '@/lib/live-store';

type Screening = any;

export default function ScreeningRoom() {
  const params = useParams<{ token: string }>();
  const search = useSearchParams();
  const role   = search.get('role') === 'interviewer' ? 'interviewer' : 'applicant';
  const [screening, setScreening] = useState<Screening | null>(null);
  const [status,    setStatus]    = useState('Loading secure screening room…');
  const [joined,    setJoined]    = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef       = useRef<any>(null);

  // Load the admission that this token belongs to. If the token is
  // unknown or expired, the user gets a clear message rather than a blank
  // meeting.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const row = await loadAdmissionScreening(params.token);
        if (!alive) return;
        if (!row) { setStatus('This screening link is invalid or has expired.'); return; }
        setScreening(row);
        setStatus('Room ready. Press Start when you are ready to join.');
      } catch (e: any) {
        if (alive) setStatus(e?.message || 'Unable to load the screening room.');
      }
    })();
    return () => { alive = false; };
  }, [params.token]);

  // Room name: prefix so it's namespaced away from any other AMQM
  // schools using meet.jit.si + use the whole screening token so the
  // room name is unguessable.
  const roomName = useMemo(
    () => 'AMQM-Screening-' + String(params.token || '').replace(/[^a-zA-Z0-9]/g, ''),
    [params.token],
  );

  const start = () => {
    if (joined || !screening || !containerRef.current) return;
    setJoined(true);
    setStatus('Joining video call…');

    // Inject the Jitsi external API script exactly once. The script is
    // small (~30 KB) and cached, so subsequent joins are instant.
    const bootstrap = () => {
      const JitsiMeetExternalAPI = (window as any).JitsiMeetExternalAPI;
      if (!JitsiMeetExternalAPI) {
        setStatus('The video service could not be loaded. Check your internet connection and reload the page.');
        setJoined(false);
        return;
      }
      try {
        const displayName = role === 'interviewer'
          ? 'AMQM Interviewer'
          : (screening?.applicant_name || 'Applicant');
        const api = new JitsiMeetExternalAPI('meet.jit.si', {
          roomName,
          parentNode: containerRef.current,
          width: '100%',
          height: '100%',
          userInfo: { displayName },
          configOverwrite: {
            prejoinPageEnabled: false,           // straight into the call
            startWithVideoMuted: false,
            startWithAudioMuted: false,
            disableDeepLinking: true,
            enableWelcomePage: false,
          },
          interfaceConfigOverwrite: {
            DEFAULT_BACKGROUND: '#062d2a',
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            MOBILE_APP_PROMO: false,
            TOOLBAR_BUTTONS: [
              'microphone','camera','tileview','fullscreen',
              'hangup','chat','raisehand','videoquality','settings',
            ],
          },
        });
        apiRef.current = api;
        api.addListener('videoConferenceJoined', () => setStatus('Connected. You are in the call.'));
        api.addListener('participantJoined',    () => setStatus('The other person joined the call.'));
        api.addListener('participantLeft',      () => setStatus('The other person left. They may rejoin.'));
        api.addListener('readyToClose',         () => {
          setStatus('You left the video call. Press Start again to rejoin.');
          setJoined(false);
          try { api.dispose(); } catch {}
          apiRef.current = null;
        });
      } catch (err: any) {
        setStatus('Video call failed to start: ' + (err?.message || 'unknown error'));
        setJoined(false);
      }
    };

    if ((window as any).JitsiMeetExternalAPI) {
      bootstrap();
    } else {
      const script = document.createElement('script');
      script.src   = 'https://meet.jit.si/external_api.js';
      script.async = true;
      script.onload  = bootstrap;
      script.onerror = () => {
        setStatus('Could not load meet.jit.si. Check your internet connection and reload the page.');
        setJoined(false);
      };
      document.body.appendChild(script);
    }
  };

  useEffect(() => {
    return () => {
      try { apiRef.current?.dispose(); } catch {}
      apiRef.current = null;
    };
  }, []);

  if (!screening) {
    return <main className="min-h-screen bg-slate-950 p-5 text-white">
      <div className="mx-auto max-w-3xl pt-16 text-center">
        <div className="text-xs font-black uppercase tracking-[.25em] text-amber-300">AMQM Virtual Screening</div>
        <h1 className="mt-3 text-2xl sm:text-3xl font-black">{status}</h1>
        <p className="mt-3 text-sm text-slate-400">If you were given a new screening link, use that link exactly as provided.</p>
      </div>
    </main>;
  }

  const interview = role === 'interviewer';
  return <main className="min-h-screen bg-slate-100">
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:px-5 sm:py-4">
        <div className="min-w-0">
          <div className="text-[9px] font-black uppercase tracking-[.2em] text-emerald-700">AMQM Virtual Screening</div>
          <h1 className="truncate text-lg sm:text-xl font-black">
            {interview ? 'Interview: ' + screening.applicant_name : 'Your AMQM screening room'}
          </h1>
        </div>
        <div className={(joined ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800') + ' shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black'}>
          {joined ? 'Live' : 'Ready'}
        </div>
      </div>
    </header>

    <div className="mx-auto grid max-w-7xl gap-4 p-3 sm:p-5 lg:grid-cols-[1fr_360px]">
      <section className="relative overflow-hidden rounded-2xl bg-slate-950 shadow-xl sm:rounded-3xl">
        {/* Jitsi mounts its own iframe inside this container. Keep it
            aspect-video on desktop; full-height on mobile. */}
        <div ref={containerRef} className="h-[65vh] w-full sm:h-[70vh]" />
        {!joined && (
          <div className="absolute inset-0 grid place-items-center bg-slate-950/85 p-6 text-center text-white">
            <div>
              <div className="text-4xl">📹</div>
              <div className="mt-3 text-xs font-black uppercase tracking-[.24em] text-amber-300">Ready to join</div>
              <h2 className="mt-2 text-2xl font-black">
                {interview ? 'Interviewer waiting room' : 'Your screening call'}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-300">{status}</p>
              <button onClick={start}
                className="mt-5 rounded-xl bg-emerald-500 px-8 py-3 text-base font-black text-white shadow-lg hover:bg-emerald-400">
                🎥 Start video call
              </button>
              <div className="mt-3 text-[11px] text-slate-400">Allow camera and microphone when your browser asks.</div>
            </div>
          </div>
        )}
      </section>

      <aside className="space-y-4">
        <section className="rounded-2xl bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
          <div className="text-xs font-black uppercase tracking-widest text-emerald-700">Applicant information</div>
          <div className="mt-3 space-y-2.5 text-sm">
            {[
              ['Application', screening.application_no],
              ['Name',        screening.applicant_name],
              ['Date of birth', screening.date_of_birth || '—'],
              ['Gender',      screening.gender || '—'],
              ['State / LGA', (screening.state || '—') + ' / ' + (screening.lga || '—')],
              ['Qur’an level', screening.quran_level || '—'],
              ['Starting point', screening.starting_surah
                ? 'Surah ' + screening.starting_surah + ' : Ayah ' + (screening.starting_ayah || 1)
                : 'Not assigned yet'],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="text-[11px] text-slate-400">{k}</div>
                <div className="break-words font-bold text-slate-900">{v}</div>
              </div>
            ))}
          </div>
        </section>

        {interview && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:rounded-3xl sm:p-5">
            <div className="font-black text-amber-950">Screening decision</div>
            <p className="mt-1 text-xs leading-5 text-amber-900/70">Record the final decision in Admissions Management after the interview.</p>
          </section>
        )}

        <section className="rounded-2xl bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
          <div className="text-xs font-black uppercase tracking-widest text-emerald-700">Room details</div>
          <div className="mt-2 text-xs leading-5 text-slate-500">
            Video powered by Jitsi Meet. If the video fails to load, reload the page and press Start again. Camera and microphone permissions are required.
          </div>
        </section>
      </aside>
    </div>
  </main>;
}
