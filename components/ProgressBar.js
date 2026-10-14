'use client';

export default function ProgressBar({ value, max, label, className = '' }) {
  const safeMax = Math.max(1, Number(max) || 1);
  const safeValue = Math.min(safeMax, Math.max(0, Number(value) || 0));
  const percent = Math.round((safeValue / safeMax) * 100);
  return (
    <div
      className={`progress-track ${className}`.trim()}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={safeValue}
      aria-valuetext={`${safeValue} of ${safeMax}`}
    >
      <span className="progress-fill" style={{ width: `${percent}%` }} />
    </div>
  );
}
