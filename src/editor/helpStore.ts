// Store, not App state: the burger menu and the editor's `?` both drive it from
// different branches of the tree.
import { create } from 'zustand';

export const useHelpDialog = create<{ open: boolean }>(() => ({ open: false }));

export const openHelp = () => useHelpDialog.setState({ open: true });
export const closeHelp = () => useHelpDialog.setState({ open: false });
export const toggleHelp = () => useHelpDialog.setState((s) => ({ open: !s.open }));
