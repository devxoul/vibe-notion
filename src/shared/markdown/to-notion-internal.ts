import type {
  Blockquote,
  Code,
  Heading,
  Image,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  RootContent,
  Table,
} from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

import type { InternalBlockDefinition } from './types'

type RichTextSegment = [string] | [string, string[][]]

const ATTACHMENT_PREFIX = 'attachment:'

export function markdownToBlocks(markdown: string): InternalBlockDefinition[] {
  if (!markdown.trim()) return []

  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown)
  const blocks: InternalBlockDefinition[] = []

  for (const node of tree.children) {
    blocks.push(...convertNode(node))
  }

  return blocks
}

function convertNode(node: RootContent): InternalBlockDefinition[] {
  switch (node.type) {
    case 'heading':
      return [convertHeading(node)]
    case 'paragraph':
      return convertParagraph(node)
    case 'list':
      return convertList(node)
    case 'blockquote':
      return [convertBlockquote(node)]
    case 'code':
      return [convertCode(node)]
    case 'table':
      return [convertTable(node)]
    case 'thematicBreak':
      return [{ type: 'divider' }]
    default:
      return []
  }
}

function convertHeading(node: Heading): InternalBlockDefinition {
  const typeMap: Record<number, string> = {
    1: 'header',
    2: 'sub_header',
    3: 'sub_sub_header',
  }
  const type = typeMap[node.depth] ?? 'sub_sub_header'
  return { type, properties: { title: convertInlineContent(node.children) } }
}

function convertParagraph(node: Paragraph): InternalBlockDefinition[] {
  if (!node.children.some((child) => child.type === 'image')) {
    return [{ type: 'text', properties: { title: convertInlineContent(node.children) } }]
  }

  // Notion has no inline image, so images become sibling blocks and the surrounding text keeps its own block.
  const blocks: InternalBlockDefinition[] = []
  let inline: PhrasingContent[] = []

  for (const child of node.children) {
    if (child.type !== 'image') {
      inline.push(child)
      continue
    }
    appendTextBlock(blocks, inline)
    inline = []
    blocks.push(convertImage(child))
  }
  appendTextBlock(blocks, inline)

  return blocks
}

function appendTextBlock(blocks: InternalBlockDefinition[], nodes: PhrasingContent[]): void {
  if (nodes.length === 0) return
  const title = convertInlineContent(nodes)
  if (!title.some(([text]) => text.trim())) return
  blocks.push({ type: 'text', properties: { title } })
}

function convertImage(node: Image): InternalBlockDefinition {
  const fileId = extractAttachmentFileId(node.url)
  const caption = node.alt || node.title || (fileId ? attachmentFileName(node.url) : '')
  const block: InternalBlockDefinition = {
    type: 'image',
    properties: { source: [[node.url]], title: [[caption]] },
  }
  // Notion refuses to sign a file the block does not claim, so an uploaded image must list its file id.
  if (fileId) block.fileIds = [fileId]
  return block
}

function extractAttachmentFileId(url: string): string | undefined {
  if (!url.startsWith(ATTACHMENT_PREFIX)) return undefined
  const fileId = url.slice(ATTACHMENT_PREFIX.length).split(':')[0]
  return fileId || undefined
}

function attachmentFileName(url: string): string {
  const separator = url.indexOf(':', ATTACHMENT_PREFIX.length)
  return separator === -1 ? '' : url.slice(separator + 1)
}

function convertList(node: List): InternalBlockDefinition[] {
  return node.children.map((item) => convertListItem(item, node.ordered ?? false))
}

