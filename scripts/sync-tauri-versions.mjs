#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const SOURCE_MODES = new Set(['newer', 'package', 'cargo']);
const sourceArg = process.argv.find((arg) => arg.startsWith('--source='));
const source = sourceArg ? sourceArg.split('=')[1] : 'cargo';

if (!SOURCE_MODES.has(source)) {
  console.error('Usage: node scripts/sync-tauri-versions.mjs [--source=cargo|package|newer]');
  process.exit(1);
}

const root = process.cwd();
const paths = {
  packageJson: path.join(root, 'package.json'),
  cargoToml: path.join(root, 'src-tauri', 'Cargo.toml'),
};

const PAIRS = [
  { npm: '@tauri-apps/api', cargo: 'tauri' },
  // tauri-build intentionally omitted; user wants to ignore it
  { npm: '@tauri-apps/cli', cargo: 'tauri-build' },
  { npm: '@tauri-apps/plugin-dialog', cargo: 'tauri-plugin-dialog' },
  { npm: '@tauri-apps/plugin-fs', cargo: 'tauri-plugin-fs' },
  { npm: '@tauri-apps/plugin-opener', cargo: 'tauri-plugin-opener' },
  { npm: '@tauri-apps/plugin-sql', cargo: 'tauri-plugin-sql' },
];

const pkg = readPackageJson(paths.packageJson);
const cargo = readFile(paths.cargoToml);

const findings = [];

for (const { npm, cargo: crate } of PAIRS) {
  const pkgEntry = readNpmVersion(pkg, npm);
  const cargoEntry = readCargoVersion(cargo, crate);
  const target = pickTargetVersion(pkgEntry?.clean, cargoEntry);

  if (!target) {
    findings.push({
      npm,
      crate,
      status: 'no-version',
      note: 'No version found on either side; skipping.',
    });
    continue;
  }

  const desiredPkg = pkgEntry ? `${pkgEntry.prefix || '^'}${target}` : null;
  const packageDiff = pkgEntry ? pkgEntry.raw !== desiredPkg : false;
  const cargoDiff = cargoEntry !== target;

  findings.push({
    npm,
    crate,
    npmVersion: pkgEntry?.raw ?? null,
    cargoVersion: cargoEntry,
    target,
    packageAction: pkgEntry
      ? packageDiff
        ? `Would update package.json ${npm} -> ${desiredPkg}`
        : 'Already matches target'
      : 'Not present in package.json',
    cargoAction: cargoEntry
      ? cargoDiff
        ? `Would update Cargo.toml ${crate} -> ${target}`
        : 'Already matches target'
      : 'Not present in Cargo.toml',
  });
}

const pending = findings.filter(
  (f) => f.status === 'no-version' || f.packageAction.startsWith('Would') || f.cargoAction.startsWith('Would'),
);

if (pending.length === 0) {
  console.log('All tracked Tauri versions are already aligned (no changes needed).');
} else {
  console.log('Planned actions (dry-run only):');
  for (const entry of findings) {
    if (entry.status === 'no-version') {
      console.log(`- ${entry.npm}/${entry.crate}: ${entry.note}`);
      continue;
    }
    console.log(`- ${entry.npm} | ${entry.crate}`);
    console.log(`    package.json: ${entry.packageAction}${entry.npmVersion ? ` (current ${entry.npmVersion})` : ''}`);
    console.log(`    Cargo.toml:   ${entry.cargoAction}${entry.cargoVersion ? ` (current ${entry.cargoVersion})` : ''}`);
  }
}

function readPackageJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`Failed to read package.json: ${error.message}`);
    process.exit(1);
  }
}

function readFile(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    console.error(`Failed to read ${file}: ${error.message}`);
    process.exit(1);
  }
}

function readNpmVersion(pkgJson, name) {
  const section = pkgJson.dependencies?.[name] !== undefined
    ? 'dependencies'
    : pkgJson.devDependencies?.[name] !== undefined
      ? 'devDependencies'
      : null;

  if (!section) {
    return null;
  }

  const raw = pkgJson[section][name];
  const [, prefix = '', clean = raw] = raw.match(/^([~^]?)(.*)$/) || [];

  return { raw, prefix, clean, section };
}

function readCargoVersion(content, crate) {
  const escaped = escapeRegex(crate);
  const inline = new RegExp(`^\\s*${escaped}\\s*=\\s*\\{[^\\n}]*?version\\s*=\\s*"([^"]+)"`, 'm');
  const bare = new RegExp(`^\\s*${escaped}\\s*=\\s*"([^"]+)"`, 'm');

  const inlineMatch = content.match(inline);
  if (inlineMatch) {
    return inlineMatch[1];
  }

  const bareMatch = content.match(bare);
  if (bareMatch) {
    return bareMatch[1];
  }

  return null;
}

function setCargoVersion(content, crate, version) {
  let changed = false;
  const escaped = escapeRegex(crate);
  const inline = new RegExp(`^(${escaped}\\s*=\\s*\\{[^\\n}]*?version\\s*=\\s*")([^"]+)(".*?\\}\\s*)$`, 'm');
  const bare = new RegExp(`^(${escaped}\\s*=\\s*")([^"]+)(".*)$`, 'm');

  if (inline.test(content)) {
    content = content.replace(inline, (full, pre, current, post) => {
      if (current === version) {
        return full;
      }
      changed = true;
      return `${pre}${version}${post}`;
    });
  } else if (bare.test(content)) {
    content = content.replace(bare, (full, pre, current, post) => {
      if (current === version) {
        return full;
      }
      changed = true;
      return `${pre}${version}${post}`;
    });
  } else {
    return { content, changed: false };
  }

  return { content, changed };
}

function escapeRegex(text) {
  return text.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function pickTargetVersion(pkgVersion, cargoVersion) {
  if (source === 'package') return pkgVersion || cargoVersion;
  if (source === 'newer') return newerVersion(pkgVersion, cargoVersion);
  // Default: cargo
  return cargoVersion || pkgVersion;
}

function newerVersion(pkgVersion, cargoVersion) {
  if (pkgVersion && !cargoVersion) return pkgVersion;
  if (!pkgVersion && cargoVersion) return cargoVersion;
  if (!pkgVersion && !cargoVersion) return null;

  const comparison = compareSemver(pkgVersion, cargoVersion);
  return comparison >= 0 ? pkgVersion : cargoVersion;
}

function compareSemver(a, b) {
  const va = parseSemver(a);
  const vb = parseSemver(b);

  for (let i = 0; i < Math.max(va.length, vb.length); i += 1) {
    const left = va[i] ?? 0;
    const right = vb[i] ?? 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }

  return 0;
}

function parseSemver(version) {
  const clean = version.replace(/^[~^]/, '');
  return clean.split('.').map((part) => parseInt(part, 10));
}
