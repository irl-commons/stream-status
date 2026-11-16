// Exercise the tarball without the repository's sources or dependencies.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'stream-status-package-'));
try {
  const [pack] = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', dir], { cwd: root, encoding: 'utf8' }));
  const files = pack.files.map(f => f.path);
  for (const required of ['LICENSE', 'README.md', 'package.json', 'dist/src/index.js', 'dist/src/index.d.ts', 'dist/src/cli.js']) assert.ok(files.includes(required), required);
  assert.ok(files.every(f => ['LICENSE', 'README.md', 'package.json'].includes(f) || f.startsWith('dist/src/')), files.join('\n'));
  const scope = join(dir, 'node_modules/@irl-commons');
  mkdirSync(scope, { recursive: true });
  execFileSync('tar', ['-xzf', join(dir, pack.filename), '-C', scope]);
  renameSync(join(scope, 'package'), join(scope, 'stream-status'));
  const pkg = join(scope, 'stream-status');
  const metadata = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
  assert.equal(metadata.version, '0.1.0');
  assert.equal(metadata.type, 'module');
  writeFileSync(join(dir, 'smoke.mjs'), `import assert from 'node:assert/strict';
import { Reader, validate, CODES } from '@irl-commons/stream-status';
assert.equal(typeof Reader, 'function');
assert.ok(validate({}).length > 0);
assert.equal(CODES.CAPTURE_SIGNAL_LOST, 'capture.signal_lost');
assert.equal(new Reader().view().fresh, false);
`);
  execFileSync(process.execPath, [join(dir, 'smoke.mjs')], { stdio: 'inherit' });
  writeFileSync(join(dir, 'consumer.mts'), `import { Reader, validate, type Snapshot } from '@irl-commons/stream-status';\nconst reader = new Reader();\nconst check = (snapshot: Snapshot) => validate(snapshot);\nreader.view();\n`);
  execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--ignoreConfig', '--noEmit', '--strict', '--module', 'nodenext', '--target', 'es2022', join(dir, 'consumer.mts')], { stdio: 'inherit' });
  const fixture = fileURLToPath(new URL('../../../docs/examples/2-camera-lost.json', import.meta.url));
  const output = execFileSync(process.execPath, [join(pkg, metadata.bin['stream-status']), 'inspect', fixture], { encoding: 'utf8' });
  assert.match(output, /valid snapshot/);
  console.log('Packed ESM import, declarations, CLI and file allowlist pass.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
