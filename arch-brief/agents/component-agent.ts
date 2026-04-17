/**
 * component-agent.ts
 *
 * Read source files, extract metadata, produce arch-data.json with component map.
 *
 * Branch: feat/component-agent
 */

import { Agent, AgentConfig } from '../types';

export const config: AgentConfig = {
  id: 'component-agent',
  scope: 'Read source files, extract metadata, produce arch-data.json with component map',
  branch: 'feat/component-agent',
  blocked_by: [],
  blocks: ['wiring-agent'],
  capabilities: ['typescript', 'file-parsing', 'json'],
};

export async function germinate(): Promise<void> {
  console.log(`[${config.id}] germinate: Initializing component extraction...`);
  // TODO: Set up file reading utilities
  // TODO: Prepare output structure for arch-data.json
}

export async function grow(): Promise<void> {
  console.log(`[${config.id}] grow: Reading source files and extracting metadata...`);
  // TODO: Read each file from NUTRIENTS.md §5 manifest
  // TODO: Extract top-line description from comments
  // TODO: Parse exported function/class names
  // TODO: Assign layer based on file path
  // TODO: Build ComponentEntry for each file
}

export async function fruit(): Promise<void> {
  console.log(`[${config.id}] fruit: Writing arch-data.json...`);
  // TODO: Assemble ArchData object with all components
  // TODO: Add layer metadata
  // TODO: Write arch-data.json to output
}

export default {
  config,
  germinate,
  grow,
  fruit,
};
