import fs from 'node:fs'
import nodePath from 'node:path'

const IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/g

// http:, https:, data:, and the attachment: reference an upload already resolved to. A bare Windows
// drive letter is one character, so requiring two keeps `C:\photo.png` a local path.
const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]+:/i

export async function preprocessMarkdownImages(
  markdown: string,
  uploadFn: (filePath: string) => Promise<string>,
  basePath: string,
): Promise<string> {
  const dedupMap = new Map<string, string>()
  const matches = [...markdown.matchAll(IMAGE_PATTERN)]

  if (matches.length === 0) return markdown

  let result = markdown

  for (const match of matches) {
    const imagePath = unwrapDestination(match[2].trim())

    // Skip empty paths
    if (!imagePath.trim()) continue

    // Skip anything that is not a local path, including references a previous pass already uploaded
    if (URI_SCHEME_PATTERN.test(imagePath)) continue

    const resolvedPath = nodePath.resolve(basePath, imagePath)

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Image file not found: ${resolvedPath}`)
    }

    let uploadedUrl = dedupMap.get(resolvedPath)
    if (!uploadedUrl) {
      uploadedUrl = await uploadFn(resolvedPath)
      dedupMap.set(resolvedPath, uploadedUrl)
    }

    const title = match[3]
    const originalText = match[0]
    const destination = formatDestination(uploadedUrl)
    const replacement = title ? `![${match[1]}](${destination} "${title}")` : `![${match[1]}](${destination})`
    // A replacer function keeps `$&` and friends from being expanded out of a file name.
    result = result.replace(originalText, () => replacement)
  }

  return result
}

// A bare destination ends at the first space or parenthesis, which would truncate an
// `attachment:{fileId}:{name}` reference whose file name contains either.
function formatDestination(value: string): string {
  if (!/[\s()<>]/.test(value)) return value
  return `<${value.replace(/[<>\\]/g, '\\$&')}>`
}

// Markdown lets a destination be wrapped in angle brackets, which is how a path or an uploaded
// reference containing spaces is written. Unwrap it so what follows sees the value itself.
function unwrapDestination(value: string): string {
  if (!value.startsWith('<') || !value.endsWith('>')) return value
  return value.slice(1, -1).replace(/\\([<>\\])/g, '$1')
}
