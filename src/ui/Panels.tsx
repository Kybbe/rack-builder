import * as Tabs from '@radix-ui/react-tabs'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import { RackSettings } from './RackSettings'
import { CatalogPanel } from './CatalogPanel'
import { PlannerPanel } from './PlannerPanel'
import { CablesPanel } from './CablesPanel'
import { PrintPanel } from './PrintPanel'

export function Scroll({ children }: { children: React.ReactNode }) {
  return (
    <ScrollArea.Root className="scroll">
      <ScrollArea.Viewport className="scroll__view">{children}</ScrollArea.Viewport>
      <ScrollArea.Scrollbar orientation="vertical" className="scroll__bar">
        <ScrollArea.Thumb className="scroll__thumb" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  )
}

export function TabList() {
  return (
    <Tabs.List className="tabs" aria-label="Mode">
      <Tabs.Trigger value="build" className="tabs__tab">
        Build
      </Tabs.Trigger>
      <Tabs.Trigger value="cables" className="tabs__tab">
        Cables
      </Tabs.Trigger>
      <Tabs.Trigger value="plan" className="tabs__tab">
        Plan
      </Tabs.Trigger>
      <Tabs.Trigger value="print" className="tabs__tab">
        3D print
      </Tabs.Trigger>
    </Tabs.List>
  )
}

/** What each tab puts in the side panel (desktop) or the bottom sheet (phone). */
export function Panels() {
  return (
    <>
      <Tabs.Content value="build" className="side__tab">
        <RackSettings />
        <CatalogPanel mode="build" />
      </Tabs.Content>
      <Tabs.Content value="cables" className="side__tab">
        <CablesPanel />
      </Tabs.Content>
      <Tabs.Content value="plan" className="side__tab">
        <PlannerPanel />
        <CatalogPanel mode="plan" />
      </Tabs.Content>
      <Tabs.Content value="print" className="side__tab">
        <PrintPanel />
      </Tabs.Content>
    </>
  )
}
