// Whether the help dialog is up. A store rather than App state because its two
// triggers sit in different branches of the tree — the burger menu opens it,
// the editor's `?` toggles it and has to know it is open to mute its own
// shortcuts — and neither is a child of the other.
import { create } from 'zustand'

export const useHelpDialog = create<{ open: boolean }>(() => ({ open: false }))

export const openHelp = () => useHelpDialog.setState({ open: true })
export const closeHelp = () => useHelpDialog.setState({ open: false })
export const toggleHelp = () => useHelpDialog.setState((s) => ({ open: !s.open }))
