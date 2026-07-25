import { page } from 'vitest/browser';
import { key } from './kit';

// DOM queries, not locators: a panel row's label and value are sibling spans
// with no accessible relation, so there is nothing to navigate from.
export const panel = () => document.querySelector('.panel');

// Scoped to the panel: a named room prints its name on the sheet too.
export const panelTitle = () => document.querySelector('.panel-title')?.textContent;

export const rowValue = (label: string) => {
  const rows = [...document.querySelectorAll('.panel-row')];
  const row = rows.find((r) => r.querySelector('.panel-row-label')?.textContent === label);
  return row?.querySelector('.panel-row-value')?.textContent;
};

// At most one number field: wall thickness or opening width, never both.
export const numberField = () => document.querySelector<HTMLInputElement>('.panel-number-input');
export const field = () => page.getByRole('spinbutton');
export const fieldValue = () => numberField()!.value;

// A commit happens on blur or Enter, not per keystroke — the helper does both.
export async function setField(value: string) {
  await field().fill(value);
  await key('Enter');
}
