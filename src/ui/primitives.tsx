import type { ReactNode } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import * as ToggleGroup from '@radix-ui/react-toggle-group'
import * as Select from '@radix-ui/react-select'
import * as SliderP from '@radix-ui/react-slider'
import * as SwitchP from '@radix-ui/react-switch'
import { useStore } from '../state/store'
import { formatLength, formatU, uToMm } from '../domain/units'

export function Tip({
  content,
  children,
  side = 'top',
}: {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tip" side={side} sideOffset={6} collisionPadding={8}>
          {content}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

/** "2U" that explains itself in mm and inches when hovered or focused. */
export function ULabel({ u, className }: { u: number; className?: string }) {
  const units = useStore((s) => s.units)
  return (
    <Tip content={formatU(u, units)}>
      <abbr className={`u ${className ?? ''}`} tabIndex={0} aria-label={formatU(u, units)}>
        {u}U
      </abbr>
    </Tip>
  )
}

/** A length in the chosen unit; the other unit shows on hover. */
export function Len({ mm, digits }: { mm: number; digits?: number }) {
  const units = useStore((s) => s.units)
  const other = units === 'mm' ? 'in' : 'mm'
  const text = digits === 0 && units === 'mm' ? `${Math.round(mm)} mm` : formatLength(mm, units)
  return (
    <Tip content={`${formatLength(mm, other)}${units === 'mm' ? ` · ${(mm / 10).toFixed(1)} cm` : ''}`}>
      <span className="len" tabIndex={0}>
        {text}
      </span>
    </Tip>
  )
}

export const uHeightText = (u: number) => `${uToMm(u).toFixed(1)} mm`

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  full,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; title?: string }[]
  label: string
  full?: boolean
}) {
  return (
    <ToggleGroup.Root
      type="single"
      className={`seg${full ? ' seg--full' : ''}`}
      value={value}
      aria-label={label}
      onValueChange={(v) => v && onChange(v as T)}
    >
      {options.map((o) => (
        <ToggleGroup.Item key={o.value} value={o.value} className="seg__item" title={o.title}>
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}

export function Picker({
  value,
  onChange,
  options,
  label,
  placeholder,
}: {
  value: string | undefined
  onChange: (v: string) => void
  options: { value: string; label: string; hint?: string }[]
  label: string
  placeholder?: string
}) {
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger className="picker" aria-label={label}>
        <Select.Value placeholder={placeholder} />
        <Select.Icon className="picker__chev" aria-hidden>
          ▾
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="menu" position="popper" sideOffset={4}>
          <Select.Viewport>
            {options.map((o) => (
              <Select.Item key={o.value} value={o.value} className="menu__item">
                <Select.ItemText>{o.label}</Select.ItemText>
                {o.hint && <span className="menu__hint">{o.hint}</span>}
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  onCommit,
  label,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  onCommit?: (v: number) => void
  label: string
}) {
  return (
    <SliderP.Root
      className="slider"
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={([v]) => v !== undefined && onChange(v)}
      onValueCommit={([v]) => v !== undefined && onCommit?.(v)}
    >
      <SliderP.Track className="slider__track">
        <SliderP.Range className="slider__range" />
      </SliderP.Track>
      <SliderP.Thumb className="slider__thumb" aria-label={label} />
    </SliderP.Root>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  id: string
}) {
  return (
    <label className="switch" htmlFor={id}>
      <SwitchP.Root id={id} className="switch__root" checked={checked} onCheckedChange={onChange}>
        <SwitchP.Thumb className="switch__thumb" />
      </SwitchP.Root>
      <span>{label}</span>
    </label>
  )
}

export function Field({ label, children, value }: { label: string; children: ReactNode; value?: ReactNode }) {
  return (
    <div className="field">
      <div className="field__head">
        <span className="field__label">{label}</span>
        {value !== undefined && <span className="field__value">{value}</span>}
      </div>
      {children}
    </div>
  )
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  label: string
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`Fewer: ${label}`}
      >
        −
      </button>
      <output>{value}</output>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`More: ${label}`}
      >
        +
      </button>
    </div>
  )
}
