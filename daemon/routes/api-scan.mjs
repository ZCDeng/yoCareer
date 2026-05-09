// yoCareer v2 — POST /api/scan (spawns a scan task_run).
//
// The scan itself is executed by a worker that invokes scan.mjs as a child
// process. This avoids duplicating 1100+ LOC of scanning logic inside the
// daemon while still providing progress tracking + cancellation.
//
// Request body:
//   { company?: string, dryRun?: boolean }
//
// Response:
//   { task_id: string, status: 'running' }

import { runCancellable } from '../lib/task-runner.mjs';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const SCAN_SCRIPT = resolve(ROOT, 'scan.mjs');

export function handleScan(req, ctx) {
  const body = req.body || {};
  const args = [];
  if (body.dryRun) args.push('--dry-run');
  if (body.company) args.push('--company', String(body.company));

  const taskId = runCancellable(
    ctx.db,
    ctx.broadcaster,
    'scan',
    { payload: body },
    async (tools) => {
      await tools.progress(0, 'Initializing scan worker');

      return new Promise((resolveWork, rejectWork) => {
        const child = spawn(process.execPath, [SCAN_SCRIPT, ...args, '--json-output'], {
          cwd: ROOT,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr += chunk; });

        child.on('error', rejectWork);
        child.on('close', async (code) => {
          if (code !== 0) {
            rejectWork(new Error(`scan.mjs exited ${code}: ${stderr.slice(0, 500)}`));
            return;
          }

          // Try to parse JSON result from last non-empty stdout line
          let result = null;
          const lines = stdout.split('\n').filter(l => l.trim());
          for (let i = lines.length - 1; i >= 0; i--) {
            try { result = JSON.parse(lines[i]); break; }
            catch { /* not JSON */ }
          }

          await tools.progress(1, 'Scan complete');
          resolveWork(result || { scanned: true, stdout_lines: lines.length });
        });

        // Poll for cancellation and kill child if requested
        const cancelPoll = setInterval(async () => {
          try {
            await tools.checkpoint();
          } catch {
            clearInterval(cancelPoll);
            try { child.kill('SIGTERM'); } catch {}
            setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 2000);
          }
        }, 1000);
      });
    },
  );

  return { status: 202, body: { task_id: taskId, status: 'running' } };
}
