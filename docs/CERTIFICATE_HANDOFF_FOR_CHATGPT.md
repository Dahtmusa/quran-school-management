# AMQM Qur'anic Graduation Certificate — Design Handoff Brief

**Give this entire document to ChatGPT. It is intentionally restrictive. Do not relax any of the "DO NOT" rules.**

**GitHub repository:** https://github.com/Dahtmusa/quran-school-management

ChatGPT: start by browsing the repo on `main`. The file you will replace is at
https://github.com/Dahtmusa/quran-school-management/blob/main/src/app/admin/alumni/page.tsx
Open it, scroll to the `CertificateModal` function at the bottom, and only touch that function. The official school logo you must use is already in the repo at
https://github.com/Dahtmusa/quran-school-management/blob/main/public/images/branding/amqm-logo-watermark.webp

Return your work as a single pull-requestable patch to `src/app/admin/alumni/page.tsx` and (optional) new asset files under `public/images/certificates/`. Nothing else.

---

## Your job (ChatGPT)

Redesign the AMQM graduation certificate's **visual layout only**. You are rebuilding one React component. You are NOT changing database logic, data flow, routing, auth, or any other feature.

Deliverable: a drop-in replacement for the `CertificateModal` React component inside this one file:

```
src/app/admin/alumni/page.tsx
```

The component must stay a React functional component, must still accept the same `{ data, close }` props, must still render using the same dynamic fields listed below, and must still print on A4 landscape.

---

## STRICT SCOPE — read before touching anything

### Files you MAY edit

- `src/app/admin/alumni/page.tsx` — but only the `CertificateModal` function at the bottom of the file. Nothing above it.
- You may add new files under `public/images/certificates/` for images (background art, decorative PNG/SVG assets).
- You may add new CSS or JSON files under `src/app/admin/alumni/certificate-assets/` if you want to.

### Files you MUST NOT edit (full list)

- Anything under `supabase/migrations/`
- Anything under `supabase/functions/`
- Any other file under `src/` outside the one line above
- `src/lib/live-store.ts` — do NOT touch
- `src/lib/nav-links.ts` — do NOT touch
- Any component under `src/components/`
- Any file under `src/app/` except `src/app/admin/alumni/page.tsx`
- `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.js`
- Any file under `.github/`, `scripts/`, or the repo root config files

### Things you MUST NOT do

- Do NOT add new database tables, RPCs, columns or policies
- Do NOT change the data contract (field names, shapes, nesting)
- Do NOT change how signatures are fetched — they are already pulled from existing staff profiles via the backend; just render them
- Do NOT invent a new upload or management system for signatures
- Do NOT change the certificate numbering format (currently `AMQM/GRAD/YYYY/NNNN` — generated server side)
- Do NOT change nav links, menu entries, or any routing
- Do NOT rename the component or change its props signature
- Do NOT remove the print button or the close button
- Do NOT add external dependencies without listing them explicitly (this project is Next 16 + React 19 + Tailwind 4; prefer inline SVG and Google Fonts over new packages)
- Do NOT replace the real school logo. The existing path is `/images/branding/amqm-logo-watermark.webp` and must be used as the official logo. Do not generate a different logo and do not swap it with a generic Islamic emblem.

---

## Component contract (do not change)

```tsx
function CertificateModal({ data, close }: { data: any; close: () => void }) {
  // existing print pipeline — keep it (or improve it, but keep the API)
  function doPrint() { /* opens new window, prints element id="cert-design-a" */ }

  // Field accessors you MUST use (do not rename, do not restructure):
  const a         = data.alumni    || {};  // the alumni_profiles row
  const cert      = (data.certificates || [])[0] || {};
  const teacher   = data.teacher   || {};  // class teacher
  const principal = data.principal || {};
  const director  = data.director  || {};
  const classAtGrad = data.class?.name || '—';

  return <div className="fixed inset-0 z-50 ...">
    {/* Preview chrome: title + Print button + Close button */}
    {/* The sheet itself must have id="cert-design-a" */}
    <div id="cert-design-a" className="cert-sheet relative mx-auto overflow-hidden"
         style={{ width: '297mm', height: '210mm' }}>
      {/* Your design goes here. Must honour A4 landscape dimensions. */}
    </div>
    {/* Warning messages for missing signatures */}
  </div>;
}
```

### Available data fields

