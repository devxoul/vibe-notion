import fs from 'node:fs'

type ReadMarkdownOptions = {
  markdown?: string
  markdownFile?: string
}

export function readMarkdownInput(options: ReadMarkdownOptions): string {
  const { markdown, markdownFile } = options

  if (markdown && markdownFile) {
    throw new Error('Provide either --markdown or --markdown-file, not both')
  }

  if (!markdown && !markdownFile) {
    throw new Error('Provide either --markdown or --markdown-file')
  }

  if (markdown) {
    return markdown
  }

  return fs.readFileSync(markdownFile!, 'utf-8')
}
