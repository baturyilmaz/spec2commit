#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import {
  initStore,
  newState,
  getOrCreateSession,
  loadLastModified,
  getSessionById,
  listSessions,
} from './core/store.js';
import { App } from './app.js';
import { DEFAULT_MODEL_CONFIG, type ModelType } from './types.js';
import { getSessionTitle } from './core/commands.js';

process.on('uncaughtException', (err) => {
  console.error(`[fatal] ${err.message}`);
  process.exit(1);
});

function validateModel(value: string): ModelType {
  if (value !== 'codex' && value !== 'claude') {
    throw new Error(`Invalid model: ${value}. Must be 'codex' or 'claude'.`);
  }
  return value;
}

interface CliOpts {
  resume?: boolean;
  session?: string;
  list?: boolean;
  autoApprove?: boolean;
  planner?: string;
  reviewer?: string;
}

new Command()
  .name('spec2commit')
  .version('0.3.0')
  .description('CLI that orchestrates Codex and Claude — from spec to committed code')
  .argument('[path]', 'Project directory', '.')
  .option('--resume', 'Resume last modified session')
  .option('--session <id>', 'Resume specific session by ID')
  .option('--list', 'List all sessions and exit')
  .option('--auto-approve', 'Skip human confirmation after review approval')
  .option('--planner <model>', 'Model for planning/implementation (codex|claude)', 'codex')
  .option('--reviewer <model>', 'Model for reviewing (codex|claude)', 'codex')
  .action(async (p: string, opts: CliOpts) => {
    const abs = resolve(p);
    if (!existsSync(abs)) {
      console.error(chalk.red(`Not found: ${abs}`));
      process.exit(1);
    }

    initStore(abs);

    if (opts.list) {
      const sessions = listSessions();
      if (sessions.length === 0) {
        console.log(chalk.dim('No sessions found.'));
      } else {
        console.log(chalk.bold('Sessions:\n'));
        for (const sess of sessions) {
          const title = getSessionTitle(sess);
          const date = new Date(sess.modifiedAt).toLocaleString();
          const status = sess.stage === 'DONE' ? chalk.green('✓') : sess.stage === 'PAUSED' ? chalk.yellow('⏸') : chalk.dim('○');
          console.log(`  ${status} ${chalk.cyan(sess.id)} ${title}`);
          console.log(`    ${chalk.dim(date)} · ${sess.models.planner}→${sess.models.reviewer} · ${sess.log.length} msgs`);
        }
      }
      process.exit(0);
    }

    const plannerModel = opts.planner ? validateModel(opts.planner) : DEFAULT_MODEL_CONFIG.planner;
    const reviewerModel = opts.reviewer ? validateModel(opts.reviewer) : DEFAULT_MODEL_CONFIG.reviewer;

    const requiredBins = new Set(['git']);
    if (plannerModel === 'codex' || reviewerModel === 'codex') requiredBins.add('codex');
    if (plannerModel === 'claude' || reviewerModel === 'claude') requiredBins.add('claude');

    for (const bin of requiredBins) {
      try {
        execSync(`which ${bin}`, { stdio: 'pipe' });
      } catch {
        console.error(chalk.red(`Missing required binary: ${bin}`));
        process.exit(1);
      }
    }

    let state;

    if (opts.session) {
      state = getSessionById(opts.session);
      if (!state) {
        console.error(chalk.red(`Session not found: ${opts.session}`));
        console.log(chalk.dim('Use --list to see available sessions.'));
        process.exit(1);
      }
    } else if (opts.resume) {
      state = loadLastModified();
      if (!state) {
        console.log(chalk.dim('No previous session found. Starting new session.'));
        state = getOrCreateSession(abs, { planner: plannerModel, reviewer: reviewerModel });
      }
    } else {
      state = getOrCreateSession(abs, { planner: plannerModel, reviewer: reviewerModel });
    }

    if (opts.planner) state.models.planner = plannerModel;
    if (opts.reviewer) state.models.reviewer = reviewerModel;
    if (opts.autoApprove) state.autoApprove = true;

    render(<App state={state} />);
  })
  .parse();
