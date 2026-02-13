import type { Blockquote, Code, Heading, List, ListItem, Paragraph, PhrasingContent, RootContent } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import type { InternalBlockDefinition } from './types'

type RichTextSegment = [string] | [string, string[][]]

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
      return [convertParagraph(node)]
    case 'list':
      return convertList(node)
    case 'blockquote':
      return [convertBlockquote(node)]
    case 'code':
      return [convertCode(node)]
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

function convertParagraph(node: Paragraph): InternalBlockDefinition {
  return {
    type: 'text',
    properties: { title: convertInlineContent(node.children) },
  }
}

function convertList(node: List): InternalBlockDefinition[] {
  return node.children.map((item) => convertListItem(item, node.ordered ?? false))
}

function convertListItem(node: ListItem, ordered: boolean): InternalBlockDefinition {
  if (node.checked !== null && node.checked !== undefined) {
    const paragraph = node.children.find((c) => c.type === 'paragraph') as Paragraph | undefined
    const title = paragraph ? convertInlineContent(paragraph.children) : [[''] as RichTextSegment]
    return {
      type: 'to_do',
      properties: {
        title,
        checked: [[node.checked ? 'Yes' : 'No']],
      },
    }
  }

  const type = ordered ? 'numbered_list' : 'bulleted_list'
  const paragraph = node.children.find((c) => c.type === 'paragraph') as Paragraph | undefined
  const title = paragraph ? convertInlineContent(paragraph.children) : [[''] as RichTextSegment]
  return { type, properties: { title } }
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
