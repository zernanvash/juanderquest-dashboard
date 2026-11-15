import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The dashboard has no Tailwind build: only src/index.css is loaded, so
// Tailwind utility classes render unstyled (quest reviews page, 2026-11-15).
const TAILWIND_UTILITY =
  /(?<![\w-])(?:(?:text|bg|border|ring)-(?:stone|gray|slate|emerald|rose|amber|blue|purple|cyan|red|green)-\d{2,3}|rounded-(?:sm|md|lg|xl|2xl|3xl|full)|space-[xy]-\d|grid-cols-\d+|(?:p|px|py|pt|pb|m|mt|mb|gap)-\d+(?:\.\d)?|w-\d+|h-\d+)(?![\w-])/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [path] : [];
  });
}

describe('dashboard styling', () => {
  it('uses no Tailwind utility classes', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(__dirname))) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (line.includes('className') && TAILWIND_UTILITY.test(line)) {
            offenders.push(`${file}:${index + 1}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});
