import { describe, expect, test } from 'bun:test'
import {
  extractBlockContent,
  extractPageTitle,
  extractPlainText,
  formatAppendResponse,
  formatBlock,
  formatBlockChildrenResponse,
  formatComment,
  formatCommentListResponse,
  formatDatabase,
  formatDatabaseListResults,
  formatDatabaseQueryResults,
  formatPage,
  simplifyDatabaseProperties,
  simplifyProperties,
  simplifyPropertyValue,
  simplifyUser,
} from './formatters'

describe('extractPlainText', () => {
  test('joins multiple rich text segments', () => {
    // Given
    const richText = [{ plain_text: 'Hello' }, { plain_text: ' ' }, { plain_text: 'Notion' }]

    // When
    const result = extractPlainText(richText)

    // Then
    expect(result).toBe('Hello Notion')
  })

  test('returns empty string for empty array', () => {
    // Given
    const richText: unknown[] = []

    // When
    const result = extractPlainText(richText)

    // Then
    expect(result).toBe('')
  })

  test('returns empty string for null input', () => {
    // Given
    const richText: unknown = null

    // When
    const result = extractPlainText(richText)

    // Then
    expect(result).toBe('')
  })
})

describe('extractPageTitle', () => {
  test('extracts title from title property', () => {
    // Given
    const page = {
      properties: {
        Name: {
          type: 'title',
          title: [{ plain_text: 'Roadmap' }],
        },
        Status: {
          type: 'select',
          select: { name: 'In progress' },
        },
      },
    }

    // When
    const result = extractPageTitle(page)

    // Then
    expect(result).toBe('Roadmap')
  })

  test('returns empty string when title property is missing', () => {
    // Given
    const page = {
      properties: {
        Status: {
          type: 'select',
          select: { name: 'Done' },
        },
      },
    }

    // When
    const result = extractPageTitle(page)

    // Then
    expect(result).toBe('')
  })
})

describe('simplifyUser', () => {
  test('returns id and name when name exists', () => {
    // Given
    const user = { id: 'user-1', name: 'Alice' }

    // When
    const result = simplifyUser(user)

    // Then
    expect(result).toEqual({ id: 'user-1', name: 'Alice' })
  })

  test('returns only id when name is null', () => {
    // Given
    const user = { id: 'user-2', name: null }

    // When
    const result = simplifyUser(user)

    // Then
    expect(result).toEqual({ id: 'user-2' })
  })
})

