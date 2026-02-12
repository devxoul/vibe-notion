#!/usr/bin/env bun

import { Command } from 'commander'
import pkg from '../../../package.json'
import { authCommand, blockCommand, databaseCommand, pageCommand, searchCommand, userCommand } from './commands/index'

const program = new Command()

program.name('agent-notion').description('Notion unofficial API CLI for AI agents').version(pkg.version)

program.addCommand(authCommand)
program.addCommand(blockCommand)
program.addCommand(databaseCommand)
program.addCommand(pageCommand)
program.addCommand(searchCommand)
program.addCommand(userCommand)

program.parse(process.argv)

export { program }
