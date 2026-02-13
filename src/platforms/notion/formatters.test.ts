import { describe, expect, test } from 'bun:test'
import type { PropertyValue } from './formatters'
import {
  collectBacklinkUserIds,
  collectReferenceIds,
  enrichProperties,
  extractBlockText,
  extractCollectionName,
  extractNotionTitle,
  formatBacklinks,
  formatBlockChildren,
  formatBlockRecord,
  formatBlockUpdate,
  formatBlockValue,
  formatCollectionValue,
  formatCommentAttachment,
  formatCommentValue,
  formatDiscussionComments,
  formatPageGet,
  formatQueryCollectionResponse,
  formatUserValue,
  simplifyCollectionSchema,
} from './formatters'

describe('extractNotionTitle', () => {
  test('extracts title from a single segment', () => {
    // Given
    const block = { properties: { title: [['Hello']] } }

    // When
    const result = extractNotionTitle(block)

    // Then
    expect(result).toBe('Hello')
  })

  test('joins title from multiple segments', () => {
    // Given
    const block = { properties: { title: [['Hello'], [' '], ['World']] } }

    // When
    const result = extractNotionTitle(block)

    // Then
    expect(result).toBe('Hello World')
  })

  test('returns empty string when title is missing', () => {
    // Given
    const block = {}

    // When
    const result = extractNotionTitle(block)

    // Then
    expect(result).toBe('')
  })

  test('returns empty string when properties is null', () => {
    // Given
    const block = { properties: null }

    // When
    const result = extractNotionTitle(block)

    // Then
    expect(result).toBe('')
  })
})

describe('extractBlockText', () => {
  test('extracts text from block title property', () => {
    // Given
    const block = { properties: { title: [['Test block']] } }

    // When
    const result = extractBlockText(block)

    // Then
    expect(result).toBe('Test block')
  })
})

describe('formatBlockValue', () => {
  test('keeps only essential block fields', () => {
    // Given
    const block = {
      id: 'block-1',
      type: 'text',
      properties: { title: [['Hello world']] },
      content: ['child-1', 'child-2'],
      parent_id: 'parent-1',
      version: 2,
      created_time: 12345,
      last_edited_time: 23456,
      space_id: 'space-1',
      alive: true,
    }

    // When
    const result = formatBlockValue(block)

    // Then
    expect(result).toEqual({
      id: 'block-1',
      type: 'text',
      text: 'Hello world',
      content: ['child-1', 'child-2'],
      parent_id: 'parent-1',
      collection_id: undefined,
      view_ids: undefined,
    })
    expect('version' in result).toBe(false)
    expect('space_id' in result).toBe(false)
    expect('created_time' in result).toBe(false)
  })

  test('includes collection_id and view_ids for collection_view blocks', () => {
    // Given
    const block = {
      id: 'block-collection-view',
      type: 'collection_view',
      collection_id: 'coll-123',
      view_ids: ['view-1', 'view-2'],
      parent_id: 'parent-1',
    }

    // When
    const result = formatBlockValue(block)

    // Then
    expect(result).toEqual({
      id: 'block-collection-view',
      type: 'collection_view',
      text: '',
      content: undefined,
      parent_id: 'parent-1',
      collection_id: 'coll-123',
      view_ids: ['view-1', 'view-2'],
    })
  })

  test('includes collection_id and view_ids for collection_view_page blocks', () => {
    // Given
    const block = {
      id: 'block-collection-view-page',
      type: 'collection_view_page',
      collection_id: 'coll-456',
      view_ids: ['view-3'],
      parent_id: 'parent-2',
    }

    // When
    const result = formatBlockValue(block)

    // Then
    expect(result).toEqual({
      id: 'block-collection-view-page',
      type: 'collection_view_page',
      text: '',
      content: undefined,
      parent_id: 'parent-2',
      collection_id: 'coll-456',
      view_ids: ['view-3'],
    })
  })
})

describe('formatBlockChildren', () => {
  test('formats block children list with has_more', () => {
    // Given
    const blocks = [
      { id: 'block-1', type: 'text', properties: { title: [['First']] } },
      { id: 'block-2', type: 'to_do', properties: { title: [['Second']] } },
    ]

    // When
    const result = formatBlockChildren(blocks, false, null)

    // Then
    expect(result).toEqual({
      results: [
        { id: 'block-1', type: 'text', text: 'First' },
        { id: 'block-2', type: 'to_do', text: 'Second', checked: false },
      ],
      has_more: false,
      next_cursor: null,
    })
  })

  test('includes checked state for to_do blocks', () => {
    // Given
    const blocks = [
      { id: 'block-1', type: 'to_do', properties: { title: [['Checked item']], checked: [['Yes']] } },
      { id: 'block-2', type: 'to_do', properties: { title: [['Unchecked item']], checked: [['No']] } },
    ]

    // When
    const result = formatBlockChildren(blocks, false, null)

    // Then
    expect(result).toEqual({
      results: [
        { id: 'block-1', type: 'to_do', text: 'Checked item', checked: true },
        { id: 'block-2', type: 'to_do', text: 'Unchecked item', checked: false },
      ],
      has_more: false,
      next_cursor: null,
    })
  })
})