describe('simplifyPropertyValue', () => {
  test('simplifies title, rich_text, number, select, multi_select, date, checkbox, url, email, phone_number, and status', () => {
    // Given
    const titleProp = {
      type: 'title',
      title: [{ plain_text: 'Task title' }],
    }
    const richTextProp = {
      type: 'rich_text',
      rich_text: [{ plain_text: 'Long description' }],
    }
    const numberProp = {
      type: 'number',
      number: 42,
    }
    const selectProp = {
      type: 'select',
      select: { name: 'In progress' },
    }
    const multiSelectProp = {
      type: 'multi_select',
      multi_select: [{ name: 'A' }, { name: 'B' }],
    }
    const dateProp = {
      type: 'date',
      date: {
        start: '2024-01-01',
        end: '2024-01-05',
        time_zone: 'UTC',
      },
    }
    const checkboxProp = {
      type: 'checkbox',
      checkbox: true,
    }
    const urlProp = {
      type: 'url',
      url: 'https://example.com',
    }
    const emailProp = {
      type: 'email',
      email: 'alice@example.com',
    }
    const phoneProp = {
      type: 'phone_number',
      phone_number: '+1-555-0100',
    }
    const statusProp = {
      type: 'status',
      status: { name: 'Done' },
    }

    // When
    const title = simplifyPropertyValue(titleProp)
    const richText = simplifyPropertyValue(richTextProp)
    const number = simplifyPropertyValue(numberProp)
    const select = simplifyPropertyValue(selectProp)
    const multiSelect = simplifyPropertyValue(multiSelectProp)
    const date = simplifyPropertyValue(dateProp)
    const checkbox = simplifyPropertyValue(checkboxProp)
    const url = simplifyPropertyValue(urlProp)
    const email = simplifyPropertyValue(emailProp)
    const phone = simplifyPropertyValue(phoneProp)
    const status = simplifyPropertyValue(statusProp)

    // Then
    expect(title).toBe('Task title')
    expect(richText).toBe('Long description')
    expect(number).toBe(42)
    expect(select).toBe('In progress')
    expect(multiSelect).toEqual(['A', 'B'])
    expect(date).toEqual({ start: '2024-01-01', end: '2024-01-05' })
    expect(checkbox).toBe(true)
    expect(url).toBe('https://example.com')
    expect(email).toBe('alice@example.com')
    expect(phone).toBe('+1-555-0100')
    expect(status).toBe('Done')
  })

  test('handles null values and empty arrays for supported types', () => {
    // Given
    const nullDateProp = {
      type: 'date',
      date: null,
    }
    const emptyMultiSelectProp = {
      type: 'multi_select',
      multi_select: null,
    }
    const emptyPeopleProp = {
      type: 'people',
      people: null,
    }
    const emptyRelationProp = {
      type: 'relation',
      relation: null,
    }
    const nullSelectProp = {
      type: 'select',
      select: null,
    }

    // When
    const date = simplifyPropertyValue(nullDateProp)
    const multiSelect = simplifyPropertyValue(emptyMultiSelectProp)
    const people = simplifyPropertyValue(emptyPeopleProp)
    const relation = simplifyPropertyValue(emptyRelationProp)
    const select = simplifyPropertyValue(nullSelectProp)

    // Then
    expect(date).toBeNull()
    expect(multiSelect).toEqual([])
    expect(people).toEqual([])
    expect(relation).toEqual([])
    expect(select).toBeNull()
  })

  test('simplifies people, relation, created_by, and last_edited_by', () => {
    // Given
    const peopleProp = {
      type: 'people',
      people: [{ id: 'user-1', name: 'Alice' }, { id: 'user-2' }],
    }
    const relationProp = {
      type: 'relation',
      relation: [{ id: 'page-1' }, { id: 'page-2' }],
    }
    const createdByProp = {
      type: 'created_by',
      created_by: { id: 'user-created', name: 'Creator' },
    }
    const lastEditedByProp = {
      type: 'last_edited_by',
      last_edited_by: { id: 'user-edited' },
    }

    // When
    const people = simplifyPropertyValue(peopleProp)
    const relation = simplifyPropertyValue(relationProp)
    const createdBy = simplifyPropertyValue(createdByProp)
    const lastEditedBy = simplifyPropertyValue(lastEditedByProp)

    // Then
    expect(people).toEqual([{ id: 'user-1', name: 'Alice' }, { id: 'user-2' }])
    expect(relation).toEqual(['page-1', 'page-2'])
    expect(createdBy).toEqual({ id: 'user-created', name: 'Creator' })
    expect(lastEditedBy).toEqual({ id: 'user-edited' })
  })

  test('simplifies formula values for string and date types', () => {
    // Given
    const formulaStringProp = {
      type: 'formula',
      formula: {
        type: 'string',
        string: 'derived value',
      },
    }
    const formulaDateProp = {
      type: 'formula',
      formula: {
        type: 'date',
        date: {
          start: '2024-02-01',
          end: null,
          time_zone: 'UTC',
        },
      },
    }

    // When
    const formulaString = simplifyPropertyValue(formulaStringProp)
    const formulaDate = simplifyPropertyValue(formulaDateProp)

    // Then
    expect(formulaString).toBe('derived value')
    expect(formulaDate).toEqual({ start: '2024-02-01', end: null })
  })

  test('simplifies rollup values for array and number types', () => {
    // Given
    const rollupArrayProp = {
      type: 'rollup',
      rollup: {
        type: 'array',
        array: [
          { type: 'number', number: 10 },
          { type: 'title', title: [{ plain_text: 'Nested' }] },
        ],
        function: 'show_original',
      },
    }
    const rollupNumberProp = {
      type: 'rollup',
      rollup: {
        type: 'number',
        number: 99,
        function: 'sum',
      },
    }

    // When
    const rollupArray = simplifyPropertyValue(rollupArrayProp)
    const rollupNumber = simplifyPropertyValue(rollupNumberProp)

    // Then
    expect(rollupArray).toEqual({
      type: 'array',
      value: [10, 'Nested'],
      function: 'show_original',
    })
    expect(rollupNumber).toEqual({
      type: 'number',
      value: 99,
      function: 'sum',
    })
  })

  test('simplifies files, unique_id, verification, timestamps, and unknown types', () => {
    // Given
    const filesProp = {
      type: 'files',
      files: [
        {
          type: 'external',
          external: { url: 'https://cdn.example.com/a.png' },
        },
        {
          type: 'file',
          file: { url: 'https://secure.notion-static.com/b.pdf' },
        },
        {
          type: 'external',
          external: { url: '' },
        },
      ],
    }
    const uniqueIdProp = {
      type: 'unique_id',
      unique_id: {
        prefix: 'TASK',
        number: 123,
      },
    }
    const verificationProp = {
      type: 'verification',
      verification: {
        state: 'verified',
      },
    }
    const createdTimeProp = {
      type: 'created_time',
      created_time: '2024-01-01T00:00:00.000Z',
    }
    const editedTimeProp = {
      type: 'last_edited_time',
      last_edited_time: '2024-01-02T00:00:00.000Z',
    }
    const unknownProp = {
      type: 'mystery',
      mystery: { value: 7 },
    }

    // When
    const files = simplifyPropertyValue(filesProp)
    const uniqueId = simplifyPropertyValue(uniqueIdProp)
    const verification = simplifyPropertyValue(verificationProp)
    const createdTime = simplifyPropertyValue(createdTimeProp)
    const editedTime = simplifyPropertyValue(editedTimeProp)
    const unknown = simplifyPropertyValue(unknownProp)

    // Then
    expect(files).toEqual(['https://cdn.example.com/a.png', 'https://secure.notion-static.com/b.pdf'])
    expect(uniqueId).toEqual({ prefix: 'TASK', number: 123 })
    expect(verification).toEqual({ state: 'verified' })
    expect(createdTime).toBe('2024-01-01T00:00:00.000Z')
    expect(editedTime).toBe('2024-01-02T00:00:00.000Z')
    expect(unknown).toEqual({ type: 'mystery', value: { value: 7 } })
  })
})

