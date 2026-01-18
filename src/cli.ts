#!/usr/bin/env node

// Suppress punycode deprecation warning (node 21+)
const originalEmit = process.emit;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
process.emit = function (name: any, data: any, ...args: any[]) {
  if (
    name === 'warning' &&
    typeof data === 'object' &&
    data?.name === 'DeprecationWarning' &&
    data?.message?.includes('punycode')
  ) {
    return false;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return originalEmit.apply(process, [name, data, ...args] as any);
} as any;

void import('./cli_main.js');
