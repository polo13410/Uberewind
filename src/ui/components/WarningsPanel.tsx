import type { ParseWarning, WarningLevel } from '../../core/types';

const LEVEL: Record<WarningLevel, { icon: string; label: string }> = {
  error: { icon: '⛔', label: 'Erreur' },
  warning: { icon: '⚠️', label: 'Attention' },
  info: { icon: 'ℹ️', label: 'Info' },
};

const ORDER: WarningLevel[] = ['error', 'warning', 'info'];

export function WarningsPanel({ warnings, open }: { warnings: ParseWarning[]; open?: boolean }) {
  if (!warnings.length) return null;
  const sorted = [...warnings].sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level));
  const errors = warnings.filter((w) => w.level === 'error').length;
  const warns = warnings.filter((w) => w.level === 'warning').length;
  const summary = [errors && `${errors} erreur${errors > 1 ? 's' : ''}`, warns && `${warns} avertissement${warns > 1 ? 's' : ''}`]
    .filter(Boolean)
    .join(', ');
  return (
    <details className="warnings" open={open || errors > 0}>
      <summary>
        Avertissements ({warnings.length}){summary ? ` — ${summary}` : ''}
      </summary>
      <ul>
        {sorted.map((w, i) => (
          <li key={i} className={w.level}>
            <span className="lvl">
              <span aria-hidden="true">{LEVEL[w.level].icon}</span> {LEVEL[w.level].label}
            </span>
            <span>
              {w.file && (
                <>
                  <code>{w.file}</code> :{' '}
                </>
              )}
              {w.message}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
