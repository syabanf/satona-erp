import {
  BarChart3,
  Biohazard,
  Boxes,
  CalendarClock,
  Cylinder,
  Database,
  Factory,
  FlaskConical,
  Flame,
  HardHat,
  Landmark,
  LayoutGrid,
  LifeBuoy,
  Microscope,
  Radar,
  Receipt,
  Route,
  Scale,
  Settings2,
  ShieldAlert,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Wallet,
  Warehouse,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

/** A picture for each module, so people find their area by sight rather than by a three-letter code. */
const ICONS: Record<string, LucideIcon> = {
  mdm: Database, epm: Landmark, vms: ShoppingCart, grc: Scale, bi: BarChart3, occ: Radar,
  hrs: Users, fin: Wallet, inv: Boxes, gas: LifeBuoy, she: HardHat, sys: Settings2,
  tms: Truck, wms: Warehouse, haz: Biohazard, fbl: Receipt, bpf: FlaskConical, mrp: CalendarClock,
  qc: Microscope, eam: Wrench, dms: Store, mes: Factory, cfp: Flame, ehs: ShieldAlert, tfm: Cylinder, gtr: Route,
}

export const moduleIcon = (id: string): LucideIcon => ICONS[id] ?? LayoutGrid