function convertListItem(node: ListItem, ordered: boolean): InternalBlockDefinition {
  const nestedLists = node.children.filter((c) => c.type === 'list') as List[]
  const children: InternalBlockDefinition[] = []
  for (const nestedList of nestedLists) {
    children.push(...convertList(nestedList))
  }
  if (node.checked !== null && node.checked !== undefined) {
    const paragraph = node.children.find((c) => c.type === 'paragraph') as Paragraph | undefined
    const title = paragraph ? convertInlineContent(paragraph.children) : [[''] as RichTextSegment]
    const block: InternalBlockDefinition = {
      type: 'to_do',
      properties: {
        title,
        checked: [[node.checked ? 'Yes' : 'No']],
      },
    }
    if (children.length > 0) block.children = children
    return block
  }
  const type = ordered ? 'numbered_list' : 'bulleted_list'
  const paragraph = node.children.find((c) => c.type === 'paragraph') as Paragraph | undefined
  const title = paragraph ? convertInlineContent(paragraph.children) : [[''] as RichTextSegment]
  const block: InternalBlockDefinition = { type, properties: { title } }
  if (children.length > 0) block.children = children
  return block
}

function convertBlockquote(node: Blockquote): InternalBlockDefinition {
  const segments: RichTextSegment[] = []
  for (const child of node.children) {
    if (child.type === 'paragraph') {
      segments.push(...convertInlineContent(child.children))
    }
  }
  return {
    type: 'quote',
    properties: { title: segments.length > 0 ? segments : [['']] },
  }
}

function convertCode(node: Code): InternalBlockDefinition {
  return {
    type: 'code',
    properties: {
      title: [[node.value]],
      language: [[node.lang || 'plain text']],
    },
  }
}

function generateColumnId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let key = ''
  for (let i = 0; i < 4; i++) {
    key += chars[Math.floor(Math.random() * chars.length)]
  }
  return key
}

function convertTable(node: Table): InternalBlockDefinition {
  const numCols = node.children[0]?.children.length ?? 0
  const columnIds = Array.from({ length: numCols }, () => generateColumnId())

  const children: InternalBlockDefinition[] = node.children.map((row) => {
    const properties: Record<string, RichTextSegment[]> = {}
    for (let i = 0; i < columnIds.length; i++) {
      const cell = row.children[i]
      properties[columnIds[i]] = cell ? convertInlineContent(cell.children) : [['']]
    }
    return { type: 'table_row', properties }
  })

  return {
    type: 'table',
    format: {
      table_block_column_order: columnIds,
      table_block_column_header: true,
    },
    children,
  }
}

function convertInlineContent(nodes: PhrasingContent[]): RichTextSegment[] {
  const segments: RichTextSegment[] = []
  for (const node of nodes) {
    segments.push(...convertInlineNode(node, []))
  }
  return segments
}

function convertInlineNode(node: PhrasingContent, annotations: string[][]): RichTextSegment[] {
  switch (node.type) {
    case 'text':
      return annotations.length > 0 ? [[node.value, annotations]] : [[node.value]]

    case 'strong': {
      const newAnnotations = [...annotations, ['b']]
      const segments: RichTextSegment[] = []
      for (const child of node.children) {
        segments.push(...convertInlineNode(child, newAnnotations))
      }
      return segments
    }

    case 'emphasis': {
      const newAnnotations = [...annotations, ['i']]
      const segments: RichTextSegment[] = []
      for (const child of node.children) {
        segments.push(...convertInlineNode(child, newAnnotations))
      }
      return segments
    }

    case 'delete': {
      const newAnnotations = [...annotations, ['s']]
      const segments: RichTextSegment[] = []
      for (const child of node.children) {
        segments.push(...convertInlineNode(child, newAnnotations))
      }
      return segments
    }

    case 'inlineCode':
      return annotations.length > 0 ? [[node.value, [...annotations, ['c']]]] : [[node.value, [['c']]]]

    case 'link': {
      const linkAnnotation = ['a', node.url]
      const mergedAnnotations = [...annotations, linkAnnotation]
      const segments: RichTextSegment[] = []
      for (const child of node.children) {
        segments.push(...convertInlineNode(child, mergedAnnotations))
      }
      return segments
    }

    default:
      return []
  }
}
