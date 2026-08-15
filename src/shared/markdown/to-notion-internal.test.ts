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

  test('nested bulleted list (2 levels)', () => {
    const result = markdownToBlocks('- Parent\n  - Child')
    expect(result).toEqual([
      {
        type: 'bulleted_list',
        properties: { title: [['Parent']] },
        children: [{ type: 'bulleted_list', properties: { title: [['Child']] } }],
      },
    ])
  })

  test('nested numbered list (2 levels)', () => {
    const result = markdownToBlocks('1. First\n   1. Nested')
    expect(result).toEqual([
      {
        type: 'numbered_list',
        properties: { title: [['First']] },
        children: [{ type: 'numbered_list', properties: { title: [['Nested']] } }],
      },
    ])
  })

  test('deeply nested bulleted list (3 levels)', () => {
    const result = markdownToBlocks('- Level 1\n  - Level 2\n    - Level 3')
    expect(result).toEqual([
      {
        type: 'bulleted_list',
        properties: { title: [['Level 1']] },
        children: [
          {
            type: 'bulleted_list',
            properties: { title: [['Level 2']] },
            children: [{ type: 'bulleted_list', properties: { title: [['Level 3']] } }],
          },
        ],
      },
    ])
  })

  test('nested todo/checkbox list', () => {
    const result = markdownToBlocks('- [x] Task\n  - Sub-item')
    expect(result).toEqual([
      {
        type: 'to_do',
        properties: { title: [['Task']], checked: [['Yes']] },
        children: [{ type: 'bulleted_list', properties: { title: [['Sub-item']] } }],
      },
    ])
  })

  test('mixed nesting (bulleted with nested numbered)', () => {
    const result = markdownToBlocks('- Bullet\n  1. Numbered child')
    expect(result).toEqual([
      {
        type: 'bulleted_list',
        properties: { title: [['Bullet']] },
        children: [{ type: 'numbered_list', properties: { title: [['Numbered child']] } }],
      },
    ])
  })

  test('simple table', () => {
    const md = '| Name | Role |\n| --- | --- |\n| Alice | Dev |'
    const result = markdownToBlocks(md)
    expect(result).toHaveLength(1)
    const table = result[0]
    expect(table.type).toBe('table')
    expect(table.format).toBeDefined()

    const columnOrder = table.format!.table_block_column_order as string[]
    expect(columnOrder).toHaveLength(2)
    expect(table.format!.table_block_column_header).toBe(true)

    expect(table.children).toHaveLength(2)

    const headerRow = table.children![0]
    expect(headerRow.type).toBe('table_row')
    expect(headerRow.properties![columnOrder[0]]).toEqual([['Name']])
    expect(headerRow.properties![columnOrder[1]]).toEqual([['Role']])

    const dataRow = table.children![1]
    expect(dataRow.type).toBe('table_row')
    expect(dataRow.properties![columnOrder[0]]).toEqual([['Alice']])
    expect(dataRow.properties![columnOrder[1]]).toEqual([['Dev']])
  })

  test('table with inline formatting', () => {
    const md = '| Name | Status |\n| --- | --- |\n| **Alice** | `active` |'
    const result = markdownToBlocks(md)
    const table = result[0]
    const columnOrder = table.format!.table_block_column_order as string[]
    const dataRow = table.children![1]
    expect(dataRow.properties![columnOrder[0]]).toEqual([['Alice', [['b']]]])
    expect(dataRow.properties![columnOrder[1]]).toEqual([['active', [['c']]]])
  })

  test('table with 3 columns and multiple rows', () => {
    const md = '| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |'
    const result = markdownToBlocks(md)
    const table = result[0]
    const columnOrder = table.format!.table_block_column_order as string[]
    expect(columnOrder).toHaveLength(3)
    expect(table.children).toHaveLength(3)
  })

  test('table among other blocks', () => {
    const md = '# Title\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nSome text'
    const result = markdownToBlocks(md)
    expect(result).toHaveLength(3)
    expect(result[0].type).toBe('header')
    expect(result[1].type).toBe('table')
    expect(result[2].type).toBe('text')
  })

  test('uploaded image becomes an image block that claims its file id', () => {
    const result = markdownToBlocks('![Local](attachment:11111111-2222-3333-4444-555555555555:cat.png)')
    expect(result).toEqual([
      {
        type: 'image',
        properties: {
          source: [['attachment:11111111-2222-3333-4444-555555555555:cat.png']],
          title: [['Local']],
        },
        fileIds: ['11111111-2222-3333-4444-555555555555'],
      },
    ])
  })

  test('image alt text falls back to the attachment file name', () => {
    const result = markdownToBlocks('![](attachment:11111111-2222-3333-4444-555555555555:cat.png)')
    expect(result[0].properties?.title).toEqual([['cat.png']])
  })

  test('remote image becomes an image block without a file id', () => {
    const result = markdownToBlocks('![Remote](https://example.com/cat.png)')
    expect(result).toEqual([
      {
        type: 'image',
        properties: { source: [['https://example.com/cat.png']], title: [['Remote']] },
      },
    ])
  })

  test('image with a file name containing spaces keeps the whole reference', () => {
    const result = markdownToBlocks('![Local](<attachment:11111111-2222-3333-4444-555555555555:my cat.png>)')
    expect(result[0].properties?.source).toEqual([['attachment:11111111-2222-3333-4444-555555555555:my cat.png']])
  })

  test('text around an image splits into sibling blocks', () => {
    const result = markdownToBlocks('before ![Local](attachment:1111:cat.png) after')
    expect(result.map((block) => block.type)).toEqual(['text', 'image', 'text'])
    expect(result[0].properties?.title).toEqual([['before ']])
    expect(result[2].properties?.title).toEqual([[' after']])
  })

  test('image on its own line does not leave an empty text block behind', () => {
    const result = markdownToBlocks('![Local](attachment:1111:cat.png)')
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('image')
  })

  test('whitespace between adjacent images does not become a text block', () => {
    const result = markdownToBlocks('![One](attachment:1111:one.png) ![Two](attachment:2222:two.png)')
    expect(result.map((block) => block.type)).toEqual(['image', 'image'])
  })
})
