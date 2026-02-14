import type { KeyBinding } from '@shared/types'

export function formatBinding(binding: KeyBinding): string[] {
  const parts: string[] = []
  if (binding.ctrl) parts.push('Ctrl')
  if (binding.shift) parts.push('Shift')
  if (binding.alt) parts.push('Alt')
  if (binding.meta) parts.push('Meta')

  let key = binding.key
  if (key === ' ') key = 'Space'
  else if (key === 'Escape') key = 'Esc'
  else if (key === 'ArrowUp') key = '↑'
  else if (key === 'ArrowDown') key = '↓'
  else if (key === 'ArrowLeft') key = '←'
  else if (key === 'ArrowRight') key = '→'
  else if (key === 'Tab') key = 'Tab'
  else if (key === 'Enter') key = 'Enter'
  else if (key === 'Backspace') key = '⌫'
  else if (key === 'Delete') key = 'Del'
  else if (key.length === 1) key = key.toUpperCase()

  parts.push(key)
  return parts
}

export function formatBindingString(binding: KeyBinding): string {
  return formatBinding(binding).join(' + ')
}
