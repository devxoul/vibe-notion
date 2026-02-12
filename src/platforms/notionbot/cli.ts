#!/usr/bin/env node

import { Command } from 'commander'
import pkg from '../../../package.json'
import {
  authCommand,
  blockCommand,
  commentCommand,
  databaseCommand,
  pageCommand,
  searchCommand,
  userCommand,
} from './commands'

const program = new Command()

program
  .name('agent-notionbot')
  .description('Notion official API CLI for AI agents')
  .version(pkg.version)

program.addCommand(authCommand)
program.addCommand(blockCommand)
program.addCommand(commentCommand)
program.addCommand(databaseCommand)
program.addCommand(pageCommand)
program.addCommand(searchCommand)
program.addCommand(userCommand)

program.parse(process.argv)

export { program }
