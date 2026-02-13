import { useState, useEffect, useRef } from 'react';

export interface PromptField {
  key: string;
  label: string;
  type: 'text' | 'select';
  placeholder?: string;
  defaultValue?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
}

interface InlinePromptProps {
  isOpen: boolean;
  title: string;
  fields: PromptField[];
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}

/**
 * InlinePrompt - A keyboard-only inline prompt for creating/editing entities.
 * No modals, no mouse required. All fields are navigable via keyboard.
 */
export default function InlinePrompt({
  isOpen,
  title,
  fields,
  onSubmit,
  onCancel
}: InlinePromptProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());
  const inputRefs = useRef<(HTMLInputElement | HTMLSelectElement | null)[]>([]);

  // Initialize values when opening
  useEffect(() => {
    if (isOpen) {
      const initialValues: Record<string, string> = {};
      fields.forEach(field => {
        initialValues[field.key] = field.defaultValue || '';
      });
      setValues(initialValues);
      setCurrentFieldIndex(0);
      setValidationErrors(new Set());
      
      // Focus first input after render
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    }
  }, [isOpen, fields]);

  // Focus current field
  useEffect(() => {
    if (isOpen && inputRefs.current[currentFieldIndex]) {
      inputRefs.current[currentFieldIndex]?.focus();
    }
  }, [currentFieldIndex, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        if (index < fields.length - 1) {
          // Move to next field
          setCurrentFieldIndex(index + 1);
        } else {
          // Submit form
          handleSubmit();
        }
        break;
      case 'Tab':
        // Default tab behavior moves between fields
        break;
      case 'Escape':
        e.preventDefault();
        onCancel();
        break;
      case 'ArrowDown':
        if (fields[index].type === 'select') {
          // Let select handle it
          return;
        }
        e.preventDefault();
        setCurrentFieldIndex(i => Math.min(i + 1, fields.length - 1));
        break;
      case 'ArrowUp':
        if (fields[index].type === 'select') {
          // Let select handle it
          return;
        }
        e.preventDefault();
        setCurrentFieldIndex(i => Math.max(i - 1, 0));
        break;
    }
  };

  const handleSubmit = () => {
    // Validate required fields
    const errors = new Set<string>();
    fields.forEach(field => {
      if (field.required && !values[field.key]?.trim()) {
        errors.add(field.key);
      }
    });
    
    if (errors.size === 0) {
      onSubmit(values);
    } else {
      setValidationErrors(errors);
      // Focus first invalid field
      const firstErrorKey = Array.from(errors)[0];
      const firstErrorIndex = fields.findIndex(f => f.key === firstErrorKey);
      if (firstErrorIndex >= 0) {
        inputRefs.current[firstErrorIndex]?.focus();
      }
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="inline-prompt-backdrop" onClick={handleBackdropClick}>
      <div className="inline-prompt">
        {/* Title */}
        <div className="inline-prompt-title">
          {title}
        </div>

        {/* Fields */}
        <div className="inline-prompt-fields">
          {fields.map((field, index) => (
            <div 
              key={field.key}
              className={`inline-prompt-field ${
                index === currentFieldIndex ? 'active' : ''
              } ${validationErrors.has(field.key) ? 'error' : ''}`}
            >
              <label className="inline-prompt-label">
                {field.label}{field.required ? ' *' : ''}:
              </label>
              
              {field.type === 'select' ? (
                <select
                  ref={el => { inputRefs.current[index] = el; }}
                  value={values[field.key] || ''}
                  onChange={e => {
                    setValues(v => ({ ...v, [field.key]: e.target.value }));
                    setValidationErrors(errs => {
                      const newErrors = new Set(errs);
                      newErrors.delete(field.key);
                      return newErrors;
                    });
                  }}
                  onKeyDown={e => handleKeyDown(e, index)}
                  className="inline-prompt-select"
                >
                  {field.options?.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  ref={el => { inputRefs.current[index] = el; }}
                  type="text"
                  value={values[field.key] || ''}
                  onChange={e => {
                    setValues(v => ({ ...v, [field.key]: e.target.value }));
                    setValidationErrors(errs => {
                      const newErrors = new Set(errs);
                      newErrors.delete(field.key);
                      return newErrors;
                    });
                  }}
                  onKeyDown={e => handleKeyDown(e, index)}
                  placeholder={field.placeholder}
                  className="inline-prompt-input"
                  autoComplete="off"
                  spellCheck={false}
                />
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="inline-prompt-actions">
          <button
            type="button"
            className="inline-prompt-button inline-prompt-button-create"
            onClick={handleSubmit}
          >
            Create
          </button>
          <button
            type="button"
            className="inline-prompt-button inline-prompt-button-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <span className="inline-prompt-hint">
            <kbd>Enter</kbd> confirm • <kbd>Esc</kbd> cancel
          </span>
        </div>
      </div>
    </div>
  );
}
