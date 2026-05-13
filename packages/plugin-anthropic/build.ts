#!/usr/bin/env bun

const externalDeps = ['@ai-sdk/anthropic', '@elizaos/core', 'ai', 'jsonrepair'];

async function build() {
  const totalStart = Date.now();

  // Node build
  const nodeStart = Date.now();
  console.log('🔨 Building @elizaos/plugin-anthropic for Node...');
  await Bun.build({
    entrypoints: ['src/index.node.ts'],
    outdir: 'dist/node',
    target: 'node',
    format: 'esm',
    sourcemap: 'external',
    minify: false,
    external: [...externalDeps, 'undici'],
  });
  console.log(`✅ Node build complete in ${((Date.now() - nodeStart) / 1000).toFixed(2)}s`);

  // Browser build
  const browserStart = Date.now();
  console.log('🌐 Building @elizaos/plugin-anthropic for Browser...');
  await Bun.build({
    entrypoints: ['src/index.browser.ts'],
    outdir: 'dist/browser',
    target: 'browser',
    format: 'esm',
    sourcemap: 'external',
    minify: false,
    // Bundle jsonrepair in the browser build
    external: externalDeps.filter((dep) => dep !== 'jsonrepair'),
  });
  console.log(`✅ Browser build complete in ${((Date.now() - browserStart) / 1000).toFixed(2)}s`);

  // Node CJS build
  const cjsStart = Date.now();
  console.log('🧱 Building @elizaos/plugin-anthropic for Node (CJS)...');
  const cjsResult = await Bun.build({
    entrypoints: ['src/index.node.ts'],
    outdir: 'dist/cjs',
    target: 'node',
    format: 'cjs',
    sourcemap: 'external',
    minify: false,
    external: [...externalDeps, 'undici'],
  });
  if (!cjsResult.success) {
    console.error(cjsResult.logs);
    throw new Error('CJS build failed');
  }
  try {
    const { rename } = await import('node:fs/promises');
    await rename('dist/cjs/index.node.js', 'dist/cjs/index.node.cjs');
  } catch (e) {
    console.warn('CJS rename step warning:', e);
  }
  console.log(`✅ CJS build complete in ${((Date.now() - cjsStart) / 1000).toFixed(2)}s`);

  // TypeScript declarations
  const dtsStart = Date.now();
  console.log('📝 Generating TypeScript declarations...');
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { $ } = await import('bun');
  await $`tsc --project tsconfig.build.json`;
  await mkdir('dist/node', { recursive: true });
  await mkdir('dist/browser', { recursive: true });
  await mkdir('dist/cjs', { recursive: true });
  await writeFile(
    'dist/node/index.d.ts',
    `export * from '../index';
export { default } from '../index';
`
  );
  await writeFile(
    'dist/browser/index.d.ts',
    `export * from '../index';
export { default } from '../index';
`
  );
  await writeFile(
    'dist/cjs/index.d.ts',
    `export * from '../index';
export { default } from '../index';
`
  );
  console.log(`✅ Declarations generated in ${((Date.now() - dtsStart) / 1000).toFixed(2)}s`);

  console.log(`🎉 All builds completed in ${((Date.now() - totalStart) / 1000).toFixed(2)}s`);
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});

export {};
