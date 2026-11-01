import { MAX_FILE_BYTES } from './schema';
import type { Preview } from './types';
import type { WorkerResponse } from './worker';

export async function readLocalVeoFile(file: File, signal: AbortSignal): Promise<{ preview: Preview; hash: string }> {
  if (!/\.xlsx$/i.test(file.name) || file.size === 0 || file.size > MAX_FILE_BYTES) throw new Error('Selecciona un archivo .xlsx no vacío de hasta 10 MB.');
  const buffer = await file.arrayBuffer();
  if (signal.aborted) throw new DOMException('Análisis cancelado.', 'AbortError');
  if (!crypto.subtle) throw new Error('Abre la aplicación en localhost o HTTPS para verificar el archivo local.');
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (signal.aborted) throw new DOMException('Análisis cancelado.', 'AbortError');
  const preview = await new Promise<Preview>((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const finish = () => { worker.terminate(); clearTimeout(timeout); signal.removeEventListener('abort', abort); };
    const abort = () => { finish(); reject(new DOMException('Análisis cancelado.', 'AbortError')); };
    const timeout = setTimeout(() => { finish(); reject(new Error('El análisis ha superado 30 segundos. Comprueba el tamaño y la estructura del libro.')); }, 30000);
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      finish();
      if (event.data.ok) resolve(event.data.preview);
      else reject(new Error(event.data.message));
    };
    worker.onerror = () => { finish(); reject(new Error('No se pudo iniciar o completar el análisis local del Excel.')); };
    worker.onmessageerror = () => { finish(); reject(new Error('No se pudo recuperar el resultado del análisis.')); };
    worker.postMessage(buffer, [buffer]);
  });
  return { preview, hash };
}
