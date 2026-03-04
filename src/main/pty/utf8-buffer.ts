/**
 * UTF-8 Boundary Buffer
 * 
 * Prevents encoding crashes by ensuring that incomplete UTF-8 sequences
 * at chunk boundaries are held back until the complete sequence arrives.
 * 
 * This is critical when reading from PTY streams where data may be split
 * at arbitrary byte boundaries, potentially cutting multi-byte UTF-8
 * characters in half.
 */

export class Utf8Buffer {
  private remainder: Buffer = Buffer.alloc(0)

  /**
   * Push new data into the buffer and get complete UTF-8 string
   * @param data New data from the stream
   * @returns Complete UTF-8 string (may be empty if waiting for more bytes)
   */
  push(data: Buffer): string {
    const combined = Buffer.concat([this.remainder, data])
    
    // Find the last valid UTF-8 boundary
    let validEnd = combined.length
    
    // Scan backwards from end to find incomplete UTF-8 sequences
    // UTF-8 sequences are at most 4 bytes
    for (let i = combined.length - 1; i >= Math.max(0, combined.length - 4); i--) {
      const byte = combined[i]
      
      // ASCII (0xxxxxxx) - always valid, stop scanning
      if ((byte & 0x80) === 0) {
        break
      }
      
      // Start byte of multi-byte sequence (11xxxxxx)
      if ((byte & 0xC0) === 0xC0) {
        // Determine expected sequence length
        let seqLen: number
        if ((byte & 0xF8) === 0xF0) {
          seqLen = 4 // 11110xxx - 4-byte sequence
        } else if ((byte & 0xF0) === 0xE0) {
          seqLen = 3 // 1110xxxx - 3-byte sequence
        } else if ((byte & 0xE0) === 0xC0) {
          seqLen = 2 // 110xxxxx - 2-byte sequence
        } else {
          // Invalid start byte, skip
          continue
        }
        
        // Check if we have the complete sequence
        if (combined.length - i < seqLen) {
          // Incomplete sequence - mark boundary here
          validEnd = i
        }
        break
      }
      
      // Continuation byte (10xxxxxx) - keep scanning backwards
    }
    
    // Save incomplete trailing bytes for next push
    this.remainder = combined.subarray(validEnd)
    
    // Return the valid portion as UTF-8 string
    return combined.subarray(0, validEnd).toString('utf8')
  }

  /**
   * Flush any remaining bytes in the buffer
   * Call this when the stream ends to get any remaining data
   * @returns Any remaining bytes as UTF-8 string (may contain replacement chars)
   */
  flush(): string {
    const remaining = this.remainder.toString('utf8')
    this.remainder = Buffer.alloc(0)
    return remaining
  }

  /**
   * Get the current size of the remainder buffer
   */
  get remainderSize(): number {
    return this.remainder.length
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.remainder = Buffer.alloc(0)
  }
}

/**
 * Escape Sequence Boundary Buffer
 * 
 * Prevents rendering glitches by ensuring that incomplete ANSI escape
 * sequences at chunk boundaries are held back until complete.
 * 
 * This prevents splitting CSI, OSC, DCS sequences which could cause
 * terminal rendering issues.
 */
export class EscapeAwareBuffer {
  private remainder: string = ''
  private static readonly MAX_REMAINDER = 256 // Cap to prevent memory issues

  /**
   * Push new data into the buffer and get complete, safe string
   * @param input New data from the stream
   * @returns String with complete escape sequences only
   */
  push(input: string): string {
    let data = this.remainder + input
    
    // Find safe split point: NOT inside an escape sequence
    const safe = this.findSafeBoundary(data)
    
    if (safe === data.length) {
      // Entire string is safe
      this.remainder = ''
      return data
    }
    
    if (safe === 0) {
      // Entire string is incomplete escape — hold it (with cap)
      if (data.length > EscapeAwareBuffer.MAX_REMAINDER) {
        // Give up and emit raw to prevent memory buildup
        this.remainder = ''
        return data
      }
      this.remainder = data
      return ''
    }
    
    // Split: emit safe portion, hold remainder
    this.remainder = data.slice(safe)
    return data.slice(0, safe)
  }

  /**
   * Find the last safe boundary in the string
   * (not inside an incomplete escape sequence)
   */
  private findSafeBoundary(data: string): number {
    // Scan from end to find incomplete ESC sequences
    let i = data.length - 1
    
    while (i >= 0) {
      const char = data[i]
      
      // Found ESC character - check if it starts an incomplete sequence
      if (char === '\x1b') {
        // This is the start of a potential escape sequence
        // Check what follows
        if (i + 1 >= data.length) {
          // ESC at end - incomplete
          return i
        }
        
        const next = data[i + 1]
        
        // CSI sequence: ESC [
        if (next === '[') {
          // Check if CSI is complete (ends with 0x40-0x7E)
          if (!this.isCSIComplete(data, i + 2)) {
            return i
          }
        }
        
        // OSC sequence: ESC ]
        if (next === ']') {
          // OSC ends with BEL (0x07) or ST (ESC \)
          if (!this.isOSCComplete(data, i + 2)) {
            return i
          }
        }
        
        // DCS sequence: ESC P
        if (next === 'P') {
          // DCS ends with ST (ESC \)
          if (!this.isDCSComplete(data, i + 2)) {
            return i
          }
        }
        
        // Other escape sequences are typically 2-3 chars
        // For safety, if we're at ESC and sequence seems incomplete, hold it
        if (i + 2 >= data.length) {
          return i
        }
      }
      
      i--
    }
    
    return data.length
  }

  private isCSIComplete(data: string, startIdx: number): boolean {
    // CSI format: ESC [ <params> <intermediate> <final>
    // Final byte is 0x40-0x7E (@A-Z[\]^_`a-z{|}~)
    for (let i = startIdx; i < data.length; i++) {
      const code = data.charCodeAt(i)
      if (code >= 0x40 && code <= 0x7E) {
        return true // Found final byte
      }
    }
    return false
  }

  private isOSCComplete(data: string, startIdx: number): boolean {
    // OSC format: ESC ] <command> <params> BEL or ST
    for (let i = startIdx; i < data.length; i++) {
      // BEL (0x07) terminates OSC
      if (data[i] === '\x07') {
        return true
      }
      // ST (String Terminator) = ESC \
      if (data[i] === '\x1b' && i + 1 < data.length && data[i + 1] === '\\') {
        return true
      }
    }
    return false
  }

  private isDCSComplete(data: string, startIdx: number): boolean {
    // DCS ends with ST (String Terminator) = ESC \
    for (let i = startIdx; i < data.length; i++) {
      if (data[i] === '\x1b' && i + 1 < data.length && data[i + 1] === '\\') {
        return true
      }
    }
    return false
  }

  /**
   * Flush any remaining data
   */
  flush(): string {
    const remaining = this.remainder
    this.remainder = ''
    return remaining
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.remainder = ''
  }
}