describe('formatBlockUpdate', () => {
  test('returns update confirmation shape', () => {
    // Given
    const block = {
      id: 'block-1',
      type: 'text',
      properties: { title: [['Ignored']] },
      content: ['child-1'],
    }

    // When
    const result = formatBlockUpdate(block)

    // Then
    expect(result).toEqual({ id: 'block-1', type: 'text' })
    expect(Object.keys(result)).toEqual(['id', 'type'])
  })
})

describe('formatPageGet', () => {
  test('returns ordered direct child blocks from root page', () => {
    // Given
    const blocks: Record<string, Record<string, unknown>> = {
      'page-1': {
        value: { id: 'page-1', type: 'page', content: ['block-1', 'block-2'] },
        role: 'editor',
      },
      'block-1': {
        value: { id: 'block-1', type: 'text', properties: { title: [['First']] } },
        role: 'editor',
      },
      'block-2': {
        value: { id: 'block-2', type: 'to_do', properties: { title: [['Second']] } },
        role: 'editor',
      },
    }

    // When
    const result = formatPageGet(blocks, 'page-1')

    // Then
    expect(result).toEqual({
      id: 'page-1',
      title: '',
      blocks: [
        { id: 'block-1', type: 'text', text: 'First' },
        { id: 'block-2', type: 'to_do', text: 'Second', checked: false },
      ],
    })
  })

  test('includes checked state for to_do blocks', () => {
    // Given
    const blocks: Record<string, Record<string, unknown>> = {
      'page-1': {
        value: { id: 'page-1', type: 'page', content: ['block-1', 'block-2'] },
        role: 'editor',
      },
      'block-1': {
        value: { id: 'block-1', type: 'to_do', properties: { title: [['Done']], checked: [['Yes']] } },
        role: 'editor',
      },
      'block-2': {
        value: { id: 'block-2', type: 'to_do', properties: { title: [['Not done']] } },
        role: 'editor',
      },
    }

    // When
    const result = formatPageGet(blocks, 'page-1')

    // Then
    expect(result).toEqual({
      id: 'page-1',
      title: '',
      blocks: [
        { id: 'block-1', type: 'to_do', text: 'Done', checked: true },
        { id: 'block-2', type: 'to_do', text: 'Not done', checked: false },
      ],
    })
  })

  test('recursively includes nested children', () => {
    // Given
    const blocks: Record<string, Record<string, unknown>> = {
      'page-1': {
        value: { id: 'page-1', type: 'page', content: ['block-1'] },
        role: 'editor',
      },
      'block-1': {
        value: {
          id: 'block-1',
          type: 'text',
          properties: { title: [['Parent']] },
          content: ['block-3'],
        },
        role: 'editor',
      },
      'block-3': {
        value: { id: 'block-3', type: 'text', properties: { title: [['Nested']] } },
        role: 'editor',
      },
    }

    // When
    const result = formatPageGet(blocks, 'page-1')

    // Then
    expect(result).toEqual({
      id: 'page-1',
      title: '',
      blocks: [
        {
          id: 'block-1',
          type: 'text',
          text: 'Parent',
          children: [{ id: 'block-3', type: 'text', text: 'Nested' }],
        },
      ],
    })
  })

  test('skips missing blocks gracefully', () => {
    // Given
    const blocks: Record<string, Record<string, unknown>> = {
      'page-1': {
        value: { id: 'page-1', type: 'page', content: ['missing-block', 'block-1'] },
        role: 'editor',
      },
      'block-1': {
        value: { id: 'block-1', type: 'text', properties: { title: [['Present']] } },
        role: 'editor',
      },
    }

    // When
    const result = formatPageGet(blocks, 'page-1')

    // Then
    expect(result).toEqual({
      id: 'page-1',
      title: '',
      blocks: [{ id: 'block-1', type: 'text', text: 'Present' }],
    })
  })
})

