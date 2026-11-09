'use client';
// A number box you can actually clear and retype. Converting the value to a
// number on every keystroke (Number('') -> 0, then Math.max(1, …) -> 1) makes
// an empty box snap straight back, so the old digit can never be deleted.
// Here the box keeps exactly what is typed; the minimum is applied when you
// leave the box, and the maximum is never exceeded.
import { useEffect, useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'> & {
  value: number | null | undefined;
  onValue: (n: number) => void;
  min?: number;
  max?: number;
  /** Value used when the box is left empty. Defaults to `min`, else 0. */
  emptyValue?: number;
};

export default function NumberInput({ value, onValue, min, max, emptyValue, onBlur, ...rest }: Props) {
  const [text, setText] = useState(value == null ? '' : String(value));

  // Follow outside changes (e.g. picking a new surah resets the ayah to 1)
  // without fighting what is being typed.
  useEffect(() => {
    setText(prev => (prev !== '' && Number(prev) === value) ? prev : (value == null ? '' : String(value)));
  }, [value]);

  return (
    <input
      {...rest}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={text}
      onChange={e => {
        const raw = e.target.value;
        if (raw === '') { setText(''); return; }
        let n = Number(raw);
        if (!Number.isFinite(n)) return;
        if (max != null && n > max) { n = max; setText(String(max)); } else setText(raw);
        onValue(n);
      }}
      onBlur={e => {
        const fallback = emptyValue ?? min ?? 0;
        let n = text === '' ? fallback : Number(text);
        if (!Number.isFinite(n)) n = fallback;
        if (min != null && n < min) n = min;
        if (max != null && n > max) n = max;
        setText(String(n));
        if (n !== value) onValue(n);
        onBlur?.(e);
      }}
    />
  );
}
