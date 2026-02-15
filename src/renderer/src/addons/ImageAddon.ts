import type { Terminal, IDisposable, ITerminalAddon, IMarker } from '@xterm/xterm'

export interface ImageAddonOptions {
  /** Maximum image width in pixels (default: 800) */
  maxWidth?: number
  /** Maximum image height in pixels (default: 600) */
  maxHeight?: number
  /** Enable iTerm2 inline image protocol (default: true) */
  enableItermProtocol?: boolean
  /** Enable sixel graphics (default: false) - experimental */
  enableSixel?: boolean
  /** Preserve aspect ratio (default: true) */
  preserveAspectRatio?: boolean
}

interface PendingImage {
  data: string
  mimeType: string
  width?: number
  height?: number
  preserveAspectRatio: boolean
  marker: IMarker
}

/**
 * Image addon for xterm.js
 * Supports iTerm2 inline image protocol for displaying images in the terminal
 * 
 * Protocol reference: https://iterm2.com/documentation-images.html
 */
export class ImageAddon implements ITerminalAddon {
  private _terminal: Terminal | undefined
  private _disposables: IDisposable[] = []
  private _options: Required<ImageAddonOptions>
  private _imageContainer: HTMLElement | undefined
  private _pendingImages: Map<number, PendingImage> = new Map()
  private _scrollDisposable: IDisposable | undefined
  private _cachedCellHeight: number = 16

  constructor(options: ImageAddonOptions = {}) {
    this._options = {
      maxWidth: 800,
      maxHeight: 600,
      enableItermProtocol: true,
      enableSixel: false,
      preserveAspectRatio: true,
      ...options
    }
  }

  public activate(terminal: Terminal): void {
    this._terminal = terminal

    // Create image container overlay
    this._createImageContainer()

    // Cache initial cell height
    this._updateCachedCellHeight()

    // Add scroll listener for lazy image position updates
    this._scrollDisposable = terminal.onScroll(() => {
      this._updateImagePositions()
    })

    // Add resize listener to update cached cell height
    this._disposables.push(
      terminal.onResize(() => {
        this._updateCachedCellHeight()
        this._updateImagePositions()
      })
    )

    if (this._options.enableItermProtocol) {
      this._setupItermProtocol()
    }

    if (this._options.enableSixel) {
      this._setupSixelSupport()
    }
  }

  public dispose(): void {
    this._disposables.forEach(d => d.dispose())
    this._disposables.length = 0
    this._scrollDisposable?.dispose()
    this._scrollDisposable = undefined
    this._terminal = undefined

    if (this._imageContainer && this._imageContainer.parentNode) {
      this._imageContainer.parentNode.removeChild(this._imageContainer)
    }
    this._imageContainer = undefined
    this._pendingImages.clear()
  }

  /**
   * Display an inline image at the current cursor position
   */
  public displayInlineImage(
    data: Uint8Array | string,
    mimeType: string = 'image/png',
    options: {
      width?: number
      height?: number
      preserveAspectRatio?: boolean
    } = {}
  ): void {
    if (!this._terminal) return

    const base64Data = data instanceof Uint8Array
      ? btoa(String.fromCharCode(...data))
      : data

    const width = options.width || this._options.maxWidth
    const height = options.height || this._options.maxHeight
    const preserveAspectRatio = options.preserveAspectRatio ?? this._options.preserveAspectRatio

    // Create a marker at current cursor position
    const marker = this._terminal.registerMarker(0)
    if (!marker) return

    const pendingImage: PendingImage = {
      data: base64Data,
      mimeType,
      width,
      height,
      preserveAspectRatio,
      marker
    }

    this._pendingImages.set(marker.id, pendingImage)
    this._renderImage(marker.id)

    // Clean up when marker is disposed
    marker.onDispose(() => {
      this._pendingImages.delete(marker.id)
      this._removeImageElement(marker.id)
    })
  }

  /**
   * Clear all displayed images
   */
  public clearImages(): void {
    if (!this._imageContainer) return

    this._imageContainer.innerHTML = ''
    this._pendingImages.clear()
  }

