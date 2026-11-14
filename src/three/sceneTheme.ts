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
  /** Cable colours by kind. The accent and the danger colour stay reserved for selection and problems. */
  cable: { ethernet: string; sfp: string; power: string }
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
    cable: { ethernet: '#4f8fd0', sfp: '#cfa93a', power: '#c9ced6' },
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
    cable: { ethernet: '#2f6fb5', sfp: '#a37d12', power: '#33383f' },
  },
}
