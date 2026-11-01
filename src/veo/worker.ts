import { parseVeoBuffer } from './parser';
import type { Preview } from './types';

export type WorkerResponse = { ok: true; preview: Preview } | { ok: false; message: string };
const scope = self as unknown as {
  onmessage: (event: MessageEvent<ArrayBuffer>) => void;
  postMessage: (response: WorkerResponse) => void;
};
scope.onmessage = event => {
  try { scope.postMessage({ ok: true, preview: parseVeoBuffer(event.data) }); }
  catch (error) { scope.postMessage({ ok: false, message: error instanceof Error ? error.message : 'No se pudo leer el libro Excel.' }); }
};