describe('simplifyProperties', () => {
  test('simplifies all properties in an object map', () => {
    // Given
    const properties = {
      Name: {
        type: 'title',
        title: [{ plain_text: 'Task 1' }],
      },
      Done: {
        type: 'checkbox',
        checkbox: false,
      },
      Score: {
        type: 'number',
        number: 8,
      },
    }

    // When
    const result = simplifyProperties(properties)

    // Then
    expect(result).toEqual({
      Name: 'Task 1',
      Done: false,
      Score: 8,
    })
  })
})

describe('extractBlockContent', () => {
  test('extracts paragraph content', () => {
    // Given
    const block = {
      type: 'paragraph',
      paragraph: {
        rich_text: [{ plain_text: 'Paragraph text' }],
      },
    }

    // When
    const result = extractBlockContent(block)

    // Then
    expect(result).toBe('Paragraph text')
  })

  test('extracts heading_1 content', () => {
    // Given
    const block = {
      type: 'heading_1',
      heading_1: {
        rich_text: [{ plain_text: 'Heading One' }],
      },
    }

    // When
    const result = extractBlockContent(block)

    // Then
    expect(result).toBe('Heading One')
  })

  test('extracts code content', () => {
    // Given
    const block = {
      type: 'code',
      code: {
        rich_text: [{ plain_text: 'console.log(1)' }],
        language: 'typescript',
      },
    }

    // When
    const result = extractBlockContent(block)

    // Then
    expect(result).toBe('console.log(1)')
  })

  test('extracts image url content', () => {
    // Given
    const block = {
      type: 'image',
      image: {
        type: 'external',
        external: {
          url: 'https://images.example.com/photo.png',
        },
      },
    }

    // When
    const result = extractBlockContent(block)

    // Then
    expect(result).toBe('https://images.example.com/photo.png')
  })

  test('extracts child_page title', () => {
    // Given
    const block = {
      type: 'child_page',
      child_page: {
        title: 'Project Notes',
      },
    }

    // When
    const result = extractBlockContent(block)

    // Then
    expect(result).toBe('Project Notes')
  })

  test('returns empty string for divider', () => {
    // Given
    const block = {
      type: 'divider',
      divider: {},
    }

    // When
    const result = extractBlockContent(block)

    // Then
    expect(result).toBe('')
  })
})

