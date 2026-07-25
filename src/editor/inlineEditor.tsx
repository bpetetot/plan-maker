// CONTEXT.md: Interaction chrome — the box opened on the sheet to type a Room
// label or a Text. It commits on blur, whatever ended it: a key or a click away.
import { useRef, useState } from 'react';

type Field = HTMLInputElement | HTMLTextAreaElement;

interface InlineEditorProps {
  /** Plain Enter is a newline and Mod+Enter commits, instead of Enter committing. */
  multiline?: boolean;
  className: string;
  initial: string;
  style?: React.CSSProperties;
  /** Read again on every keystroke, so a box can grow with what is typed. */
  box: (value: string) => { x: number; y: number; width: number; height: number };
  /** The typed value, or null when Escape cancelled the edit. */
  onClose: (value: string | null) => void;
}

export function InlineEditor({ multiline, className, initial, style, box, onClose }: InlineEditorProps) {
  // Mirrored from the uncontrolled field rather than controlling it: the caret
  // stays the browser's business, and the box still follows the value.
  const [value, setValue] = useState(initial);
  // A ref: Escape blurs, and the blur handler reads it before a re-render lands.
  const cancelled = useRef(false);
  const { x, y, width, height } = box(value);

  const field = {
    className,
    style,
    defaultValue: initial,
    autoFocus: true,
    onFocus: (e: React.FocusEvent<Field>) => e.currentTarget.select(),
    onInput: (e: React.FormEvent<Field>) => setValue(e.currentTarget.value),
    onPointerDown: (e: React.PointerEvent<Field>) => e.stopPropagation(),
    onKeyDown: (e: React.KeyboardEvent<Field>) => {
      if (e.key === 'Escape') {
        cancelled.current = true;
        e.currentTarget.blur();
      } else if (e.key !== 'Enter') return;
      else if (!multiline) e.currentTarget.blur();
      else if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
    onBlur: (e: React.FocusEvent<Field>) => onClose(cancelled.current ? null : e.currentTarget.value),
  };

  return (
    <foreignObject x={x} y={y} width={width} height={height}>
      {multiline ? <textarea {...field} /> : <input {...field} />}
    </foreignObject>
  );
}