describe('formatBacklinks', () => {
  test('extracts source blocks from mentioned_from.block_id', () => {
    // Given
    const response = {
      backlinks: [
        { block_id: 'target-page', mentioned_from: { type: 'property_mention', block_id: 'source-a' } },
        { block_id: 'target-page', mentioned_from: { type: 'alias', block_id: 'source-b' } },
      ],
      recordMap: {
        block: {
          'source-a': {
            value: { id: 'source-a', type: 'page', properties: { title: [['Linking Page A']] } },
            role: 'editor',
          },
          'source-b': {
            value: { id: 'source-b', type: 'page', properties: { title: [['Linking Page B']] } },
            role: 'editor',
          },
        },
      },
    }

    // When
    const result = formatBacklinks(response)

    // Then
    expect(result).toEqual([
      { id: 'source-a', title: 'Linking Page A' },
      { id: 'source-b', title: 'Linking Page B' },
    ])
  })

  test('deduplicates backlinks from the same source block', () => {
    // Given
    const response = {
      backlinks: [
        { block_id: 'target', mentioned_from: { type: 'property_mention', block_id: 'source-a' } },
        { block_id: 'target', mentioned_from: { type: 'alias', block_id: 'source-a' } },
      ],
      recordMap: {
        block: {
          'source-a': {
            value: { id: 'source-a', type: 'page', properties: { title: [['Page A']] } },
            role: 'editor',
          },
        },
      },
    }

    // When
    const result = formatBacklinks(response)

    // Then
    expect(result).toEqual([{ id: 'source-a', title: 'Page A' }])
  })

  test('returns empty array when no backlinks', () => {
    // Given
    const response = { backlinks: [], recordMap: { block: {} } }

    // When
    const result = formatBacklinks(response)

    // Then
    expect(result).toEqual([])
  })

  test('returns empty array when backlinks field is missing', () => {
    // When
    const result = formatBacklinks({})

    // Then
    expect(result).toEqual([])
  })

  test('skips entries without mentioned_from.block_id', () => {
    // Given
    const response = {
      backlinks: [{ block_id: 'target', mentioned_from: { type: 'alias' } }],
      recordMap: { block: {} },
    }

    // When
    const result = formatBacklinks(response)

    // Then
    expect(result).toEqual([])
  })

  test('returns empty title when source block not in recordMap', () => {
    // Given
    const response = {
      backlinks: [{ block_id: 'target', mentioned_from: { type: 'alias', block_id: 'source-missing' } }],
      recordMap: { block: {} },
    }

    // When
    const result = formatBacklinks(response)

    // Then
    expect(result).toEqual([{ id: 'source-missing', title: '' }])
  })

  test('resolves user mentions in titles with userLookup', () => {
    // Given
    const response = {
      backlinks: [{ block_id: 'target', mentioned_from: { type: 'property_mention', block_id: 'source-a' } }],
      recordMap: {
        block: {
          'source-a': {
            value: {
              id: 'source-a',
              type: 'page',
              properties: { title: [['‣', [['u', 'user-1']]], [' ']] },
            },
            role: 'editor',
          },
        },
      },
    }
    const userLookup = { 'user-1': 'Sungyu Kang' }

    // When
    const result = formatBacklinks(response, userLookup)

    // Then
    expect(result).toEqual([{ id: 'source-a', title: 'Sungyu Kang' }])
  })
})

describe('collectBacklinkUserIds', () => {
  test('collects user IDs from title mention decorators', () => {
    // Given
    const response = {
      recordMap: {
        block: {
          'block-1': {
            value: {
              id: 'block-1',
              properties: { title: [['‣', [['u', 'user-1']]], [' ']] },
            },
            role: 'editor',
          },
          'block-2': {
            value: {
              id: 'block-2',
              properties: { title: [['‣', [['u', 'user-2']]], [' ']] },
            },
            role: 'editor',
          },
        },
      },
    }

    // When
    const result = collectBacklinkUserIds(response)

    // Then
    expect(result.sort()).toEqual(['user-1', 'user-2'])
  })

  test('returns empty array when no user mentions', () => {
    // Given
    const response = {
      recordMap: {
        block: {
          'block-1': {
            value: { id: 'block-1', properties: { title: [['Plain text']] } },
            role: 'editor',
          },
        },
      },
    }

    // When
    const result = collectBacklinkUserIds(response)

    // Then
    expect(result).toEqual([])
  })
})

describe('formatBlockRecord', () => {
  test('formats a block record into id, title, and type', () => {
    // Given
    const record = {
      value: {
        id: 'x',
        type: 'page',
        properties: { title: [['My Page']] },
      },
      role: 'editor',
    }

    // When
    const result = formatBlockRecord(record)

    // Then
    expect(result).toEqual({
      id: 'x',
      title: 'My Page',
      type: 'page',
    })
  })
})

describe('simplifyCollectionSchema', () => {
  test('maps schema entries to name:type pairs', () => {
    // Given
    const schema = {
      abc1: { name: 'Name', type: 'title', options: [] },
      def2: { name: 'Status', type: 'select' },
    }

    // When
    const result = simplifyCollectionSchema(schema)

    // Then
    expect(result).toEqual({
      Name: 'title',
      Status: 'select',
    })
  })
})

describe('extractCollectionName', () => {
  test('extracts collection name from one segment', () => {
    // Given
    const name = [['My DB']]

    // When
    const result = extractCollectionName(name)

    // Then
    expect(result).toBe('My DB')
  })

  test('joins collection name from multiple segments', () => {
    // Given
    const name = [['Hello'], [' '], ['World']]

    // When
    const result = extractCollectionName(name)

    // Then
    expect(result).toBe('Hello World')
  })

  test('returns empty string when name is not an array', () => {
    // Given
    const name = null

    // When
    const result = extractCollectionName(name)

    // Then
    expect(result).toBe('')
  })
})

describe('formatCollectionValue', () => {
  test('formats collection id, name, and simplified schema', () => {
    // Given
    const collection = {
      id: 'collection-1',
      name: [['My Database']],
      schema: {
        abc1: { name: 'Name', type: 'title' },
        def2: { name: 'Status', type: 'select', options: [{ value: 'Open' }] },
      },
      parent_id: 'page-1',
    }

    // When
    const result = formatCollectionValue(collection)

    // Then
    expect(result).toEqual({
      id: 'collection-1',
      name: 'My Database',
      schema: {
        Name: 'title',
        Status: 'select',
      },
    })
  })
})

