'use client';
import { useMemo, useState } from 'react';
import QRCode from 'qrcode';

const GREEN = '#0d4537';
const GOLD_TEXT = '#8a611f';
// QR codes always point at the live site, even if printed from a preview deploy.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://aliyumaimuna.com.ng').replace(/\/$/, '');

// Vector QR (one SVG path) so it stays razor sharp in print and in the PDF.
function QrCode({ text, size }: { text: string; size: string }) {
  const path = useMemo(() => {
    const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
    let d = '';
    for (let r = 0; r < modules.size; r++) for (let c = 0; c < modules.size; c++) if (modules.get(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
    return { d, n: modules.size };
  }, [text]);
  return (
    <svg viewBox={`-2 -2 ${path.n + 4} ${path.n + 4}`} style={{ display: 'block', width: size, height: size, background: '#fff' }} shapeRendering='crispEdges' aria-label='Certificate verification QR code'>
      <path d={path.d} fill={GREEN} />
    </svg>
  );
}

function Signature({ person, designation }: { person: any; designation: string }) {
  const hasSignature = typeof person?.signature_data === 'string' && person.signature_data.length > 0;
  return (
    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div style={{ height: '12mm', width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        {hasSignature
          ? <img src={person.signature_data} alt={`${person?.full_name || designation} signature`}
              style={{ display: 'block', maxHeight: '11.5mm', maxWidth: '40mm', objectFit: 'contain' }} />
          : null}
      </div>
      <div style={{ width: '42mm', height: '.3mm', background: 'linear-gradient(90deg, transparent, #b78325 15%, #b78325 85%, transparent)' }} />
      <div style={{ marginTop: '1.2mm', color: GREEN, fontFamily: "'Playfair Display', Georgia, serif", fontSize: '9.5px', fontWeight: 800, lineHeight: 1.2, letterSpacing: '.02em', overflowWrap: 'anywhere' }}>
        {person?.full_name || '—'}
      </div>
      <div style={{ marginTop: '.5mm', color: GOLD_TEXT, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '8px', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', lineHeight: 1.2 }}>
        {designation}
      </div>
    </div>
  );
}

// The printable A4-landscape page. Kept separate from the modal chrome so the
// exact same markup is used for the preview, the print window and any future
// verification page.
export function CertificateSheet({ data }: { data: any }) {
  const a = data.alumni || {};
  const cert = (data.certificates || [])[0] || {};
  const teacher = data.teacher || {};
  const principal = data.principal || {};
  const director = data.director || {};
  const classAtGrad = data.class?.name || '—';
  const photoUrl: string | null = data.student?.photo_url || a.profile_photo_url || null;
  const [logoFailed, setLogoFailed] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  const issuedDate = cert.issued_at
    ? new Date(cert.issued_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';

  const infoItems = [
    { label: 'COHORT', value: a.cohort_name || '—' },
    { label: 'FINAL TERM', value: a.graduation_term || '—' },
    { label: 'CLASS', value: classAtGrad },
    { label: 'CERTIFICATE NO.', value: cert.certificate_number || '—' },
  ];

  return (
    <div
      id="cert-design-a"
      className="cert-sheet relative mx-auto overflow-hidden"
      style={{
        position: 'relative', overflow: 'hidden',
        width: '297mm', height: '210mm', minWidth: '297mm',
        backgroundImage: "url('/images/certificates/certificate-background.webp')",
        backgroundSize: '100% 100%',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#fdf8ec',
        color: '#123d32',
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontVariantNumeric: 'lining-nums',
        isolation: 'isolate',
        printColorAdjust: 'exact',
        WebkitPrintColorAdjust: 'exact',
      } as any}
    >
      {/* Security watermark: the graduate's own photo, faded and desaturated
          behind the text, so the certificate is visibly tied to one person. */}
      {photoUrl && !photoFailed && (
        <img
          src={photoUrl}
          alt=""
          aria-hidden="true"
          onError={() => setPhotoFailed(true)}
          style={{
            position: 'absolute', zIndex: 1, left: '50%', top: '54mm', width: '74mm', height: '74mm',
            transform: 'translateX(-50%)', borderRadius: '50%', objectFit: 'cover',
            filter: 'grayscale(1) contrast(1.15)', opacity: 0.16, mixBlendMode: 'multiply',
          }}
        />
      )}

      {/* Header: official logo + institution name */}
      <div style={{ position: 'absolute', left: '20mm', right: '20mm', top: '4mm', zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ height: '24mm', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {!logoFailed ? (
            <img
              src="/images/branding/amqm-logo-watermark.webp"
              alt="Aliyu and Maimuna Center for Qur'anic Memorization official logo"
              onError={() => setLogoFailed(true)}
              style={{ display: 'block', height: '24mm', width: '24mm', objectFit: 'contain', filter: 'drop-shadow(0 0.4mm 0.8mm rgba(13,69,55,.25))' }}
            />
          ) : (
            <div style={{ color: GREEN, fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 900, fontSize: '36px', letterSpacing: '.16em', border: '.45mm solid #b78325', padding: '2mm 7mm' }}>AMQM</div>
          )}
        </div>
        <div style={{ marginTop: '2mm', color: GREEN, fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 900, fontSize: '15px', letterSpacing: '.14em', lineHeight: 1.3 }}>
          ALIYU AND MAIMUNA CENTER FOR QUR&apos;ANIC MEMORIZATION
        </div>
      </div>

      {/* Main body */}
      <div style={{ position: 'absolute', left: '20mm', right: '20mm', top: '39mm', zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ color: GREEN, fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 800, fontSize: '26px', lineHeight: 1.1, letterSpacing: '.03em' }}>
          QUR&apos;ANIC GRADUATION
        </div>
        <div style={{ color: '#a3701f', fontFamily: "'Great Vibes', cursive", fontSize: '50px', lineHeight: 1 }}>
          Certificate
        </div>
        <div style={{
          marginTop: '4mm', padding: '2mm 11mm',
          background: 'linear-gradient(90deg, #8f601a 0%, #e4bd65 50%, #8f601a 100%)',
          color: '#fffdf3', fontFamily: "'Playfair Display', Georgia, serif", fontSize: '10px', fontWeight: 800, letterSpacing: '.18em',
          clipPath: 'polygon(0 0, 100% 0, 96% 50%, 100% 100%, 0 100%, 4% 50%)',
        }}>
          THIS CERTIFIES THAT
        </div>
        <div style={{
          width: '100%', marginTop: '4.5mm', color: GREEN,
          fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 800, fontStyle: 'italic',
          fontSize: (a.full_name || '').length > 28 ? '32px' : '40px',
          lineHeight: 1.15, overflowWrap: 'anywhere',
        }}>
          {a.full_name || 'Graduate Name'}
        </div>
        <div style={{ width: '62%', height: '.4mm', marginTop: '2mm', background: 'linear-gradient(90deg, transparent, #b78325 20%, #b78325 80%, transparent)' }} />
        <p style={{ maxWidth: '200mm', margin: '4.5mm 0 0', color: '#2a352f', fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '13px', lineHeight: 1.6, fontWeight: 600 }}>
          is hereby recognised as a graduate of the <b style={{ color: GREEN }}>{a.cohort_name || '—'}</b> cohort, having successfully
          completed the Qur&apos;an Memorization Programme at Aliyu and Maimuna Center for Qur&apos;anic Memorization and is
          honoured as a <b style={{ color: GREEN }}>Hafiz / Huffaz of the Holy Qur&apos;an</b> by the school management.
        </p>
        <div style={{
          marginTop: '6mm', width: '82%', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          borderTop: '.35mm solid #c69a4a', borderBottom: '.35mm solid #c69a4a', padding: '2.8mm 0',
        }}>
          {infoItems.map((item, index) => (
            <div key={item.label} style={{ minWidth: 0, padding: '0 2mm', borderRight: index < infoItems.length - 1 ? '.2mm solid #d9c18e' : 'none' }}>
              <div style={{ color: GOLD_TEXT, fontFamily: "'Playfair Display', Georgia, serif", fontSize: '7.5px', fontWeight: 800, letterSpacing: '.1em', lineHeight: 1.3 }}>{item.label}</div>
              <div style={{ marginTop: '1.3mm', color: '#123d32', fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '10.5px', fontWeight: 700, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Medallion, lifted out of the artwork so it can sit in the middle */}
      <img
        src="/images/certificates/certificate-medallion.png"
        alt=""
        aria-hidden="true"
        style={{
          position: 'absolute', zIndex: 3, left: '50%', top: '128mm', width: '24mm', height: 'auto',
          transform: 'translateX(-50%)', filter: 'drop-shadow(0 0.6mm 1.2mm rgba(13,69,55,.28))',
        }}
      />

      {/* Signatures, sitting directly on the paper */}
      <div style={{
        position: 'absolute', zIndex: 4, left: '80mm', right: '80mm', top: '157mm',
        display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '5mm', alignItems: 'end',
      }}>
        <Signature person={teacher} designation={teacher?.job_title || 'Class Teacher'} />
        <Signature person={principal} designation={principal?.job_title || 'Principal'} />
        <Signature person={director} designation={director?.job_title || 'Director'} />
      </div>

      {/* Verification QR, in the clear paper right of the signatures and
          below the mosque, level with the signature row. */}
      {cert.id && (
        <div style={{
          position: 'absolute', zIndex: 4, left: '223mm', top: '156mm', width: '20mm',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <div style={{ padding: '.7mm', background: '#fff', border: '.3mm solid #c69a4a', borderRadius: '1mm', boxShadow: '0 .3mm .8mm rgba(13,69,55,.18)' }}>
            <QrCode text={`${SITE_URL}/verify?ref=${cert.id}`} size="14mm" />
          </div>
          <div style={{ marginTop: '1mm', color: GREEN, fontFamily: "'Playfair Display', Georgia, serif", fontSize: '6.5px', fontWeight: 800, letterSpacing: '.14em', whiteSpace: 'nowrap' }}>
            SCAN TO VERIFY
          </div>
        </div>
      )}

      {/* Certificate number, award date and where to verify, on the cream
          band under the gold swoosh. */}
      <div style={{
        position: 'absolute', zIndex: 4, left: '40mm', right: '40mm', bottom: '6mm', textAlign: 'center', whiteSpace: 'nowrap',
        color: GOLD_TEXT, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '8.5px', fontWeight: 700, letterSpacing: '.12em',
      }}>
        <span style={{ color: GREEN }}>{cert.certificate_number || "AMQM · QUR'ANIC GRADUATION"}</span>
        {issuedDate !== '—' && <>  •  AWARDED {issuedDate.toUpperCase()}</>}
        {cert.id && <>  •  VERIFY AT {SITE_URL.replace(/^https?:\/\//, '').toUpperCase()}/VERIFY</>}
      </div>
    </div>
  );
}

export default function CertificateModal({ data, close }: { data: any; close: () => void }) {
  const a = data.alumni || {};
  const teacher = data.teacher || {};
  const principal = data.principal || {};
  const director = data.director || {};

  function doPrint() {
    const sheet = document.getElementById('cert-design-a');
    if (!sheet) return;
    const printNode = sheet.cloneNode(true) as HTMLElement;
    printNode.querySelectorAll('img').forEach((image) => {
      const src = image.getAttribute('src');
      if (src?.startsWith('/')) image.setAttribute('src', `${window.location.origin}${src}`);
    });
    // The background is set via CSS url(); make it absolute too for the about:blank window.
    printNode.style.backgroundImage = `url('${window.location.origin}/images/certificates/certificate-background.webp')`;
    const html = printNode.outerHTML;
    const fonts = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;0,800;0,900;1,700;1,800&family=Cormorant+Garamond:wght@500;600;700&family=Great+Vibes&display=swap';
    const style = `
      @page { size: A4 landscape; margin: 0; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      html, body { width: 297mm; height: 210mm; margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: #fdf8ec; }
      .cert-sheet { width: 297mm !important; height: 210mm !important; min-width: 297mm !important; margin: 0 !important; overflow: hidden !important; page-break-after: avoid !important; }
    `;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>AMQM Graduation Certificate - ${a.full_name || 'Graduate'}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="${fonts}" rel="stylesheet"><style>${style}</style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    const waitForAssets = async () => {
      if (w.document.fonts?.ready) await w.document.fonts.ready.catch(() => undefined);
      await Promise.all(Array.from(w.document.images).map((image) => {
        if (image.complete) return Promise.resolve();
        return new Promise<void>((resolve) => { image.onload = () => resolve(); image.onerror = () => resolve(); });
      }));
      window.setTimeout(() => { w.focus(); w.print(); }, 1200);
    };
    void waitForAssets();
  }

  return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 p-3 sm:p-5">
    <div className="mx-auto my-3 w-full max-w-[1200px] rounded-2xl bg-white p-3 shadow-2xl sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-emerald-950">Certificate preview · {a.full_name}</h2>
          <p className="text-xs text-slate-500">AMQM · Official Qur&apos;anic Graduation Certificate</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={doPrint}>Print / Save as PDF</button>
          <button className="btn bg-slate-100" onClick={close}>Close</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-slate-100 p-2">
        <CertificateSheet data={data} />
      </div>

      <div className="mt-3 space-y-1 text-xs">
        {!teacher?.signature_data && <div className="rounded bg-amber-50 p-2 text-amber-800">⚠ Class teacher {teacher?.full_name || ''} has not uploaded a signature yet. Signature line shown instead.</div>}
        {!principal?.signature_data && <div className="rounded bg-amber-50 p-2 text-amber-800">⚠ Principal {principal?.full_name || ''} has not uploaded a signature yet. Signature line shown instead.</div>}
        {!director?.signature_data && <div className="rounded bg-amber-50 p-2 text-amber-800">⚠ Director {director?.full_name || ''} has not uploaded a signature yet. Signature line shown instead.</div>}
      </div>
    </div>
  </div>;
}