```ts
data = {
  alumni: {
    full_name: string,                 // e.g. "Abdullahi Iliyasu Mu'azu"
    graduation_year: number,           // e.g. 2026
    cohort_name: string,               // e.g. "2026/27"
    graduation_term: string,           // e.g. "Second Term"
    final_quran_position: string,      // e.g. "Surah 114, Ayah 6"
    profile_photo_url: string | null,
    completion_percentage: number,     // 100
  },
  certificates: [{
    certificate_number: string,        // "AMQM/GRAD/2026/0001"
    issued_at: string,                 // "2026-11-02"
    status: 'issued',
  }],
  teacher: {
    full_name: string,
    job_title: string,                 // "Quran Teacher"
    signature_data: string | null,     // base64 data URL for <img src=...>
  },
  principal: {
    full_name: string,
    job_title: string,                 // "Principal"
    signature_data: string | null,
  },
  director: {
    full_name: string,
    job_title: string,                 // "Director"
    signature_data: string | null,
  },
  class: { id: string, name: string }, // e.g. { name: "Shu'batu Imam Nafi" }
}
```

Each signature must:
- Render as `<img src={person.signature_data} ... />` when `signature_data` is a non-null string (already a `data:image/...;base64,...` URL).
- Fall back to a plain horizontal line when `signature_data` is null. **Never substitute another person's signature.** Never put placeholder art in the signature slot.
- Appear above the person's printed name and designation.

---

## Design brief (what to actually build)

Use the attached ChatGPT reference image as your primary visual inspiration — the hanging lanterns, scalloped frame, mosque silhouette, Qur'an on wooden stand, Islamic geometric pattern, emerald + royal gold + ivory palette, elegant serif + script typography.

### Hard requirements

- **A4 landscape**, exact 297mm × 210mm sheet.
- **Official AMQM logo** at top, from `/images/branding/amqm-logo-watermark.webp`. Do not generate a different one.
- Full institution name: **ALIYU AND MAIMUNA CENTER FOR QUR'ANIC MEMORIZATION**.
- Main heading: **QUR'ANIC GRADUATION CERTIFICATE** (two lines, "Certificate" in script).
- "This certifies that" element.
- Student full name as the clear visual centrepiece.
- Statement: *"is hereby recognised as a graduate of the [cohort] cohort, having successfully completed the Qur'an Memorization Programme at Aliyu and Maimuna Center for Qur'anic Memorization and is honoured as a Hafiz / Huffaz of the Holy Qur'an by the school management."*
- Info section: Cohort · Final Term · Class · Certificate No. · Date of Award.
- Gold embossed seal / medallion featuring an open Qur'an + laurel wreath.
- **Three signature slots horizontally at the bottom**: Class Teacher · Principal · Director. Each with the signature image (or line fallback), name, and designation.
- Prints with no clipping. Save-as-PDF from Chrome must match the preview.

### Palette

- Deep emerald green `#063b32` (or similar)
- Royal metallic gold `#b78325` → `#d4a24a` → `#f3cf74`
- Warm ivory / cream `#fffbee`
- Dark emerald typography

### Allowed approaches (pick one)

1. **Pure inline SVG + CSS** — most reliable for printing, no asset management.
2. **One high-res PNG/WebP background image** placed under `public/images/certificates/certificate-background.webp`, with dynamic text overlaid at exact mm coordinates. You generate the background image yourself; it must have **no mock text, no watermarks, no "Recommended" badges**.
3. **A mix**: a background image for the ornate frame/illustrations + SVG for crisp line art.

Whatever approach you choose, dynamic text **must sit on top as real HTML**, never baked into the image, so the student name, cohort, cert number and signatures update correctly for every alumni.

### Must look like

- An internationally recognised Islamic institution's graduation certificate.
- Printable on premium ivory paper and worth framing.

### Must NOT look like

- A generic AI certificate template.
- Cartoonish Islamic art.
- Overcrowded information.
- Cheap gradients or blurry logos.
- Mock text left in the design.

---

## Print pipeline (keep working)

- Clicking "Print / Save as PDF" opens a new window containing the certificate HTML and applies `@page { size: A4 landscape; margin: 0; }`.
- All colours and background art must survive printing (use `-webkit-print-color-adjust: exact; print-color-adjust: exact;` on `*`).
- Any Google Fonts you use must be linked in the print window's `<head>`.
- Wait at least 1.5s before calling `window.print()` so fonts load.

---

## How to verify your work before handing back

1. Open `/admin/alumni` → Confirmed tab → click **Certificate** on any alumni.
2. Preview must render identically to intended design, with the alumni's real name, cohort, cert number.
3. Click **Print / Save as PDF** → saved PDF must match the preview byte-for-byte (no clipping, no missing images, no font fallback).
4. Repeat for an alumni whose teacher has no `signature_data` → signature slot shows a plain line, not another signature.
5. `npx tsc --noEmit` must pass with zero new errors.
6. The admin page's other tabs (Potential, Confirmed, dossier modal, promote modal) must still work exactly as before — because you did not touch them.

---

## Hand back

- The updated `src/app/admin/alumni/page.tsx` (full file).
- Any new asset files you added under `public/images/certificates/`.
- A one-paragraph note on how to verify the PDF print output.

That is all. Do not change anything else.
