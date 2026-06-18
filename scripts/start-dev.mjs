#!/usr/bin/env node
/**
 * Dev startup script — compiles server.ts with esbuild (local-bundle, external packages)
 * then runs the result with plain node to avoid tsx/Vite ESM loader conflicts.
 */
import { build } from 'esbuild';
import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';

const OUT = 'server.mjs';

console.log('[dev] Compiling server.ts with esbuild…');
try {
  await build({
    entryPoints: ['server.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: OUT,
    target: 'node22',
    packages: 'external',
    logLevel: 'warning',
  });
  console.log('[dev] Compiled OK → ' + OUT);
} catch (e) {
  console.error('[dev] esbuild failed:', e.message);
  process.exit(1);
}

const child = spawn('node', [OUT], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