  private _createImageContainer(): void {
    if (!this._terminal?.element) return

    this._imageContainer = document.createElement('div')
    this._imageContainer.className = 'xterm-image-addon-container'
    this._imageContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      overflow: hidden;
      z-index: 1;
    `

    // Insert after the terminal's screen element
    const screen = this._terminal.element.querySelector('.xterm-screen')
    if (screen && screen.parentNode) {
      screen.parentNode.insertBefore(this._imageContainer, screen.nextSibling)
    }
  }

  private _updateCachedCellHeight(): void {
    if (!this._terminal) return
    
    this._cachedCellHeight = this._terminal.rows > 0
      ? (this._terminal.element?.clientHeight || 400) / this._terminal.rows
      : 16
  }

  private _setupItermProtocol(): void {
    if (!this._terminal) return

    // Handle OSC 1337 sequence for inline images
    this._disposables.push(
      this._terminal.parser.registerOscHandler(1337, (data: string) => {
        return this._handleItermSequence(data)
      })
    )
  }

  private _handleItermSequence(data: string): boolean | Promise<boolean> {
    // Parse the sequence: File=name=...;inline=1:...
    const match = data.match(/^File=([^:]+):(.+)$/)
    if (!match) return false

    const params = match[1]
    const imageData = match[2]

    // Parse parameters
    const paramMap = new Map<string, string>()
    params.split(';').forEach(param => {
      const [key, value] = param.split('=')
      if (key && value) {
        paramMap.set(key, value)
      }
    })

    // Check if this is an inline image
    if (paramMap.get('inline') !== '1') return false

    // Decode base64 filename if present
    const name = paramMap.get('name')
      ? atob(paramMap.get('name')!)
      : 'image'

    const width = paramMap.get('width')
      ? parseInt(paramMap.get('width')!, 10)
      : undefined

    const height = paramMap.get('height')
      ? parseInt(paramMap.get('height')!, 10)
      : undefined

    const preserveAspectRatio = paramMap.get('preserveAspectRatio') !== '0'

    // Determine MIME type from name or default to PNG
    const mimeType = this._getMimeType(name)

    // Create marker and display image
    if (this._terminal) {
      const marker = this._terminal.registerMarker(0)
      if (marker) {
        const pendingImage: PendingImage = {
          data: imageData,
          mimeType,
          width,
          height,
          preserveAspectRatio,
          marker
        }

        this._pendingImages.set(marker.id, pendingImage)
        this._renderImage(marker.id)

        marker.onDispose(() => {
          this._pendingImages.delete(marker.id)
          this._removeImageElement(marker.id)
        })
      }
    }

    return true
  }

  private _setupSixelSupport(): void {
    // Sixel support is complex and would require a full sixel decoder
    // For now, this is a placeholder for future implementation
    console.log('Sixel support not yet implemented')
  }

  private _renderImage(markerId: number): void {
    const image = this._pendingImages.get(markerId)
    if (!image || !this._terminal || !this._imageContainer) return

    // Get marker position
    const line = image.marker.line
    const buffer = this._terminal.buffer.active

    // Calculate position
    const cellWidth = this._terminal.cols > 0
      ? (this._terminal.element?.clientWidth || 800) / this._terminal.cols
      : 8

    const cellHeight = this._terminal.rows > 0
      ? (this._terminal.element?.clientHeight || 400) / this._terminal.rows
      : 16

    const top = line * cellHeight
    const left = buffer.cursorX * cellWidth

    // Create image element
    const img = document.createElement('img')
    img.src = `data:${image.mimeType};base64,${image.data}`
    img.id = `xterm-image-${markerId}`
    img.style.cssText = `
      position: absolute;
      top: ${top}px;
      left: ${left}px;
      max-width: ${image.width || this._options.maxWidth}px;
      max-height: ${image.height || this._options.maxHeight}px;
      pointer-events: auto;
      ${image.preserveAspectRatio ? 'object-fit: contain;' : 'object-fit: fill;'}
    `

    // Remove any existing image with this marker ID
    this._removeImageElement(markerId)

    // Add to container
    this._imageContainer.appendChild(img)
  }

  private _removeImageElement(markerId: number): void {
    const existing = this._imageContainer?.querySelector(`#xterm-image-${markerId}`)
    if (existing) {
      existing.remove()
    }
  }

  private _updateImagePositions(): void {
    if (!this._terminal || !this._imageContainer) return

    // Use cached cell height instead of recalculating
    const cellHeight = this._cachedCellHeight

    this._pendingImages.forEach((image, markerId) => {
      const img = this._imageContainer!.querySelector(`#xterm-image-${markerId}`) as HTMLElement
      if (img) {
        const top = image.marker.line * cellHeight
        img.style.top = `${top}px`
      }
    })
  }

  private _getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase()
    const mimeTypes: Record<string, string> = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'bmp': 'image/bmp',
      'webp': 'image/webp',
      'svg': 'image/svg+xml'
    }
    return mimeTypes[ext || ''] || 'image/png'
  }
}

export default ImageAddon
