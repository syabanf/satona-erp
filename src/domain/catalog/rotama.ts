/** PT Rotama Indonesia (logistics): TMS, WMS, HAZ, FBL. */
import type { RecordType } from '../records'
import { ACTIVE, B3_CLASSES, calc, date, flow, money, n, note, num, pick, ref, round1, text, master, type } from './kit'

export const QUOTE_SERVICES = ['Bulk liquid tanker', 'Dry bulk truck', 'Container trucking', 'B3 escort'] as const
export const QUOTE_UNITS = ['trip', 't', 'day', 'lot'] as const
/** Standard services a quotation line can start from, with list prices. */
export const QUOTE_PRODUCTS: ReadonlyArray<{ item: string; unit: (typeof QUOTE_UNITS)[number]; price: number }> = [
  { item: 'Bulk liquid tanker 24 kL', unit: 'trip', price: 18_500_000 },
  { item: 'Dry bulk truck 30 t', unit: 'trip', price: 9_200_000 },
  { item: 'Container trucking 20 ft', unit: 'trip', price: 7_800_000 },
  { item: 'B3 escort and transport permit', unit: 'lot', price: 2_400_000 },
  { item: 'Demurrage at customer site', unit: 'day', price: 1_500_000 },
  { item: 'Loading supervision', unit: 'lot', price: 850_000 },
]

