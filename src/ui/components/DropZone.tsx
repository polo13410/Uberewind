import { useRef, useState, type DragEvent } from 'react';

const ACCEPTED = /\.(zip|csv)$/i;

/** Minimal typing of the (non-standard but universal) FileSystem Entry API. */
interface FsEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (ok: (f: File) => void, err: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (e: FsEntry[]) => void, err: (e: unknown) => void) => void };
}

async function walk(entry: FsEntry, out: File[], depth = 0): Promise<void> {
  if (depth > 8) return;
  if (entry.isFile && entry.file) {
    if (!ACCEPTED.test(entry.name)) return;
    const f = await new Promise<File | null>((res) => entry.file!(res, () => res(null)));
    if (f) out.push(f);
  } else if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    // readEntries returns results in batches until an empty batch.
    for (;;) {
      const batch = await new Promise<FsEntry[]>((res) => reader.readEntries(res, () => res([])));
      if (!batch.length) break;
      for (const e of batch) await walk(e, out, depth + 1);
    }
  }
}

/** Files from a drop: plain files, or the content of dropped folders (extracted export). */
async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items]
    .map((it) => (it.kind === 'file' ? ((it as unknown as { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.() ?? null) : null))
    .filter((e): e is FsEntry => e != null);
  if (entries.length && entries.some((e) => e.isDirectory)) {
    const out: File[] = [];
    for (const e of entries) await walk(e, out);
    return out;
  }
  return [...dt.files];
}

const UploadIcon = () => (
  <svg className="dz-icon" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="9" y="5" width="30" height="38" rx="5" fill="none" stroke="currentColor" strokeWidth="2.5" />
    <path d="M24 33V17m0 0-6.5 6.5M24 17l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Main call to action: a large drop target. The whole card is clickable and
 * keyboard-activable (Entrée / Espace) and opens the file picker.
 */
export function DropZone({ onFiles, loading }: { onFiles: (files: File[]) => void; loading?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = (files: File[]) => {
    const ok = files.filter((f) => ACCEPTED.test(f.name));
    if (!ok.length) {
      setError('Aucun fichier .zip ou .csv dans la sélection.');
      return;
    }
    setError(null);
    onFiles(ok);
  };

  const open = () => !loading && input.current?.click();

  return (
    <div
      className={`dropzone${over ? ' is-over' : ''}${loading ? ' is-loading' : ''}`}
      role="button"
      tabIndex={loading ? -1 : 0}
      aria-label="Déposer ou choisir le fichier .zip de votre export Uber"
      aria-busy={!!loading}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        if (!loading) accept(await filesFromDrop(e.dataTransfer));
      }}
    >
      {loading ? (
        <div className="dz-body" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p className="dz-title">Lecture en cours…</p>
          <p className="dz-sub">{loading}</p>
        </div>
      ) : (
        <div className="dz-body">
          <UploadIcon />
          <p className="dz-title">{over ? 'Vous pouvez relâcher' : 'Glissez votre export Uber ici'}</p>
          <p className="dz-sub">le .zip tel quel, les fichiers .csv ou le dossier décompressé</p>
          <span className="dz-cta">Choisir le fichier</span>
        </div>
      )}
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept=".zip,.csv,application/zip,text/csv"
        multiple
        aria-label="Choisir le fichier .zip ou les fichiers .csv de l’export Uber"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          accept([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      {error && (
        <p role="alert" className="dz-error">
          {error}
        </p>
      )}
    </div>
  );
}
