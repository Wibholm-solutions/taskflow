import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import vitestConfig from '../../vitest.config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

describe('coverage tooling', () => {
  it('defines a dedicated coverage script', () => {
    const packageJsonPath = path.join(repoRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    expect(packageJson.scripts['test:coverage']).toBe('vitest run --coverage');
    expect(packageJson.scripts.test).toBe('vitest run');
  });

  it('configures Vitest coverage for all client and server source files', () => {
    expect(vitestConfig.test?.coverage).toMatchObject({
      provider: 'v8',
      all: true,
      include: ['client/src/**/*.{ts,tsx}', 'server/src/**/*.ts'],
      exclude: expect.arrayContaining([
        'client/tests/**',
        'server/tests/**',
        'client/src/main.tsx',
        'server/src/index.ts',
      ]),
      reporter: expect.arrayContaining(['text', 'html']),
      thresholds: {
        lines: 63.84,
        statements: 63.84,
        functions: 66.66,
        branches: 78.16,
      },
    });
  });

  it('runs unit coverage before build and e2e in CI', () => {
    const workflowPath = path.join(repoRoot, '.github/workflows/ci-cd.yml');
    const workflow = fs.readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('unit_coverage:');
    expect(workflow).toContain('build:');
    expect(workflow).toContain('e2e:');
    expect(workflow).toContain('build:\n    needs: unit_coverage');
    expect(workflow).toContain('e2e:\n    needs: build');
    expect(workflow).toContain('run: npm run test:coverage');
    expect(workflow).toContain('needs: [unit_coverage, build, e2e]');
  });
});
