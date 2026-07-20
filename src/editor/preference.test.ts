// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { loadGridVisible, saveGridVisible } from './grid'
import { loadMeasuresVisible, saveMeasuresVisible } from './measurePref'
import { booleanPreference } from './preference'
import { loadSnapEnabled, saveSnapEnabled } from './snapPref'

const pref = booleanPreference('plan-maker:test', 'off')

beforeEach(() => localStorage.clear())

describe('booleanPreference', () => {
  it('is on when nothing is stored', () => {
    expect(pref.load()).toBe(true)
  })

  it('stores nothing for the default, so an untouched device follows it', () => {
    pref.save(true)
    expect(localStorage.getItem('plan-maker:test')).toBeNull()
    expect(pref.load()).toBe(true)
  })

  it('stores the sentinel for the non-default choice', () => {
    pref.save(false)
    expect(localStorage.getItem('plan-maker:test')).toBe('off')
    expect(pref.load()).toBe(false)
  })

  it('reads as on for any other stored value', () => {
    localStorage.setItem('plan-maker:test', 'garbage')
    expect(pref.load()).toBe(true)
  })

  it('keeps preferences on distinct keys independent', () => {
    const other = booleanPreference('plan-maker:other', 'off')
    pref.save(false)
    expect(other.load()).toBe(true)
  })

  it('degrades silently when storage refuses the write', () => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new DOMException('quota')
    }
    try {
      expect(() => pref.save(false)).not.toThrow()
    } finally {
      Storage.prototype.setItem = setItem
    }
  })
})

// The three preferences adopting the helper must keep the keys and sentinels
// they shipped with — a rename would silently reset every existing device.
describe('the preferences built on it', () => {
  it('keeps the grid on plan-maker:grid / hidden', () => {
    saveGridVisible(false)
    expect(localStorage.getItem('plan-maker:grid')).toBe('hidden')
    expect(loadGridVisible()).toBe(false)
    saveGridVisible(true)
    expect(localStorage.getItem('plan-maker:grid')).toBeNull()
  })

  it('keeps snap on plan-maker:snap / off', () => {
    saveSnapEnabled(false)
    expect(localStorage.getItem('plan-maker:snap')).toBe('off')
    expect(loadSnapEnabled()).toBe(false)
    saveSnapEnabled(true)
    expect(localStorage.getItem('plan-maker:snap')).toBeNull()
  })

  it('keeps measures on plan-maker:measures / hidden', () => {
    saveMeasuresVisible(false)
    expect(localStorage.getItem('plan-maker:measures')).toBe('hidden')
    expect(loadMeasuresVisible()).toBe(false)
    saveMeasuresVisible(true)
    expect(localStorage.getItem('plan-maker:measures')).toBeNull()
  })
})
