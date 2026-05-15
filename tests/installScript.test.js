const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const INSTALL = path.join(ROOT, 'scripts', 'install.sh');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'readlens-install-'));
}

test('install script creates readlens and agent-reader command aliases in the target bin dir', () => {
  const temp = makeTempDir();
  const binDir = path.join(temp, 'bin');
  const homeDir = path.join(temp, 'home');
  fs.mkdirSync(homeDir, { recursive: true });

  const result = spawnSync('bash', [INSTALL, '--bin-dir', binDir, '--no-shell-rc'], {
    cwd: ROOT,
    env: { ...process.env, HOME: homeDir },
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.realpathSync(path.join(binDir, 'readlens')), path.join(ROOT, 'bin', 'readlens'));
  assert.equal(fs.realpathSync(path.join(binDir, 'agent-reader')), path.join(ROOT, 'bin', 'agent-reader'));
});

test('install script can append a managed shell alias block', () => {
  const temp = makeTempDir();
  const binDir = path.join(temp, 'bin');
  const homeDir = path.join(temp, 'home');
  fs.mkdirSync(homeDir, { recursive: true });

  const result = spawnSync('bash', [INSTALL, '--bin-dir', binDir], {
    cwd: ROOT,
    env: { ...process.env, HOME: homeDir, SHELL: '/bin/zsh' },
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const zshrc = fs.readFileSync(path.join(homeDir, '.zshrc'), 'utf8');
  assert.match(zshrc, /# >>> ReadLens CLI >>>/);
  assert.match(zshrc, new RegExp(`export PATH=['\"]?${binDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['\"]?:\\$PATH`));
  assert.match(zshrc, /alias readlens=/);
  assert.match(zshrc, /alias agent-reader=/);
});

test('installed readlens alias runs from outside the project directory', () => {
  const temp = makeTempDir();
  const binDir = path.join(temp, 'bin');
  const homeDir = path.join(temp, 'home');
  fs.mkdirSync(homeDir, { recursive: true });

  const install = spawnSync('bash', [INSTALL, '--bin-dir', binDir, '--no-shell-rc'], {
    cwd: ROOT,
    env: { ...process.env, HOME: homeDir },
    encoding: 'utf8'
  });
  assert.equal(install.status, 0, install.stderr || install.stdout);

  const result = spawnSync(path.join(binDir, 'readlens'), ['--help'], {
    cwd: temp,
    env: { ...process.env, HOME: homeDir },
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /ReadLens bridge/);
});
