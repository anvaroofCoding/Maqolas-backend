/**
 * Windows: berilgan portni band qilgan jarayonni to'xtatadi.
 * Usage: node scripts/kill-port.mjs 8000
 */
import { execSync } from 'child_process';

const port = process.argv[2] ?? '8000';

try {
  const out = execSync(`netstat -ano | findstr ":${port}.*LISTENING"`, {
    encoding: 'utf8',
  });

  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    const m = line.trim().match(/LISTENING\s+(\d+)\s*$/);
    if (m) pids.add(m[1]);
  }

  if (pids.size === 0) {
    console.log(`Port ${port} bo'sh.`);
    process.exit(0);
  }

  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'inherit' });
      console.log(`Port ${port}: PID ${pid} to'xtatildi.`);
    } catch {
      console.warn(`PID ${pid} to'xtatilmadi (allaqachon yopilgan bo'lishi mumkin).`);
    }
  }
} catch {
  console.log(`Port ${port} bo'sh.`);
}