export const ROTAMA: readonly RecordType[] = [
  master('tms', 'vehicles', ['Vehicles', 'Vehicle', 'VEH'], 'plate', [
    text('plate', 'Plate', { required: true, list: true }),
    pick('kind', 'Body', ['Iso tank', 'Bulk tipper', 'Box truck', 'Flatbed'], { required: true, list: true }),
    num('capacity', 'Capacity', 't', { required: true, min: 1, list: true }),
    num('odometer', 'Odometer', 'km', { min: 0 }),
    date('lastService', 'Last service', { list: true }),
  ], flow(
    [
      ['available', 'Available', 'success'],
      ['inuse', 'On a trip', 'info'],
      ['maintenance', 'Maintenance', 'warning'],
    ],
    [
      ['available', 'inuse', 'Assign to trip'],
      ['inuse', 'available', 'Release'],
      ['available', 'maintenance', 'Send to workshop'],
      ['maintenance', 'available', 'Return to service'],
    ],
  ), { groupBy: 'kind' }),
  type('tms', 'trips', ['Trips', 'Trip', 'TRP'], 'route', [
    ref('route', 'Lane', 'tms.lanes', { required: true, list: true }),
    ref('vehicle', 'Vehicle', 'tms.vehicles', { required: true, list: true, parent: true }),
    ref('driver', 'Driver', 'tms.drivers', { required: true, list: true }),
    ref('cargo', 'Cargo', 'mdm.materials', { required: true }),
    num('qty', 'Load', 't', { required: true, min: 1 }),
    num('distance', 'Distance', 'km', { required: true, min: 1, list: true }),
    date('departure', 'Departure', { required: true, list: true }),
    num('stops', 'Drops', 'stops', { min: 1 }),
    money('tripCost', 'Trip cost (fuel, toll, driver)'),
  ], flow(
    [
      ['planned', 'Planned', 'neutral'],
      ['dispatched', 'Dispatched', 'info'],
      ['transit', 'In transit', 'warning'],
      ['delivered', 'Delivered', 'success'],
      ['cancelled', 'Cancelled', 'danger'],
    ],
    [
      ['planned', 'dispatched', 'Dispatch', 'approve'],
      ['planned', 'cancelled', 'Cancel'],
      ['dispatched', 'transit', 'Depart'],
      ['transit', 'delivered', 'Confirm delivery'],
    ],
  ), { sumField: 'distance', groupBy: 'driver', dateField: 'departure' }),

  master('wms', 'zones', ['Storage zones', 'Zone', 'ZON'], 'zone', [
    text('zone', 'Zone', { required: true, list: true }),
    ref('warehouse', 'Warehouse', 'wms.warehouses', { required: true, list: true, parent: true }),
    pick('hazard', 'Allowed class', B3_CLASSES, { required: true, list: true }),
    num('capacity', 'Capacity', 'pallets', { required: true, min: 1 }),
    num('used', 'In use', 'pallets', { required: true, min: 0 }),
    calc('utilisation', 'Utilisation', (v) => (n(v, 'capacity') ? round1((n(v, 'used') / n(v, 'capacity')) * 100) : 0), { unit: '%', list: true }),
  ], ACTIVE, { groupBy: 'hazard' }),
  type('wms', 'lots', ['Stock lots', 'Stock lot', 'SL'], 'lotNo', [
    text('lotNo', 'Lot / batch', { required: true, list: true }),
    ref('bin', 'Storage bin', 'wms.bins', { required: true, list: true, parent: true }),
    ref('material', 'Material', 'mdm.materials', { required: true, list: true }),
    ref('zone', 'Zone', 'wms.zones'),
    num('qty', 'Quantity', 't', { required: true, min: 0, list: true }),
    date('expiry', 'Expiry (FEFO)', { required: true, list: true }),
  ], flow(
    [
      ['received', 'Received', 'info'],
      ['stored', 'Stored', 'success'],
      ['picked', 'Picked', 'warning'],
      ['shipped', 'Shipped', 'neutral'],
    ],
    [
      ['received', 'stored', 'Put away'],
      ['stored', 'picked', 'Pick'],
      ['picked', 'shipped', 'Ship'],
    ],
  ), { sumField: 'qty', groupBy: 'zone', dateField: 'expiry' }),

  type('haz', 'manifests', ['B3 manifests', 'B3 manifest', 'MB3'], 'unNumber', [
    ref('trip', 'Trip', 'tms.trips', { required: true, list: true }),
    text('unNumber', 'UN number', { required: true, list: true }),
    pick('hazardClass', 'Hazard class', B3_CLASSES, { required: true, list: true }),
    num('qty', 'Quantity', 't', { required: true, min: 0 }),
    text('festronik', 'Festronik number', { list: true }),
    text('generator', 'Generator'),
    text('transporter', 'Transporter'),
    text('receiver', 'Receiver'),
  ], flow(
    [
      ['draft', 'Draft', 'neutral'],
      ['submitted', 'Submitted to KLHK', 'info'],
      ['accepted', 'Accepted', 'success'],
      ['rejected', 'Rejected', 'danger'],
    ],
    [
      ['draft', 'submitted', 'Submit to KLHK & Kemenhub'],
      ['submitted', 'accepted', 'Record acceptance', 'approve'],
      ['submitted', 'rejected', 'Record rejection', 'approve'],
      ['rejected', 'draft', 'Revise'],
    ],
  ), { groupBy: 'hazardClass' }),
  master('haz', 'certificates', ['Driver certificates', 'Certificate', 'CRT'], 'driver', [
    text('driver', 'Driver', { required: true, list: true }),
    pick('certType', 'Certificate', ['Dangerous goods (ADR)', 'Safety passport', 'SIM B2 Umum'], { required: true, list: true }),
    date('issued', 'Issued', { required: true }),
    date('expiry', 'Expires', { required: true, list: true }),
  ], flow(
    [
      ['valid', 'Valid', 'success'],
      ['expiring', 'Expiring', 'warning'],
      ['expired', 'Expired', 'danger'],
    ],
    [
      ['valid', 'expiring', 'Flag expiring'],
      ['expiring', 'valid', 'Renewed', 'approve'],
      ['expiring', 'expired', 'Mark expired'],
      ['expired', 'valid', 'Renewed', 'approve'],
    ],
  ), { groupBy: 'certType', dateField: 'expiry' }),

  master('fbl', 'rates', ['Rate cards', 'Rate card', 'RTE'], 'route', [
    text('route', 'Lane', { required: true, list: true }),
    money('fuel', 'Fuel per km', { required: true }),
    money('toll', 'Toll per km', { required: true }),
    money('driverCost', 'Driver and crew per km', { required: true }),
    money('overhead', 'Depreciation and overhead per km', { required: true }),
    calc('ratePerKm', 'Cost per km', (v) => n(v, 'fuel') + n(v, 'toll') + n(v, 'driverCost') + n(v, 'overhead'), { unit: 'Rp', list: true }),
    num('shrinkage', 'Shrinkage allowance', '%', { required: true, min: 0, max: 5 }),
    num('margin', 'Cost-plus margin', '%', { required: true, min: 0, max: 50, list: true }),
    calc('price', 'Price per km', (v) => Math.round((n(v, 'fuel') + n(v, 'toll') + n(v, 'driverCost') + n(v, 'overhead')) * (1 + (n(v, 'margin') + n(v, 'shrinkage')) / 100)), { unit: 'Rp', list: true }),
  ], ACTIVE),
  type('fbl', 'invoices', ['Freight invoices', 'Freight invoice', 'FIN'], 'billTo', [
    ref('trip', 'Trip', 'tms.trips', { required: true, list: true }),
    pick('billTo', 'Bill to', ['PT Rodame Indonesia', 'PT Roasi Sinergi Industri', 'External customer'], { required: true, list: true }),
    num('distance', 'Distance', 'km', { required: true, min: 1 }),
    money('ratePerKm', 'Cost per km', { required: true }),
    num('margin', 'Margin', '%', { required: true, min: 0, max: 50 }),
    calc('amount', 'Amount', (v) => Math.round(n(v, 'distance') * n(v, 'ratePerKm') * (1 + n(v, 'margin') / 100)), { unit: 'Rp', list: true }),
    date('issued', 'Invoice date', { required: true, list: true }),
    calc('billing', 'Billing', (v) => (String(v.billTo).startsWith('PT R') ? 'Intercompany' : 'External'), { list: true }),
    pick('pod', 'POD / BAST', ['Signed', 'Pending']),
  ], flow(
    [
      ['draft', 'Draft', 'neutral'],
      ['issued', 'Issued', 'info'],
      ['paid', 'Paid', 'success'],
    ],
    [
      ['draft', 'issued', 'Issue'],
      ['issued', 'paid', 'Record payment', 'approve'],
    ],
  ), { sumField: 'amount', groupBy: 'billTo', dateField: 'issued' }),
  type('fbl', 'inquiries', ['Customer inquiries', 'Inquiry', 'INQ'], 'commodity', [
    ref('customer', 'Customer', 'mdm.partners', { required: true, list: true }),
    pick('service', 'Service', QUOTE_SERVICES, { required: true, list: true }),
    ref('lane', 'Lane', 'tms.lanes', { required: true, list: true }),
    text('commodity', 'Commodity', { required: true, list: true }),
    num('trips', 'Trips', 'trip', { required: true, min: 1 }),
    date('needed', 'Needed by', { required: true, list: true }),
    text('pic', 'PIC'),
    text('phone', 'Phone'),
    text('email', 'Email'),
    note('notes', 'Notes'),
  ], flow(
    [
      ['new', 'New', 'info'],
      ['quoted', 'Quoted', 'warning'],
      ['closed', 'Closed', 'neutral'],
    ],
    [
      ['new', 'quoted', 'Mark quoted'],
      ['new', 'closed', 'Close'],
      ['quoted', 'closed', 'Close'],
    ],
  ), { groupBy: 'service', dateField: 'needed' }),
  {
    ...type('fbl', 'quotations', ['Customer quotations', 'Quotation', 'QTN'], 'title', [
      text('title', 'Service', { required: true, list: true }),
      ref('customer', 'Customer', 'mdm.partners', { required: true, list: true }),
      ref('branch', 'Branch', 'tms.locations', { required: true }),
      ref('inquiry', 'Inquiry', 'fbl.inquiries'),
      text('pic', 'PIC', { required: true }),
      text('phone', 'Phone', { required: true }),
      text('email', 'Email', { required: true }),
      date('loadDate', 'Loading date', { required: true, list: true }),
      date('unloadDate', 'Unloading date'),
      text('origin', 'Origin'),
      text('destination', 'Destination'),
      date('validTo', 'Valid until'),
      money('subtotal', 'Subtotal', { required: true }),
      money('discount', 'Discount'),
      num('ppnRate', 'PPN', '%', { min: 0, max: 12 }),
      calc('total', 'Total', (v) => Math.round((n(v, 'subtotal') - n(v, 'discount')) * (1 + n(v, 'ppnRate') / 100)), { unit: 'Rp', list: true }),
      note('notes', 'Order notes'),
    ], flow(
      [
        ['draft', 'Draft', 'neutral'],
        ['sent', 'Sent', 'info'],
        ['accepted', 'Accepted', 'success'],
        ['rejected', 'Rejected', 'danger'],
      ],
      [
        ['draft', 'sent', 'Send to customer', 'approve'],
        ['sent', 'accepted', 'Mark accepted'],
        ['sent', 'rejected', 'Mark rejected'],
      ],
    ), { sumField: 'total', groupBy: 'customer', dateField: 'loadDate' }),
    createPage: '/quotations/new',
  },
  type('fbl', 'quotelines', ['Quotation lines', 'Quotation line', 'QLN'], 'item', [
    ref('quotation', 'Quotation', 'fbl.quotations', { required: true, list: true, parent: true }),
    text('item', 'Item', { required: true, list: true }),
    num('qty', 'Quantity', undefined, { required: true, min: 1, list: true }),
    pick('unit', 'Unit', QUOTE_UNITS, { required: true }),
    money('price', 'Unit price', { required: true, list: true }),
    calc('amount', 'Amount', (v) => n(v, 'qty') * n(v, 'price'), { unit: 'Rp', list: true }),
  ], ACTIVE, { sumField: 'amount' }),
]