describe('formatQueryCollectionResponse', () => {
  test('formats query response rows with schema property names', () => {
    // Given
    const response = {
      result: {
        reducerResults: {
          collection_group_results: {
            blockIds: ['row-1'],
            hasMore: false,
          },
        },
      },
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              type: 'page',
              properties: {
                '@lzG': [['고래몰']],
                'Ho]U': [['완료']],
                SdrK: [['위젯 설치']],
              },
            },
          },
        },
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: {
                '@lzG': { name: '고객사', type: 'title' },
                'Ho]U': { name: '상태', type: 'status' },
                SdrK: { name: '타입', type: 'text' },
              },
            },
          },
        },
      },
    }

    // When
    const result = formatQueryCollectionResponse(response)

    // Then
    expect(result).toEqual({
      results: [
        {
          id: 'row-1',
          properties: {
            고객사: { type: 'title', value: '고래몰' },
            상태: { type: 'status', value: '완료' },
            타입: { type: 'text', value: '위젯 설치' },
          },
        },
      ],
      has_more: false,
      next_cursor: null,
    })
  })

  test('extracts decorator-based values for person, relation, and date', () => {
    // Given
    const response = {
      result: {
        reducerResults: {
          collection_group_results: {
            blockIds: ['row-1'],
            hasMore: false,
          },
        },
      },
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              properties: {
                personKey: [['‣', [['u', 'user-123']]]],
                relationKey: [['‣', [['p', 'page-456']]]],
                dateKey: [['‣', [['d', { start_date: '2026-01-01' }]]]],
              },
            },
          },
        },
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: {
                personKey: { name: '담당자', type: 'person' },
                relationKey: { name: '연결', type: 'relation' },
                dateKey: { name: '일자', type: 'date' },
              },
            },
          },
        },
      },
    }

    // When
    const result = formatQueryCollectionResponse(response)

    // Then
    expect(result).toEqual({
      results: [
        {
          id: 'row-1',
          properties: {
            담당자: { type: 'person', value: ['user-123'] },
            연결: { type: 'relation', value: ['page-456'] },
            일자: { type: 'date', value: '2026-01-01' },
          },
        },
      ],
      has_more: false,
      next_cursor: null,
    })
  })

  test('handles role-wrapped record format from queryCollection', () => {
    // Given - format: { value: { value: { id, ... }, role: "editor" } }
    const response = {
      result: {
        reducerResults: {
          collection_group_results: {
            blockIds: ['row-1'],
            hasMore: true,
          },
        },
      },
      recordMap: {
        block: {
          'row-1': {
            value: {
              value: {
                id: 'row-1',
                type: 'page',
                properties: {
                  title: [['My Row']],
                },
              },
              role: 'editor',
            },
          },
        },
        collection: {
          'coll-1': {
            value: {
              value: {
                id: 'coll-1',
                schema: {
                  title: { name: 'Name', type: 'title' },
                },
              },
              role: 'editor',
            },
          },
        },
      },
    }

    // When
    const result = formatQueryCollectionResponse(response)

    // Then
    expect(result).toEqual({
      results: [{ id: 'row-1', properties: { Name: { type: 'title', value: 'My Row' } } }],
      has_more: true,
      next_cursor: null,
    })
  })

  test('returns empty properties when block has no properties', () => {
    // Given
    const response = {
      result: {
        reducerResults: {
          collection_group_results: {
            blockIds: ['row-1'],
            hasMore: false,
          },
        },
      },
      recordMap: {
        block: {
          'row-1': {
            value: { id: 'row-1', type: 'page' },
          },
        },
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: { title: { name: 'Name', type: 'title' } },
            },
          },
        },
      },
    }

    // When
    const result = formatQueryCollectionResponse(response)

    // Then
    expect(result).toEqual({
      results: [{ id: 'row-1', properties: {} }],
      has_more: false,
      next_cursor: null,
    })
  })

  test('returns typed number property', () => {
    // Given
    const response = {
      result: {
        reducerResults: {
          collection_group_results: { blockIds: ['row-1'], hasMore: false },
        },
      },
      recordMap: {
        block: {
          'row-1': {
            value: { id: 'row-1', properties: { numKey: [['42']] } },
          },
        },
        collection: {
          'coll-1': {
            value: { id: 'coll-1', schema: { numKey: { name: '수량', type: 'number' } } },
          },
        },
      },
    }

    // When
    const result = formatQueryCollectionResponse(response)

    // Then
    expect(result.results[0].properties).toEqual({
      수량: { type: 'number', value: 42 },
    })
  })

  test('returns null for non-numeric number property', () => {
    // Given
    const response = {
      result: {
        reducerResults: {
          collection_group_results: { blockIds: ['row-1'], hasMore: false },
        },
      },
      recordMap: {
        block: {
          'row-1': {
            value: { id: 'row-1', properties: { numKey: [['not-a-number']] } },
          },
        },
        collection: {
          'coll-1': {
            value: { id: 'coll-1', schema: { numKey: { name: '수량', type: 'number' } } },
          },
        },
      },
    }

    // When
    const result = formatQueryCollectionResponse(response)

    // Then
    expect(result.results[0].properties).toEqual({
      수량: { type: 'number', value: null },
    })
  })

  test('returns typed checkbox property', () => {
    // Given
    const response = {
      result: {
        reducerResults: {
          collection_group_results: { blockIds: ['row-1'], hasMore: false },
        },
      },
      recordMap: {
        block: {
          'row-1': {
            value: { id: 'row-1', properties: { cbKey: [['Yes']] } },
          },
        },
        collection: {
          'coll-1': {
            value: { id: 'coll-1', schema: { cbKey: { name: '완료', type: 'checkbox' } } },
          },
        },
      },
    }

    // When
    const result = formatQueryCollectionResponse(response)

    // Then
    expect(result.results[0].properties).toEqual({
      완료: { type: 'checkbox', value: true },
    })
  })

  test('returns typed multi_select property', () => {
    // Given
    const response = {
      result: {
        reducerResults: {
          collection_group_results: { blockIds: ['row-1'], hasMore: false },
        },
      },
      recordMap: {
        block: {
          'row-1': {
            value: { id: 'row-1', properties: { msKey: [['A,B,C']] } },
          },
        },
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: { msKey: { name: '태그', type: 'multi_select' } },
            },
          },
        },
      },
    }

    // When
    const result = formatQueryCollectionResponse(response)

    // Then
    expect(result.results[0].properties).toEqual({
      태그: { type: 'multi_select', value: ['A', 'B', 'C'] },
    })
  })

  test('extracts mentions from title property with user reference', () => {
    // Given
    const response = {
      result: {
        reducerResults: {
          collection_group_results: { blockIds: ['row-1'], hasMore: false },
        },
      },
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              properties: {
                titleKey: [['‣', [['u', 'user-abc']]]],
              },
            },
          },
        },
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: { titleKey: { name: '이름', type: 'title' } },
            },
          },
        },
      },
    }

    // When
    const result = formatQueryCollectionResponse(response)

    // Then
    expect(result.results[0].properties).toEqual({
      이름: {
        type: 'title',
        value: 'user-abc',
        mentions: [{ id: 'user-abc', type: 'user' }],
      },
    })
  })

  test('extracts mentions from text property with page reference', () => {
    // Given
    const response = {
      result: {
        reducerResults: {
          collection_group_results: { blockIds: ['row-1'], hasMore: false },
        },
      },
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              properties: {
                textKey: [['See '], ['‣', [['p', 'page-xyz']]]],
              },
            },
          },
        },
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: { textKey: { name: '설명', type: 'text' } },
            },
          },
        },
      },
    }

    // When
    const result = formatQueryCollectionResponse(response)

    // Then
    expect(result.results[0].properties).toEqual({
      설명: {
        type: 'text',
        value: 'See page-xyz',
        mentions: [{ id: 'page-xyz', type: 'page' }],
      },
    })
  })

  test('omits mentions field for plain title without references', () => {
    // Given
    const response = {
      result: {
        reducerResults: {
          collection_group_results: { blockIds: ['row-1'], hasMore: false },
        },
      },
      recordMap: {
        block: {
          'row-1': {
            value: { id: 'row-1', properties: { titleKey: [['Just text']] } },
          },
        },
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: { titleKey: { name: '이름', type: 'title' } },
            },
          },
        },
      },
    }

    // When
    const result = formatQueryCollectionResponse(response)

    // Then
    const prop = result.results[0].properties.이름
    expect(prop).toEqual({ type: 'title', value: 'Just text' })
    expect('mentions' in prop).toBe(false)
  })

  test('returns relation with multiple targets', () => {
    // Given
    const response = {
      result: {
        reducerResults: {
          collection_group_results: { blockIds: ['row-1'], hasMore: false },
        },
      },
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              properties: {
                relKey: [
                  ['‣', [['p', 'id-1', 'sp-1']]],
                  ['‣', [['p', 'id-2', 'sp-2']]],
                ],
              },
            },
          },
        },
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: { relKey: { name: '연결', type: 'relation' } },
            },
          },
        },
      },
    }

    // When
    const result = formatQueryCollectionResponse(response)

    // Then
    expect(result.results[0].properties).toEqual({
      연결: { type: 'relation', value: ['id-1', 'id-2'] },
    })
  })

  test('returns fallback for unknown property type', () => {
    // Given
    const response = {
      result: {
        reducerResults: {
          collection_group_results: { blockIds: ['row-1'], hasMore: false },
        },
      },
      recordMap: {
        block: {
          'row-1': {
            value: { id: 'row-1', properties: { xKey: [['some value']] } },
          },
        },
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: { xKey: { name: '커스텀', type: 'custom_thing' } },
            },
          },
        },
      },
    }

    // When
    const result = formatQueryCollectionResponse(response)

    // Then
    expect(result.results[0].properties).toEqual({
      커스텀: { type: 'custom_thing', value: 'some value' },
    })
  })

  test('returns empty defaults when response shape is missing', () => {
    // Given
    const response = {}

    // When
    const result = formatQueryCollectionResponse(response)

    // Then
    expect(result).toEqual({
      results: [],
      has_more: false,
      next_cursor: null,
    })
  })
})

