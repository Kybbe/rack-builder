import type { Theme } from '../state/store'

/** Scene colours. Kept in step with the tokens in ui/theme.css by hand: the canvas cannot read CSS variables. */
export interface SceneTheme {
  background: string
  grid: string
  gridMajor: string
  frame: string
  edge: string
  cadBody: string
  cadFace: string
  cadDetail: string
  accent: string
  danger: string
  text: string
}

export const SCENE: Record<Theme, SceneTheme> = {
  dark: {
    background: '#15171a',
    grid: '#23272c',
    gridMajor: '#30353c',
    frame: '#4a505a',
    edge: '#8b93a0',
    cadBody: '#2a2e34',
    cadFace: '#343941',
    cadDetail: '#15171a',
    accent: '#ff6a1f',
    danger: '#e5484d',
    text: '#aab1bc',
  },
  light: {
    background: '#f4f5f6',
    grid: '#e3e5e8',
    gridMajor: '#cfd3d8',
    frame: '#9aa1ab',
    edge: '#4f5661',
    cadBody: '#e6e8eb',
    cadFace: '#f3f4f6',
    cadDetail: '#aeb4bd',
    accent: '#e2530a',
    danger: '#cd2b31',
    text: '#59616c',
  },
}
