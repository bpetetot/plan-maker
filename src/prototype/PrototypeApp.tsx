// PROTOTYPE — wayfinder ticket 05 (drawing interactions & editor layout).
// Plan: three radically different variants of the floor-plan editor, switchable
// via ?variant=, mounted as the whole dev app (the repo has no pages yet).
// Throwaway code: lives on the prototype/05-drawing-interactions branch only.
import { useState } from 'react'
import VariantA from './VariantA'
import VariantB from './VariantB'
import VariantC from './VariantC'
import { Switcher } from './Switcher'

const VARIANTS = [
  { key: 'A', name: 'Floating minimal · click-to-click walls', Comp: VariantA },
  { key: 'B', name: 'Workbench · drag-per-wall', Comp: VariantB },
  { key: 'C', name: 'Zen · keyboard & hover', Comp: VariantC },
]

export default function PrototypeApp() {
  const [variant, setVariant] = useState(() => new URLSearchParams(location.search).get('variant') ?? 'A')
  const change = (k: string) => {
    setVariant(k)
    const u = new URL(location.href)
    u.searchParams.set('variant', k)
    history.replaceState(null, '', u)
  }
  const cur = VARIANTS.find((v) => v.key === variant) ?? VARIANTS[0]
  return (
    <>
      <cur.Comp key={cur.key} />
      <Switcher variants={VARIANTS} current={cur.key} onChange={change} />
    </>
  )
}