describe('formatUserValue', () => {
  test('keeps only id, name, and email fields', () => {
    // Given
    const user = {
      id: 'user-1',
      name: 'Alice',
      email: 'alice@test.com',
      profile_photo: 'https://example.com/alice.png',
    }

    // When
    const result = formatUserValue(user)

    // Then
    expect(result).toEqual({
      id: 'user-1',
      name: 'Alice',
      email: 'alice@test.com',
    })
    expect('profile_photo' in result).toBe(false)
  })
})

describe('collectReferenceIds', () => {
  test('collects unique page IDs from relation properties', () => {
    // Given
    const results: Array<{ id: string; properties: Record<string, PropertyValue> }> = [
      {
        id: 'row-1',
        properties: {
          연결: { type: 'relation', value: ['page-1', 'page-2'] },
          이름: { type: 'title', value: 'Test' },
        },
      },
      {
        id: 'row-2',
        properties: {
          연결: { type: 'relation', value: ['page-3'] },
        },
      },
    ]

    // When
    const refs = collectReferenceIds(results)

    // Then
    expect(refs.pageIds).toEqual(['page-1', 'page-2', 'page-3'])
    expect(refs.userIds).toEqual([])
  })

  test('collects unique user IDs from person properties', () => {
    // Given
    const results: Array<{ id: string; properties: Record<string, PropertyValue> }> = [
      {
        id: 'row-1',
        properties: {
          담당자: { type: 'person', value: ['user-1', 'user-2'] },
        },
      },
    ]

    // When
    const refs = collectReferenceIds(results)

    // Then
    expect(refs.pageIds).toEqual([])
    expect(refs.userIds).toEqual(['user-1', 'user-2'])
  })

  test('returns empty arrays when no references exist', () => {
    // Given
    const results: Array<{ id: string; properties: Record<string, PropertyValue> }> = [
      {
        id: 'row-1',
        properties: {
          이름: { type: 'title', value: 'Test' },
          상태: { type: 'status', value: '완료' },
        },
      },
    ]

    // When
    const refs = collectReferenceIds(results)

    // Then
    expect(refs.pageIds).toEqual([])
    expect(refs.userIds).toEqual([])
  })

  test('collects page and user IDs from title/text mentions', () => {
    // Given
    const results: Array<{ id: string; properties: Record<string, PropertyValue> }> = [
      {
        id: 'row-1',
        properties: {
          이름: {
            type: 'title',
            value: 'user-1',
            mentions: [{ id: 'user-1', type: 'user' }],
          },
          설명: {
            type: 'text',
            value: 'page-1',
            mentions: [{ id: 'page-1', type: 'page' }],
          },
        },
      },
    ]

    // When
    const refs = collectReferenceIds(results)

    // Then
    expect(refs.pageIds).toEqual(['page-1'])
    expect(refs.userIds).toEqual(['user-1'])
  })

  test('deduplicates IDs', () => {
    // Given
    const results: Array<{ id: string; properties: Record<string, PropertyValue> }> = [
      {
        id: 'row-1',
        properties: {
          연결: { type: 'relation', value: ['page-1', 'page-2'] },
        },
      },
      {
        id: 'row-2',
        properties: {
          연결: { type: 'relation', value: ['page-1'] },
        },
      },
    ]

    // When
    const refs = collectReferenceIds(results)

    // Then
    expect(refs.pageIds).toEqual(['page-1', 'page-2'])
  })
})

