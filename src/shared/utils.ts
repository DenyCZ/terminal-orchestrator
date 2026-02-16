/**
 * Normalize a directory path for consistent lookup (lowercase, forward slashes)
 */
export function normalizeDirectory(directory: string): string {
  return directory.toLowerCase().replace(/\\/g, '/')
}
