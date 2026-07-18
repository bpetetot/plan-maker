# 01 — Plan rendering tech

Type: research
Status: resolved
Blocked by: —

## Question

Which rendering technology should power the interactive 2D floor plan editor in a
React + TypeScript + Vite app: plain SVG (React-managed), HTML Canvas 2D, or a
canvas library (Konva/react-konva, Pixi.js, or similar)?

Evaluate against: interactive editing needs (hit-testing, drag handles, snapping
feedback, zoom/pan), expected object counts for a home floor plan (small — tens of
walls, not thousands of shapes), text rendering for dimensions, PNG export ease,
bundle size, library maturity/maintenance, and how naturally each integrates with
React state. Recommend one option and state the runner-up.

## Answer

Recommendation: plain SVG, React-managed. Runner-up: Konva + react-konva.
At tens of shapes SVG is far below any performance ceiling and gives browser-native
per-element hit-testing, real DOM text for dimension labels, one-attribute zoom/pan
via viewBox, zero bundle cost, and a perfect fit with React state (shapes are JSX).
Its only cost, PNG export, is a small serialize-to-canvas utility (inline fonts).
react-konva (konva 10.3.0 / react-konva 19.2.5, active in 2026) is the fallback if
the scene ever grows to thousands of shapes; Pixi.js is overkill, raw Canvas 2D
rebuilds everything SVG gives for free, Paper.js is unmaintained (last release 2024).
Full findings: ../research/plan-rendering-tech.md