describe('enrichProperties', () => {
  test('replaces relation IDs with { id, title }', () => {
    // Given
    const results: Array<{ id: string; properties: Record<string, PropertyValue> }> = [
      {
        id: 'row-1',
        properties: {
          연결: { type: 'relation', value: ['page-1', 'page-2'] },
        },
      },
    ]
    const pageLookup = { 'page-1': 'Claude Max (20x)', 'page-2': 'Pro Plan' }
    const userLookup = {}

    // When
    enrichProperties(results, pageLookup, userLookup)

    // Then
    const prop = results[0].properties.연결
    expect(prop.type).toBe('relation')
    expect(prop.value).toEqual([
      { id: 'page-1', title: 'Claude Max (20x)' },
      { id: 'page-2', title: 'Pro Plan' },
    ])
  })

  test('replaces person IDs with { id, name }', () => {
    // Given
    const results: Array<{ id: string; properties: Record<string, PropertyValue> }> = [
      {
        id: 'row-1',
        properties: {
          담당자: { type: 'person', value: ['user-1'] },
        },
      },
    ]
    const pageLookup = {}
    const userLookup = { 'user-1': 'Leo (주원)' }

    // When
    enrichProperties(results, pageLookup, userLookup)

    // Then
    const prop = results[0].properties.담당자
    expect(prop.type).toBe('person')
    expect(prop.value).toEqual([{ id: 'user-1', name: 'Leo (주원)' }])
  })

  test('resolves user mentions in title property', () => {
    // Given
    const results: Array<{ id: string; properties: Record<string, PropertyValue> }> = [
      {
        id: 'row-1',
        properties: {
          이름: {
            type: 'title',
            value: 'user-1',
            mentions: [{ id: 'user-1', type: 'user' }],
          },
        },
      },
    ]
    const pageLookup = {}
    const userLookup = { 'user-1': 'Leo (주원)' }

    // When
    enrichProperties(results, pageLookup, userLookup)

    // Then
    const prop = results[0].properties.이름
    expect(prop).toEqual({
      type: 'title',
      value: 'Leo (주원)',
      mentions: [{ id: 'user-1', type: 'user', name: 'Leo (주원)' }],
    })
  })

  test('resolves page mentions in text property', () => {
    // Given
    const results: Array<{ id: string; properties: Record<string, PropertyValue> }> = [
      {
        id: 'row-1',
        properties: {
          설명: {
            type: 'text',
            value: 'See page-1 for details',
            mentions: [{ id: 'page-1', type: 'page' }],
          },
        },
      },
    ]
    const pageLookup = { 'page-1': 'Roadmap' }
    const userLookup = {}

    // When
    enrichProperties(results, pageLookup, userLookup)

    // Then
    const prop = results[0].properties.설명
    expect(prop).toEqual({
      type: 'text',
      value: 'See Roadmap for details',
      mentions: [{ id: 'page-1', type: 'page', title: 'Roadmap' }],
    })
  })

  test('graceful degradation: missing lookup uses raw ID as title/name', () => {
    // Given
    const results: Array<{ id: string; properties: Record<string, PropertyValue> }> = [
      {
        id: 'row-1',
        properties: {
          연결: { type: 'relation', value: ['page-unknown'] },
          담당자: { type: 'person', value: ['user-unknown'] },
        },
      },
    ]

    // When
    enrichProperties(results, {}, {})

    // Then
    const relProp = results[0].properties.연결
    expect(relProp.type).toBe('relation')
    expect(relProp.value).toEqual([{ id: 'page-unknown', title: 'page-unknown' }])

    const personProp = results[0].properties.담당자
    expect(personProp.type).toBe('person')
    expect(personProp.value).toEqual([{ id: 'user-unknown', name: 'user-unknown' }])
  })

  test('graceful degradation: missing lookup for mentions uses raw ID', () => {
    // Given
    const results: Array<{ id: string; properties: Record<string, PropertyValue> }> = [
      {
        id: 'row-1',
        properties: {
          이름: {
            type: 'title',
            value: 'user-unknown',
            mentions: [{ id: 'user-unknown', type: 'user' }],
          },
        },
      },
    ]

    // When
    enrichProperties(results, {}, {})

    // Then
    const prop = results[0].properties.이름
    expect(prop).toEqual({
      type: 'title',
      value: 'user-unknown',
      mentions: [{ id: 'user-unknown', type: 'user', name: 'user-unknown' }],
    })
  })
})

