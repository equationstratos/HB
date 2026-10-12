import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  external: ['@hb/shared', 'socket.io-client'],
  clean: true,
  sourcemap: true,
  target: 'es2020',
});
