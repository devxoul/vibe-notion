export type InternalBlockDefinition = {
  type: string
  properties?: Record<string, unknown>
  format?: Record<string, unknown>
  fileIds?: string[]
  children?: InternalBlockDefinition[]
}