describe('formatCommentAttachment', () => {
  test('extracts image attachment from block', () => {
    // Given
    const block = {
      id: 'block-img',
      type: 'image',
      properties: {
        title: [['screenshot.png']],
        source: [['attachment:abc-123:screenshot.png']],
        size: [['481.8 KiB']],
      },
    }

    // When
    const result = formatCommentAttachment(block)

    // Then
    expect(result).toEqual({
      id: 'block-img',
      type: 'image',
      name: 'screenshot.png',
      source: 'attachment:abc-123:screenshot.png',
    })
  })

  test('extracts file attachment from block', () => {
    // Given
    const block = {
      id: 'block-file',
      type: 'file',
      properties: {
        title: [['document.pptx']],
        source: [['attachment:def-456:document.pptx']],
        size: [['5.2 MiB']],
      },
    }

    // When
    const result = formatCommentAttachment(block)

    // Then
    expect(result).toEqual({
      id: 'block-file',
      type: 'file',
      name: 'document.pptx',
      source: 'attachment:def-456:document.pptx',
    })
  })

  test('returns undefined for non-attachment block types', () => {
    // Given
    const block = {
      id: 'block-text',
      type: 'text',
      properties: { title: [['Hello']] },
    }

    // When
    const result = formatCommentAttachment(block)

    // Then
    expect(result).toBeUndefined()
  })

  test('returns undefined when properties are missing', () => {
    // Given
    const block = { id: 'block-img', type: 'image' }

    // When
    const result = formatCommentAttachment(block)

    // Then
    expect(result).toBeUndefined()
  })
})

