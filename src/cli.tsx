#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import { initStore, newState, load } from './core/store.js';
import { App } from './app.js';

process.on('uncaughtException', (err) => {
  console.error(`[fatal] ${err.message}`);
  process.exit(1);
});

new Command()
  .name('spec2commit')
  .version('0.3.0')
  .description('CLI that orchestrates Claude Code and OpenAI Codex — from spec to committed code')
  .argument('[path]', 'Project directory', '.')
  .option('--resume', 'Resume previous session state')
  .option('--auto-approve', 'Skip human confirmation after Codex approves')
  .action(async (p: string, opts: { resume?: boolean; autoApprove?: boolean }) => {
    const abs = resolve(p);
    if (!existsSync(abs)) {
      console.error(chalk.red(`Not found: ${abs}`));
      process.exit(1);
    }

    for (const bin of ['codex', 'claude', 'git']) {
      try {
        execSync(`which ${bin}`, { stdio: 'pipe' });
      } catch {
        console.error(chalk.red(`Missing required binary: ${bin}`));
        process.exit(1);
      }
    }

    const isResume = opts.resume === true;
    initStore(abs);

    const state = isResume ? (load() ?? newState(abs)) : newState(abs);
    if (opts.autoApprove) state.autoApprove = true;

    render(<App state={state} />);
  })
  .parse();
