'use client';

import { useEffect } from 'react';
import { loadStudents } from '@/lib/live-store';
import { syncStudentFeeAllocations } from '@/lib/admin-management-store';
import { createClient } from '@/lib/supabase/client';

type ExemptStudent = { student_id: string; admission_no?: string | null; full_name?: string | null; reason?: string | null };

const client = () => createClient();

function getTermSelect(): HTMLSelectElement | null {
  const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
  return selects.find((select) => Array.from(select.options).some((option) => option.textContent?.trim() === 'Choose a term')) ?? null;
}

function findStatusGrid(): HTMLElement | null {
  const button = Array.from(document.querySelectorAll('button')).find((el) => el.textContent?.trim() === 'All Students');
  return button?.parentElement instanceof HTMLElement ? button.parentElement : null;
}

function findLedgerRows(): HTMLTableRowElement[] {
  return Array.from(document.querySelectorAll('section table tbody tr')).filter((row): row is HTMLTableRowElement => row instanceof HTMLTableRowElement);
}

function admissionFromRow(row: HTMLTableRowElement): string {
  return (row.cells[1]?.textContent || '').split(/\s+/).filter(Boolean).slice(-1)[0] || '';
}

export default function FinanceExemptionPortal() {
  useEffect(() => {
    if (window.location.pathname !== '/fees') return;

    let active = true;
    let selectedTermId = '';
    let exemptions = new Map<string, ExemptStudent>();
    let studentsByAdmission = new Map<string, any>();
    let statusMode = 'all';

    const loadExemptions = async () => {
      const termSelect = getTermSelect();
      selectedTermId = termSelect?.value || selectedTermId;
      if (!selectedTermId) {
        exemptions = new Map();
        apply();
        return;
      }

      const { data, error } = await client()
        .from('student_fee_exemptions')
        .select('student_id,reason,students:student_id(admission_no,full_name)')
        .eq('term_id', selectedTermId)
        .eq('active', true);

      if (!active || error) {
        if (error && !/student_fee_exemptions/i.test(error.message || '')) console.error(error);
        return;
      }

      exemptions = new Map(
        (data || []).map((row: any) => [
          row.students?.admission_no || row.student_id,
          {
            student_id: row.student_id,
            admission_no: row.students?.admission_no,
            full_name: row.students?.full_name,
            reason: row.reason,
          },
        ])
      );
      apply();
    };

    const setMessage = (message: string) => {
      const messageButtons = Array.from(document.querySelectorAll('button')).filter((el) => el.textContent?.includes('✓ ') || el.textContent?.includes('✕ '));
      if (messageButtons[0]) {
        messageButtons[0].textContent = message;
        return;
      }
      window.dispatchEvent(new CustomEvent('amqm-fee-message', { detail: message }));
    };

    const toggleExemption = async (student: any, button: HTMLButtonElement) => {
      if (!selectedTermId) {
        alert('Choose a term first.');
        return;
      }
      button.disabled = true;
      try {
        const key = student.admissionNo || student.id;
        if (exemptions.has(key)) {
          const { error } = await client()
            .from('student_fee_exemptions')
            .update({ active: false })
            .eq('student_id', student.id)
            .eq('term_id', selectedTermId);
          if (error) throw error;
          await syncStudentFeeAllocations(selectedTermId);
          exemptions.delete(key);
          setMessage(`✓ ${student.name} is no longer exempted for this term.`);
        } else {
          const reason = window.prompt(`Why is ${student.name} exempted from school fees for this term?`);
          if (!reason?.trim()) return;
          const { error } = await client().from('student_fee_exemptions').upsert(
            { student_id: student.id, term_id: selectedTermId, reason: reason.trim(), active: true },
            { onConflict: 'student_id,term_id' }
          );
          if (error) throw error;
          exemptions.set(key, { student_id: student.id, admission_no: student.admissionNo, full_name: student.name, reason: reason.trim() });
          setMessage(`✓ ${student.name} marked exempted for ${termSelectLabel()}.`);
        }
        apply();
      } catch (error: any) {
        setMessage(`✕ ${error?.message || 'Unable to update fee exemption.'}`);
      } finally {
        button.disabled = false;
      }
    };

    const termSelectLabel = () => {
      const select = getTermSelect();
      return select?.selectedOptions?.[0]?.textContent?.trim() || 'this term';
    };

    const decorateRows = () => {
      const rows = findLedgerRows();
      for (const row of rows) {
        const admissionNo = admissionFromRow(row);
        const student = studentsByAdmission.get(admissionNo);
        if (!student || row.cells.length < 10) continue;
        const exempt = exemptions.has(admissionNo);
        const actionCell = row.cells[row.cells.length - 1];
        if (!actionCell) continue;

        const existing = actionCell.querySelector('button[data-fee-exemption]') as HTMLButtonElement | null;
        const button = existing || document.createElement('button');
        button.setAttribute('data-fee-exemption', 'true');
        button.type = 'button';
        button.className = exempt
          ? 'rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2.5 text-[11px] font-black text-amber-300 hover:bg-amber-400/15'
          : 'rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2.5 text-[11px] font-black text-violet-300 hover:bg-violet-500/15';
        button.textContent = exempt ? 'Unexempt' : 'Exempt';
        button.title = exempt ? `Remove fee exemption for ${student.name}` : `Exempt ${student.name} from fees for this term`;
        if (!existing) {
          button.addEventListener('click', () => toggleExemption(student, button));
          actionCell.querySelector('div')?.appendChild(button) || actionCell.appendChild(button);
        }

        const statusCell = row.cells[8];
        const statusPill = statusCell?.querySelector('span');
        if (statusPill && exempt) {
          statusPill.textContent = 'Exempted';
          statusPill.className = 'rounded-full bg-violet-500/15 px-2 py-1 text-[10px] font-black text-violet-300';
        } else if (statusPill && !exempt && statusPill.textContent?.trim() === 'Exempted') {
          statusPill.textContent = 'No fee set';
          statusPill.className = 'rounded-full bg-slate-800 px-2 py-1 text-[10px] font-black text-slate-500';
        }
      }
    };

    const filterRows = () => {
      for (const row of findLedgerRows()) {
        const admissionNo = admissionFromRow(row);
        row.style.display = statusMode === 'exempted' && !exemptions.has(admissionNo) ? 'none' : '';
      }
    };

    const updateExemptedCard = () => {
      const grid = findStatusGrid();
      if (!grid) return;
      grid.classList.remove('md:grid-cols-4');
      grid.classList.add('md:grid-cols-5');
      grid.style.gridTemplateColumns = window.innerWidth >= 768 ? 'repeat(5,minmax(0,1fr))' : '';

      let card = grid.querySelector('button[data-fee-exempted-card]') as HTMLButtonElement | null;
      if (!card) {
        card = document.createElement('button');
        card.setAttribute('data-fee-exempted-card', 'true');
        grid.appendChild(card);
      }
      card.className = `rounded-2xl border border-slate-800 p-4 text-left transition hover:border-slate-700 bg-violet-500/10 text-violet-300 ${statusMode === 'exempted' ? 'ring-2 ring-violet-400/40' : ''}`;
      card.innerHTML = `<div class="text-[11px] font-black uppercase tracking-[0.12em] opacity-70">Exempted</div><div class="mt-1 text-2xl font-black">${exemptions.size}</div><div class="mt-1 text-[10px] opacity-70">No payment required</div>`;
      card.onclick = () => {
        statusMode = statusMode === 'exempted' ? 'all' : 'exempted';
        if (statusMode === 'exempted') {
          const allButton = Array.from(document.querySelectorAll('button')).find((el) => el.textContent?.trim() === 'All Students' && !el.getAttribute('data-fee-exempted-card')) as HTMLButtonElement | undefined;
          allButton?.click();
        }
        filterRows();
        updateExemptedCard();
      };
    };

    const apply = () => {
      if (!active) return;
      updateExemptedCard();
      decorateRows();
      filterRows();
    };

    const bootstrap = async () => {
      try {
        const students = await loadStudents();
        if (!active) return;
        studentsByAdmission = new Map((students || []).map((student: any) => [student.admissionNo, student]));
        await loadExemptions();
        apply();
      } catch (error) {
        console.error('AMQM fee exemption UI failed to initialize', error);
      }
    };

    const termSelect = getTermSelect();
    const onTermChange = () => {
      statusMode = 'all';
      loadExemptions();
    };
    termSelect?.addEventListener('change', onTermChange);

    const resize = () => apply();
    window.addEventListener('resize', resize);
    const observer = new MutationObserver(() => apply());
    observer.observe(document.body, { childList: true, subtree: true });

    bootstrap();
    return () => {
      active = false;
      termSelect?.removeEventListener('change', onTermChange);
      window.removeEventListener('resize', resize);
      observer.disconnect();
    };
  }, []);

  return null;
}
