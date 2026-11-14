import '@testing-library/jest-dom/vitest'

// jsdom has no layout, so nothing ever resizes; Radix sliders and switches only need the class to exist.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
