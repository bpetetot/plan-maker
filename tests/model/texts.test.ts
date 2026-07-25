import { describe, expect, it } from 'vitest';
import { addText, deleteText, editTextContent, setTextSize, translateText } from '../../src/model/texts';
import { emptyPlan } from '../../src/model/types';

describe('texts', () => {
  it('addText stores a free-coordinate note at the medium default size', () => {
    const [next, id] = addText(emptyPlan(), 10, 20, 'Hello');
    expect(next.texts[id]).toEqual({ id, x: 10, y: 20, content: 'Hello', size: 'M' });
  });

  it('addText rounds coordinates to integer centimeters and keeps the chosen size', () => {
    const [next, id] = addText(emptyPlan(), 10.4, 19.6, 'Note', 'L');
    expect(next.texts[id]).toMatchObject({ x: 10, y: 20, size: 'L' });
  });

  it('translateText shifts the anchor, rounding to integer centimeters', () => {
    const [withText, id] = addText(emptyPlan(), 0, 0, 'Note');
    expect(translateText(withText, id, 150.6, 80.2).texts[id]).toMatchObject({ x: 151, y: 80 });
    expect(translateText(withText, 'nope', 5, 5)).toBe(withText);
  });

  it('editTextContent replaces the content and ignores an unknown text', () => {
    const [withText, id] = addText(emptyPlan(), 0, 0, 'Old');
    expect(editTextContent(withText, id, 'New').texts[id].content).toBe('New');
    expect(editTextContent(withText, 'nope', 'New')).toBe(withText);
  });

  it('setTextSize changes the preset and ignores an unknown text', () => {
    const [withText, id] = addText(emptyPlan(), 0, 0, 'Note');
    expect(setTextSize(withText, id, 'S').texts[id].size).toBe('S');
    expect(setTextSize(withText, 'nope', 'S')).toBe(withText);
  });

  it('deleteText removes the note and no-ops on an unknown id', () => {
    const [withText, id] = addText(emptyPlan(), 0, 0, 'Note');
    expect(deleteText(withText, id).texts).toEqual({});
    expect(deleteText(withText, 'nope')).toBe(withText);
  });
});
