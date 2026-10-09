import { fmtDate } from '../lib/format';

/**
 * A native date picker that always *shows* the date as "Sun 4 Oct", whatever the
 * phone's locale (some show 10/04/2026, which reads as 10 April in Ghana).
 * The real <input type="date"> sits invisibly on top, so tapping it opens the
 * phone's own calendar.
 */
export function DateInput({
  value,
  onChange,
  min,
  max,
  id,
  required,
  placeholder = 'Pick a date',
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  id?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <span className="date-pick">
      <span className={`date-text ${value ? '' : 'empty'}`} aria-hidden>
        {value ? fmtDate(value, 'day') : placeholder}
      </span>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch {
            /* older browsers: the native control still works */
          }
        }}
      />
    </span>
  );
}