describe('formatCommentValue', () => {
  test('extracts text from comment', () => {
    // Given
    const comment = {
      id: 'comment-1',
      text: [['Hello world']],
      parent_id: 'disc-1',
      created_by_id: 'user-1',
      created_time: 1704067200000,
    }

    // When
    const result = formatCommentValue(comment)

    // Then
    expect(result).toEqual({
      id: 'comment-1',
      text: 'Hello world',
      discussion_id: 'disc-1',
      created_by: 'user-1',
      created_time: 1704067200000,
    })
  })

  test('joins multi-segment text', () => {
    // Given
    const comment = {
      id: 'comment-1',
      text: [['Hello '], ['world']],
      parent_id: 'disc-1',
      created_by_id: 'user-1',
      created_time: 1704067200000,
    }

    // When
    const result = formatCommentValue(comment)

    // Then
    expect(result.text).toBe('Hello world')
  })

  test('preserves mention pointer character in text', () => {
    // Given
    const comment = {
      id: 'comment-1',
      text: [['‣', [['u', 'user-123']]], [' hello']],
      parent_id: 'disc-1',
      created_by_id: 'user-1',
      created_time: 1704067200000,
    }

    // When
    const result = formatCommentValue(comment)

    // Then
    expect(result.text).toBe('‣ hello')
  })

  test('includes attachments when blocks are provided', () => {
    // Given
    const comment = {
      id: 'comment-1',
      text: [['Check this']],
      parent_id: 'disc-1',
      created_by_id: 'user-1',
      created_time: 1704067200000,
      content: ['block-img-1', 'block-file-1'],
    }
    const blocks: Record<string, Record<string, unknown>> = {
      'block-img-1': {
        value: {
          id: 'block-img-1',
          type: 'image',
          properties: {
            title: [['screenshot.png']],
            source: [['attachment:abc:screenshot.png']],
          },
        },
        role: 'editor',
      },
      'block-file-1': {
        value: {
          id: 'block-file-1',
          type: 'file',
          properties: {
            title: [['doc.pdf']],
            source: [['attachment:def:doc.pdf']],
          },
        },
        role: 'editor',
      },
    }

    // When
    const result = formatCommentValue(comment, blocks)

    // Then
    expect(result.attachments).toEqual([
      { id: 'block-img-1', type: 'image', name: 'screenshot.png', source: 'attachment:abc:screenshot.png' },
      { id: 'block-file-1', type: 'file', name: 'doc.pdf', source: 'attachment:def:doc.pdf' },
    ])
  })

  test('omits attachments when comment has no content', () => {
    // Given
    const comment = {
      id: 'comment-1',
      text: [['No attachments']],
      parent_id: 'disc-1',
      created_by_id: 'user-1',
      created_time: 1704067200000,
    }

    // When
    const result = formatCommentValue(comment)

    // Then
    expect('attachments' in result).toBe(false)
  })

  test('omits attachments when blocks are not provided', () => {
    // Given
    const comment = {
      id: 'comment-1',
      text: [['Has content']],
      parent_id: 'disc-1',
      created_by_id: 'user-1',
      created_time: 1704067200000,
      content: ['block-1'],
    }

    // When
    const result = formatCommentValue(comment)

    // Then
    expect('attachments' in result).toBe(false)
  })
})

describe('formatDiscussionComments with attachments', () => {
  test('includes attachments from block recordMap', () => {
    // Given
    const discussions: Record<string, Record<string, unknown>> = {
      'disc-1': {
        value: {
          value: {
            id: 'disc-1',
            parent_id: 'page-1',
            comments: ['comment-1'],
          },
          role: 'editor',
        },
      },
    }
    const comments: Record<string, Record<string, unknown>> = {
      'comment-1': {
        value: {
          value: {
            id: 'comment-1',
            text: [['See attached']],
            parent_id: 'disc-1',
            created_by_id: 'user-1',
            created_time: 1704067200000,
            content: ['block-img'],
          },
          role: 'editor',
        },
      },
    }
    const blocks: Record<string, Record<string, unknown>> = {
      'block-img': {
        value: {
          value: {
            id: 'block-img',
            type: 'image',
            properties: {
              title: [['photo.png']],
              source: [['attachment:xyz:photo.png']],
            },
          },
          role: 'editor',
        },
      },
    }

    // When
    const result = formatDiscussionComments(discussions, comments, 'page-1', blocks)

    // Then
    expect(result.results[0].attachments).toEqual([
      { id: 'block-img', type: 'image', name: 'photo.png', source: 'attachment:xyz:photo.png' },
    ])
  })

  test('omits attachments field for comments without content', () => {
    // Given
    const discussions: Record<string, Record<string, unknown>> = {
      'disc-1': {
        value: {
          value: {
            id: 'disc-1',
            parent_id: 'page-1',
            comments: ['comment-1'],
          },
          role: 'editor',
        },
      },
    }
    const comments: Record<string, Record<string, unknown>> = {
      'comment-1': {
        value: {
          value: {
            id: 'comment-1',
            text: [['Plain text']],
            parent_id: 'disc-1',
            created_by_id: 'user-1',
            created_time: 1704067200000,
          },
          role: 'editor',
        },
      },
    }

    // When
    const result = formatDiscussionComments(discussions, comments, 'page-1', {})

    // Then
    expect('attachments' in result.results[0]).toBe(false)
  })
})