describe('formatPage', () => {
  test('formats page object into simplified structure', () => {
    // Given
    const page = {
      id: 'page-123',
      url: 'https://notion.so/page-123',
      parent: { type: 'database_id', database_id: 'db-1' },
      archived: false,
      last_edited_time: '2024-01-10T10:00:00.000Z',
      properties: {
        Name: {
          type: 'title',
          title: [{ plain_text: 'Roadmap Item' }],
        },
        Status: {
          type: 'status',
          status: { name: 'In progress' },
        },
      },
    }

    // When
    const result = formatPage(page)

    // Then
    expect(result).toEqual({
      id: 'page-123',
      title: 'Roadmap Item',
      url: 'https://notion.so/page-123',
      properties: {
        Name: 'Roadmap Item',
        Status: 'In progress',
      },
      parent: { type: 'database_id', database_id: 'db-1' },
      archived: false,
      last_edited_time: '2024-01-10T10:00:00.000Z',
    })
  })
})

describe('simplifyDatabaseProperties', () => {
  test('maps database properties to type strings', () => {
    // Given
    const properties = {
      Name: { type: 'title' },
      Status: { type: 'select' },
      Due: { type: 'date' },
    }

    // When
    const result = simplifyDatabaseProperties(properties)

    // Then
    expect(result).toEqual({
      Name: 'title',
      Status: 'select',
      Due: 'date',
    })
  })
})

describe('formatDatabase', () => {
  test('formats database object with simplified schema', () => {
    // Given
    const database = {
      id: 'db-123',
      title: [{ plain_text: 'Project Tasks' }],
      url: 'https://notion.so/db-123',
      parent: { type: 'page_id', page_id: 'page-root' },
      last_edited_time: '2024-01-08T08:00:00.000Z',
      properties: {
        Name: { type: 'title' },
        Done: { type: 'checkbox' },
      },
    }

    // When
    const result = formatDatabase(database)

    // Then
    expect(result).toEqual({
      id: 'db-123',
      title: 'Project Tasks',
      url: 'https://notion.so/db-123',
      properties: {
        Name: 'title',
        Done: 'checkbox',
      },
      parent: { type: 'page_id', page_id: 'page-root' },
      last_edited_time: '2024-01-08T08:00:00.000Z',
    })
  })
})

describe('formatDatabaseQueryResults', () => {
  test('formats query response with multiple page results', () => {
    // Given
    const response = {
      results: [
        {
          id: 'page-1',
          url: 'https://notion.so/page-1',
          properties: {
            Name: {
              type: 'title',
              title: [{ plain_text: 'Task A' }],
            },
          },
        },
        {
          id: 'page-2',
          url: 'https://notion.so/page-2',
          properties: {
            Name: {
              type: 'title',
              title: [{ plain_text: 'Task B' }],
            },
          },
        },
      ],
      has_more: true,
      next_cursor: 'cursor-2',
    }

    // When
    const result = formatDatabaseQueryResults(response)

    // Then
    expect(result).toEqual({
      results: [
        {
          id: 'page-1',
          title: 'Task A',
          url: 'https://notion.so/page-1',
          properties: { Name: 'Task A' },
        },
        {
          id: 'page-2',
          title: 'Task B',
          url: 'https://notion.so/page-2',
          properties: { Name: 'Task B' },
        },
      ],
      has_more: true,
      next_cursor: 'cursor-2',
    })
  })
})

describe('formatDatabaseListResults', () => {
  test('formats database search response as list output', () => {
    // Given
    const response = {
      results: [
        {
          id: 'db-1',
          title: [{ plain_text: 'Engineering' }],
          url: 'https://notion.so/db-1',
        },
        {
          id: 'db-2',
          title: [{ plain_text: 'Marketing' }],
          url: 'https://notion.so/db-2',
        },
      ],
    }

    // When
    const result = formatDatabaseListResults(response)

    // Then
    expect(result).toEqual([
      {
        id: 'db-1',
        title: 'Engineering',
        url: 'https://notion.so/db-1',
      },
      {
        id: 'db-2',
        title: 'Marketing',
        url: 'https://notion.so/db-2',
      },
    ])
  })
})