export const ROTAMA_MASTERS: readonly RecordType[] = [
  master('tms', 'drivers', ['Drivers', 'Driver', 'DRV'], 'name', [
    text('name', 'Name', { required: true, list: true }),
    text('sim', 'Licence (SIM B2 Umum)', { required: true }),
    text('phone', 'Phone', { list: true }),
    ref('base', 'Home depot', 'tms.locations', { list: true }),
    date('joined', 'Joined'),
  ], ACTIVE),
  master('tms', 'locations', ['Locations', 'Location', 'LOC'], 'name', [
    text('name', 'Name', { required: true, list: true }),
    pick('kind', 'Kind', ['Depot', 'Plant', 'Port', 'Ship-to'], { required: true, list: true }),
    text('city', 'City', { required: true, list: true }),
    text('latlng', 'Coordinates'),
  ], ACTIVE, { groupBy: 'kind' }),
  master('tms', 'lanes', ['Lanes', 'Lane', 'LN'], 'name', [
    text('name', 'Lane', { required: true, list: true }),
    ref('origin', 'Origin', 'tms.locations', { required: true }),
    ref('destination', 'Destination', 'tms.locations', { required: true }),
    num('distance', 'Distance', 'km', { required: true, min: 1, list: true }),
    num('hours', 'Standard transit', 'h', { required: true, min: 1, list: true }),
    pick('toll', 'Toll road', ['Yes', 'No'], { list: true }),
  ], ACTIVE),
  master('wms', 'warehouses', ['Warehouses', 'Warehouse', 'WH'], 'name', [
    text('code', 'Warehouse', { required: true, list: true }),
    text('name', 'Name', { required: true, list: true }),
    ref('plant', 'Plant', 'mdm.plants', { required: true, list: true }),
    num('area', 'Floor area', 'm²', { min: 0 }),
  ], ACTIVE),
  master('wms', 'bins', ['Storage bins', 'Bin', 'BIN'], 'bin', [
    text('bin', 'Bin', { required: true, list: true }),
    ref('zone', 'Zone', 'wms.zones', { required: true, list: true }),
    pick('kind', 'Type', ['Rack', 'Bulk floor', 'Drum bay', 'Cylinder cage'], { required: true, list: true }),
    num('maxPallets', 'Max pallets', undefined, { min: 1, list: true }),
  ], ACTIVE, { groupBy: 'kind' }),
  master('haz', 'unlist', ['UN dangerous goods list', 'UN entry', 'UN'], 'name', [
    text('un', 'UN number', { required: true, list: true }),
    text('name', 'Proper shipping name', { required: true, list: true }),
    pick('hazardClass', 'Class', B3_CLASSES, { required: true, list: true }),
    pick('packing', 'Packing group', ['I', 'II', 'III', 'n/a'], { required: true, list: true }),
    text('erg', 'ERG guide'),
  ], ACTIVE, { groupBy: 'hazardClass' }),
]

