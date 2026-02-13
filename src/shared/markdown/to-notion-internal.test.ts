import { describe, expect, test } from 'bun:test'
import { markdownToBlocks } from './to-notion-internal'
import type { InternalBlockDefinition } from './types'

describe('markdownToBlocks', () => {
  test('heading 1', () => {
    const result = markdownToBlocks('# My Heading')
    expect(result).toEqual([{ type: 'header', properties: { title: [['My Heading']] } }])
  })

  test('heading 2', () => {
    const result = markdownToBlocks('## Sub Heading')
    expect(result).toEqual([{ type: 'sub_header', properties: { title: [['Sub Heading']] } }])
  })

  test('heading 3', () => {
    const result = markdownToBlocks('### Sub Sub Heading')
    expect(result).toEqual([{ type: 'sub_sub_header', properties: { title: [['Sub Sub Heading']] } }])
  })

  test('paragraph', () => {
    const result = markdownToBlocks('Hello world')
    expect(result).toEqual([{ type: 'text', properties: { title: [['Hello world']] } }])
  })

  test('bold text', () => {
    const result = markdownToBlocks('**bold**')
    expect(result).toEqual([{ type: 'text', properties: { title: [['bold', [['b']]]] } }])
  })

  test('italic text', () => {
    const result = markdownToBlocks('*italic*')
    expect(result).toEqual([{ type: 'text', properties: { title: [['italic', [['i']]]] } }])
  })

  test('strikethrough text', () => {
    const result = markdownToBlocks('~~strike~~')
    expect(result).toEqual([{ type: 'text', properties: { title: [['strike', [['s']]]] } }])
  })

  test('inline code', () => {
    const result = markdownToBlocks('`code`')
    expect(result).toEqual([{ type: 'text', properties: { title: [['code', [['c']]]] } }])
  })

  test('link', () => {
    const result = markdownToBlocks('[text](https://example.com)')
    expect(result).toEqual([
      {
        type: 'text',
        properties: { title: [['text', [['a', 'https://example.com']]]] },
      },
    ])
  })

  test('mixed formatting in paragraph', () => {
    const result = markdownToBlocks('**bold** and *italic*')
    expect(result).toEqual([
      {
        type: 'text',
        properties: {
          title: [['bold', [['b']]], [' and '], ['italic', [['i']]]],
        },
      },
    ])
  })

  test('bulleted list', () => {
    const result = markdownToBlocks('- item one\n- item two')
    expect(result).toEqual([
      { type: 'bulleted_list', properties: { title: [['item one']] } },
      { type: 'bulleted_list', properties: { title: [['item two']] } },
    ])
  })

  test('numbered list', () => {
    const result = markdownToBlocks('1. first\n2. second')
    expect(result).toEqual([
      { type: 'numbered_list', properties: { title: [['first']] } },
      { type: 'numbered_list', properties: { title: [['second']] } },
    ])
  })

  test('checkbox checked', () => {
    const result = markdownToBlocks('- [x] done')
    expect(result).toEqual([
      {
        type: 'to_do',
        properties: { title: [['done']], checked: [['Yes']] },
      },
    ])
  })

  test('checkbox unchecked', () => {
    const result = markdownToBlocks('- [ ] todo')
    expect(result).toEqual([
      {
        type: 'to_do',
        properties: { title: [['todo']], checked: [['No']] },
      },
    ])
  })

  test('code block with language', () => {
    const result = markdownToBlocks('```javascript\nconsole.log("hi")\n```')
    expect(result).toEqual([
      {
        type: 'code',
        properties: {
          title: [['console.log("hi")']],
          language: [['javascript']],
        },
      },
    ])
  })

  test('code block without language', () => {
    const result = markdownToBlocks('```\nsome code\n```')
    expect(result).toEqual([
      {
        type: 'code',
        properties: {
          title: [['some code']],
          language: [['plain text']],
        },
      },
    ])
  })

  test('quote', () => {
    const result = markdownToBlocks('> Quote text')
    expect(result).toEqual([{ type: 'quote', properties: { title: [['Quote text']] } }])
  })

  test('divider', () => {
    const result = markdownToBlocks('---')
    expect(result).toEqual([{ type: 'divider' }])
  })

  test('full document with multiple block types', () => {
    const md = ['# Title', '', 'A paragraph.', '', '- bullet one', '- bullet two', '', '> a quote', '', '---'].join(
      '\n',
    )

    const result = markdownToBlocks(md)
    expect(result).toEqual([
      { type: 'header', properties: { title: [['Title']] } },
      { type: 'text', properties: { title: [['A paragraph.']] } },
      { type: 'bulleted_list', properties: { title: [['bullet one']] } },
      { type: 'bulleted_list', properties: { title: [['bullet two']] } },
      { type: 'quote', properties: { title: [['a quote']] } },
      { type: 'divider' },
    ])
  })

  test('empty string returns empty array', () => {
    const result = markdownToBlocks('')
    expect(result).toEqual([])
  })

  test('bold and italic combined', () => {
    const result = markdownToBlocks('***bold and italic***')
    expect(result).toEqual([
      {
        type: 'text',
        properties: {
          title: [['bold and italic', [['i'], ['b']]]],
        },
      },
    ])
  })

  test('heading with inline formatting', () => {
    const result = markdownToBlocks('## Hello **world**')
    expect(result).toEqual([
      {
        type: 'sub_header',
        properties: {
          title: [['Hello '], ['world', [['b']]]],
        },
      },
    ])
  })

  test('quote with inline formatting', () => {
    const result = markdownToBlocks('> **important** quote')
    expect(result).toEqual([
      {
        type: 'quote',
        properties: {
          title: [['important', [['b']]], [' quote']],
        },
      },
    ])
  })

  test('list item with inline formatting', () => {
    const result = markdownToBlocks('- **bold** item')
    expect(result).toEqual([
      {
        type: 'bulleted_list',
        properties: {
          title: [['bold', [['b']]], [' item']],
        },
      },
    ])
  })

  test('result type matches InternalBlockDefinition', () => {
    const result = markdownToBlocks('# Test')
    const block: InternalBlockDefinition = result[0]
    expect(block.type).toBe('header')
    expect(block.properties).toBeDefined()
  })
})