describe('formatBlock', () => {
  test('formats paragraph block', () => {
    // Given
    const block = {
      id: 'block-1',
      type: 'paragraph',
      has_children: false,
      paragraph: {
        rich_text: [{ plain_text: 'Paragraph body' }],
      },
    }

    // When
    const result = formatBlock(block)

    // Then
    expect(result).toEqual({
      id: 'block-1',
      type: 'paragraph',
      content: 'Paragraph body',
      has_children: false,
    })
  })

  test('formats heading_1 block', () => {
    // Given
    const block = {
      id: 'block-2',
      type: 'heading_1',
      has_children: true,
      heading_1: {
        rich_text: [{ plain_text: 'Top Heading' }],
      },
    }

    // When
    const result = formatBlock(block)

    // Then
    expect(result).toEqual({
      id: 'block-2',
      type: 'heading_1',
      content: 'Top Heading',
      has_children: true,
    })
  })
})

describe('formatBlockChildrenResponse', () => {
  test('formats children response and preserves pagination', () => {
    // Given
    const response = {
      results: [
        {
          id: 'child-1',
          type: 'paragraph',
          has_children: false,
          paragraph: { rich_text: [{ plain_text: 'Line 1' }] },
        },
        {
          id: 'child-2',
          type: 'heading_1',
          has_children: false,
          heading_1: { rich_text: [{ plain_text: 'Line 2' }] },
        },
      ],
      has_more: false,
      next_cursor: null,
    }

    // When
    const result = formatBlockChildrenResponse(response)

    // Then
    expect(result).toEqual({
      results: [
        {
          id: 'child-1',
          type: 'paragraph',
          content: 'Line 1',
          has_children: false,
        },
        {
          id: 'child-2',
          type: 'heading_1',
          content: 'Line 2',
          has_children: false,
        },
      ],
      has_more: false,
      next_cursor: null,
    })
  })
})

describe('formatAppendResponse', () => {
  test('flattens chunked append responses to id and type array', () => {
    // Given
    const chunks = [
      {
        results: [
          { id: 'block-a', type: 'paragraph' },
          { id: 'block-b', type: 'to_do' },
        ],
      },
      {
        results: [{ id: 'block-c', type: 'heading_1' }],
      },
    ]

    // When
    const result = formatAppendResponse(chunks)

    // Then
    expect(result).toEqual({
      results: [
        { id: 'block-a', type: 'paragraph' },
        { id: 'block-b', type: 'to_do' },
        { id: 'block-c', type: 'heading_1' },
      ],
    })
  })
})

describe('formatComment', () => {
  test('formats a comment object with plain text and author', () => {
    // Given
    const comment = {
      id: 'comment-1',
      rich_text: [{ plain_text: 'Looks good to me' }],
      created_by: { id: 'user-1', name: 'Reviewer' },
      created_time: '2024-01-20T12:00:00.000Z',
    }

    // When
    const result = formatComment(comment)

    // Then
    expect(result).toEqual({
      id: 'comment-1',
      text: 'Looks good to me',
      author: { id: 'user-1', name: 'Reviewer' },
      created_time: '2024-01-20T12:00:00.000Z',
    })
  })
})

describe('formatCommentListResponse', () => {
  test('formats comment list response with pagination', () => {
    // Given
    const response = {
      results: [
        {
          id: 'comment-1',
          rich_text: [{ plain_text: 'First' }],
          created_by: { id: 'user-1', name: 'Alice' },
          created_time: '2024-01-20T12:00:00.000Z',
        },
        {
          id: 'comment-2',
          rich_text: [{ plain_text: 'Second' }],
          created_by: { id: 'user-2' },
          created_time: '2024-01-20T12:05:00.000Z',
        },
      ],
      has_more: true,
      next_cursor: 'comment-cursor-2',
    }

    // When
    const result = formatCommentListResponse(response)

    // Then
    expect(result).toEqual({
      results: [
        {
          id: 'comment-1',
          text: 'First',
          author: { id: 'user-1', name: 'Alice' },
          created_time: '2024-01-20T12:00:00.000Z',
        },
        {
          id: 'comment-2',
          text: 'Second',
          author: { id: 'user-2' },
          created_time: '2024-01-20T12:05:00.000Z',
        },
      ],
      has_more: true,
      next_cursor: 'comment-cursor-2',
    })
  })
})