export const ADAS_EVENTS = ['Forward collision warning', 'Lane departure', 'Headway too close', 'Pedestrian warning', 'Over speed'] as const
export const DSM_EVENTS = ['Drowsiness', 'Distraction', 'Phone use', 'Smoking', 'No seatbelt', 'Camera covered'] as const

/** Fleet safety: P2H pre-trip check-in, gate check-in and in-cab ADAS / DSM events. */
export const FLEET_SAFETY: readonly RecordType[] = [
  master('tms', 'p2h', ['P2H checklist items', 'Checklist item', 'P2H'], 'item', [
    text('item', 'Check', { required: true, list: true }),
    pick('category', 'Category', ['Tyres & wheels', 'Brakes', 'Lights & horn', 'Tank, valves & hoses', 'Safety equipment', 'Documents'], { required: true, list: true }),
    pick('critical', 'Blocks departure if failed', ['Yes', 'No'], { required: true, list: true }),
  ], ACTIVE, { groupBy: 'category' }),
  master('tms', 'devices', ['ADAS & DSM devices', 'Device', 'DEV'], 'serial', [
    ref('vehicle', 'Vehicle', 'tms.vehicles', { required: true, list: true }),
    pick('kind', 'Device', ['ADAS front camera', 'DSM cabin camera', 'MDVR recorder'], { required: true, list: true }),
    text('serial', 'Serial no.', { required: true, list: true }),
    text('firmware', 'Firmware', { list: true }),
  ], flow(
    [
      ['online', 'Online', 'success'],
      ['offline', 'Offline', 'danger'],
      ['service', 'In service', 'warning'],
    ],
    [
      ['online', 'offline', 'Flag offline'],
      ['offline', 'online', 'Restore'],
      ['online', 'service', 'Send to service'],
      ['service', 'online', 'Reinstall'],
    ],
  ), { groupBy: 'kind' }),
  type('tms', 'checkins', ['Check-ins', 'Check-in', 'CHK'], 'kind', [
    pick('kind', 'Check-in', ['Pre-trip P2H', 'Gate in', 'Gate out'], { required: true, list: true }),
    ref('vehicle', 'Vehicle', 'tms.vehicles', { required: true, list: true }),
    ref('driver', 'Driver', 'tms.drivers', { required: true, list: true }),
    ref('location', 'Location', 'tms.locations', { required: true }),
    date('date', 'Date', { required: true, list: true }),
    text('time', 'Time', { required: true }),
    num('odometer', 'Odometer', 'km', { min: 0 }),
    pick('alcohol', 'Breath alcohol', ['Negative', 'Positive'], { required: true }),
    num('fatigue', 'DSM fatigue score', '/100', { min: 0, max: 100 }),
    num('passed', 'Checks passed', undefined, { min: 0 }),
    num('total', 'Checks done', undefined, { min: 0 }),
    text('seal', 'Tank seal no.'),
    calc('readiness', 'Readiness', (v) => (v.alcohol === 'Positive' || n(v, 'fatigue') > 60 || n(v, 'passed') < n(v, 'total') ? 'Hold' : 'Fit to drive'), { list: true }),
  ], flow(
    [
      ['submitted', 'Submitted', 'info'],
      ['cleared', 'Cleared', 'success'],
      ['blocked', 'Blocked', 'danger'],
    ],
    [
      ['submitted', 'cleared', 'Clear to depart', 'approve'],
      ['submitted', 'blocked', 'Block', 'approve'],
      ['blocked', 'submitted', 'Re-check'],
    ],
  ), { groupBy: 'readiness', dateField: 'date' }, true),
  type('tms', 'safety', ['ADAS & DSM events', 'Safety event', 'SAF'], 'event', [
    pick('event', 'Event', [...ADAS_EVENTS, ...DSM_EVENTS], { required: true, list: true }),
    calc('source', 'Source', (v) => ((ADAS_EVENTS as readonly string[]).includes(String(v.event)) ? 'ADAS' : 'DSM'), { list: true }),
    ref('vehicle', 'Vehicle', 'tms.vehicles', { required: true, list: true }),
    ref('driver', 'Driver', 'tms.drivers', { required: true, list: true }),
    pick('severity', 'Severity', ['Low', 'Medium', 'High', 'Critical'], { required: true, list: true }),
    num('speed', 'Speed', 'km/h', { min: 0 }),
    date('date', 'Date', { required: true }),
    num('hour', 'Hour of day', undefined, { min: 0, max: 23 }),
    text('place', 'Where'),
    note('coaching', 'Coaching note'),
  ], flow(
    [
      ['new', 'New', 'danger'],
      ['reviewed', 'Reviewed', 'warning'],
      ['coached', 'Driver coached', 'info'],
      ['closed', 'Closed', 'success'],
      ['false', 'False alarm', 'neutral'],
    ],
    [
      ['new', 'reviewed', 'Review video'],
      ['reviewed', 'coached', 'Record coaching', 'approve'],
      ['reviewed', 'false', 'Mark false alarm'],
      ['coached', 'closed', 'Close'],
    ],
  ), { groupBy: 'event', dateField: 'date' }),
]
