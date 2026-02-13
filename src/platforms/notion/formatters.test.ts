import { describe, expect, test } from 'bun:test'
import {
  extractBlockText,
  extractCollectionName,
  extractNotionTitle,
  formatBlockChildren,
  formatBlockRecord,
  formatBlockUpdate,
  formatBlockValue,
  formatCollectionValue,
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
    const result = formatBlockChildren(blocks, false)

    // Then
    expect(result).toEqual({
      results: [
        { id: 'block-1', type: 'text', text: 'First' },
        { id: 'block-2', type: 'to_do', text: 'Second' },
      ],
      has_more: false,
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
    expect(result).toEqual([
      { id: 'block-1', type: 'text', text: 'First' },
      { id: 'block-2', type: 'to_do', text: 'Second' },
    ])
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
    expect(result).toEqual([
      {
        id: 'block-1',
        type: 'text',
        text: 'Parent',
        children: [{ id: 'block-3', type: 'text', text: 'Nested' }],
      },
    ])
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
    expect(result).toEqual([{ id: 'block-1', type: 'text', text: 'Present' }])
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
            고객사: '고래몰',
            상태: '완료',
            타입: '위젯 설치',
          },
        },
      ],
      has_more: false,
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
            담당자: 'user-123',
            연결: 'page-456',
            일자: '2026-01-01',
          },
        },
      ],
      has_more: false,
    })
  })

  test('handles new spaceId wrapping format from queryCollection', () => {
    // Given - new format: { spaceId, value: { value, role } }
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
            spaceId: 'space-1',
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
            spaceId: 'space-1',
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
      results: [{ id: 'row-1', properties: { Name: 'My Row' } }],
      has_more: true,
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
