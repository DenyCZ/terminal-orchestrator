import type { Terminal, IDisposable, ITerminalAddon } from '@xterm/xterm'

export interface ClipboardAddonOptions {
  /** Enable copy on selection (default: true) */
  copyOnSelect?: boolean
  /** Enable paste on right-click (default: true) */
  pasteOnRightClick?: boolean
  /** Enable Ctrl+Shift+V paste (default: true) */
  ctrlShiftVPaste?: boolean
  /** Convert multiline clipboard to single line when pasting (default: false) */
  pasteMultilineAsSingleLine?: boolean
  /** Character to join lines with when pasting multiline (default: space) */
  multilineJoinChar?: string
}

/**
 * Clipboard addon for xterm.js
 * Provides copy-on-select, paste on right-click, and Ctrl+Shift+V paste functionality
 */
export class ClipboardAddon implements ITerminalAddon {
  private _terminal: Terminal | undefined
  private _disposables: IDisposable[] = []
  private _options: ClipboardAddonOptions

  constructor(options: ClipboardAddonOptions = {}) {
    this._options = {
      copyOnSelect: true,
      pasteOnRightClick: true,
      ctrlShiftVPaste: true,
      pasteMultilineAsSingleLine: false,
      multilineJoinChar: ' ',
      ...options
    }
  }

  public activate(terminal: Terminal): void {
    this._terminal = terminal

    if (this._options.copyOnSelect) {
      this._setupCopyOnSelect()
    }

    if (this._options.pasteOnRightClick) {
      this._setupPasteOnRightClick()
    }

    if (this._options.ctrlShiftVPaste) {
      this._setupCtrlShiftVPaste()
    }

    // Handle Ctrl+C for copy when text is selected
    this._setupCopyKeybinding()
  }

  public dispose(): void {
    this._disposables.forEach(d => d.dispose())
    this._disposables.length = 0
    this._terminal = undefined
  }

  /**
   * Copy the current selection to clipboard
   */
  public copySelection(): void {
    if (!this._terminal) return

    const selection = this._terminal.getSelection()
    if (selection) {
      this._writeToClipboard(selection)
    }
  }

  /**
   * Paste from clipboard
   */
  public async paste(): Promise<void> {
    if (!this._terminal) return

    try {
      let text = await navigator.clipboard.readText()
      if (text) {
        // Transform multiline to single line if enabled
        if (this._options.pasteMultilineAsSingleLine) {
          const joinChar = this._options.multilineJoinChar || ' '
          text = text.replace(/[\r\n]+/g, joinChar)
        }
        this._terminal.paste(text)
      }
    } catch (err) {
      // Clipboard access denied or not available
      console.warn('Failed to read from clipboard:', err)
    }
  }

  /**
   * Copy the entire terminal buffer
   */
  public copyAll(): void {
    if (!this._terminal) return

    const buffer = this._terminal.buffer.active
    let content = ''

    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i)
      if (line) {
        content += line.translateToString(true) + '\n'
      }
    }

    this._writeToClipboard(content.trimEnd())
  }

  private _setupCopyOnSelect(): void {
    if (!this._terminal) return

    let hasSelection = false

    this._disposables.push(
      this._terminal.onSelectionChange(() => {
        const selection = this._terminal!.getSelection()
        hasSelection = selection.length > 0
      })
    )

    // Copy when selection is complete (mouseup)
    const element = this._terminal.element
    if (element) {
      const handleMouseUp = (): void => {
        if (hasSelection) {
          this.copySelection()
          hasSelection = false
        }
      }

      element.addEventListener('mouseup', handleMouseUp)
      this._disposables.push({
        dispose: () => element.removeEventListener('mouseup', handleMouseUp)
      })
    }
  }

  private _setupPasteOnRightClick(): void {
    if (!this._terminal) return

    const element = this._terminal.element
    if (!element) return

    const handleContextMenu = async (e: MouseEvent): Promise<void> => {
      // Only paste if there's no selection (to allow native context menu on selection)
      const selection = this._terminal!.getSelection()
      if (!selection) {
        e.preventDefault()
        await this.paste()
      }
    }

    element.addEventListener('contextmenu', handleContextMenu)
    this._disposables.push({
      dispose: () => element.removeEventListener('contextmenu', handleContextMenu)
    })
  }

  private _setupCtrlShiftVPaste(): void {
    if (!this._terminal) return

    this._disposables.push(
      this._terminal.onKey(async ({ domEvent }) => {
        if (domEvent.ctrlKey && domEvent.shiftKey && domEvent.key === 'V') {
          domEvent.preventDefault()
          await this.paste()
        }
      })
    )
  }

  private _setupCopyKeybinding(): void {
    if (!this._terminal) return

    this._disposables.push(
      this._terminal.onKey(({ domEvent }) => {
        // Ctrl+C - copy if there's a selection, otherwise send interrupt
        if (domEvent.ctrlKey && domEvent.key === 'c') {
          const selection = this._terminal!.getSelection()
          if (selection) {
            domEvent.preventDefault()
            this.copySelection()
            // Clear selection after copy
            this._terminal!.clearSelection()
          }
        }
      })
    )
  }

  private async _writeToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
    } catch (err) {
      // Fallback for older browsers or non-secure contexts
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
  }
}

export default ClipboardAddon
