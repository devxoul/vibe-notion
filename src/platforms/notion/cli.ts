#!/usr/bin/env bun

import { Command } from 'commander'
import pkg from '../../../package.json'
import { setActiveUserId } from './client'
import {
  authCommand,
  blockCommand,
  commentCommand,
  databaseCommand,
  pageCommand,
  searchCommand,
  userCommand,
  workspaceCommand,
} from './commands/index'

const program = new Command()

program
  .name('vibe-notion')
  .description('Notion unofficial API CLI for AI agents')
  .version(pkg.version)
  .option('--user-id <id>', 'Active user ID for multi-account support')
  .hook('preAction', (_thisCommand, actionCommand) => {
    const rootOpts = program.opts<{ userId?: string }>()
    const localOpts = actionCommand.opts<{ userId?: string }>()
    const userId = localOpts.userId ?? rootOpts.userId
    if (userId) {
      setActiveUserId(userId)
    }
  })

program.addCommand(authCommand)
program.addCommand(blockCommand)
program.addCommand(commentCommand)
program.addCommand(databaseCommand)
program.addCommand(pageCommand)
program.addCommand(searchCommand)
program.addCommand(userCommand)
program.addCommand(workspaceCommand)

program.parse(process.argv)

export { program }
