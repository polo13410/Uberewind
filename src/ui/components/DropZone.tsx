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

export function DropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
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

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    accept(await filesFromDrop(e.dataTransfer));
  };

  return (
    <div
      className={`dropzone${over ? ' is-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <p className="big">Déposez ici le fichier .zip de votre export Uber</p>
      <p className="muted">ou plusieurs fichiers .csv, ou le dossier décompressé</p>
      <p>
        <button type="button" className="btn btn-primary" onClick={() => input.current?.click()}>
          Choisir un fichier…
        </button>
      </p>
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept=".zip,.csv,application/zip,text/csv"
        multiple
        aria-label="Choisir le fichier .zip ou les fichiers .csv de l’export Uber"
        tabIndex={-1}
        onChange={(e) => {
          accept([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      {error && (
        <p role="alert" className="muted">
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}
