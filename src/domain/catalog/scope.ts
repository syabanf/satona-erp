/** Record types that close the Satona scope gap analysis of 30 Oct 2026, grouped by module. */
import type { RecordType } from '../records'
import { ACTIVE, APPROVAL, B3_CLASSES, calc, date, entity, flow, master, money, n, note, num, pick, ref, round1, text, type } from './kit'

const period = () => text('period', 'Period (YYYY-MM)', { required: true, list: true })
const CURRENCIES = ['USD', 'EUR', 'SGD', 'CNY', 'JPY'] as const
const POSTED = flow(
  [
    ['draft', 'Draft', 'neutral'],
    ['posted', 'Posted', 'success'],
  ],
  [['draft', 'posted', 'Post', 'approve']],
)

/** Hazard classes that may share a zone; everything else must be segregated. */
export const segregation = (material: unknown, zone: unknown) => (material === zone || material === 'Non-B3' ? 'Compatible' : 'Violation, segregate')

export const SCOPE_MASTERS: readonly RecordType[] = [
  master('mdm', 'groupcoa', ['Group chart of accounts', 'Group account', 'GCOA'], 'name', [
    text('code', 'Group account code', { required: true, list: true }),
    text('name', 'Account name', { required: true, list: true }),
    pick('class', 'Class', ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'], { required: true, list: true }),
    pick('statement', 'Statement', ['Balance sheet', 'Profit and loss'], { required: true }),
    pick('locked', 'Structure locked by holding', ['Yes', 'No'], { required: true, list: true }),
  ], ACTIVE, { groupBy: 'class' }),
  master('vms', 'criteria', ['Rating criteria', 'Rating criterion', 'VRC'], 'name', [
    text('name', 'Criterion', { required: true, list: true }),
    num('weight', 'Weight', '%', { required: true, min: 0, max: 100, list: true }),
    note('measure', 'How it is measured'),
  ], ACTIVE, { sumField: 'weight' }),
  master('vms', 'avl', ['Approved vendor list', 'AVL entry', 'AVL'], 'vendor', [
    ref('vendor', 'Vendor', 'mdm.partners', { required: true, list: true }),
    pick('category', 'Category', ['Raw material', 'Chemicals', 'Spare parts', 'Freight', 'Services'], { required: true, list: true }),
    pick('standing', 'Standing', ['Approved', 'Conditional', 'Blacklisted'], { required: true, list: true }),
    ref('rating', 'Latest rating', 'vms.ratings'),
    date('validTo', 'Valid until', { required: true, list: true }),
    note('reason', 'Reason'),
  ], ACTIVE, { groupBy: 'standing', dateField: 'validTo' }),
  master('tms', 'geofences', ['Geofences', 'Geofence', 'GEO'], 'name', [
    text('name', 'Name', { required: true, list: true }),
    pick('kind', 'Kind', ['Plant', 'Customer site', 'Rest area', 'No-stop zone', 'Speed zone'], { required: true, list: true }),
    ref('location', 'Location', 'tms.locations'),
    num('radius', 'Radius', 'm', { required: true, min: 50 }),
    num('speedLimit', 'Speed limit', 'km/h', { list: true }),
  ], ACTIVE, { groupBy: 'kind' }),
  master('qc', 'methods', ['Test methods & instruments', 'Test method', 'TM'], 'parameter', [
    text('parameter', 'Parameter', { required: true, list: true }),
    text('method', 'Method (SNI / ISO)', { required: true, list: true }),
    text('instrument', 'Instrument', { required: true, list: true }),
    ref('calibration', 'Calibration record', 'eam.calibrations'),
    num('duration', 'Test time', 'min'),
  ], ACTIVE),
  master('inv', 'reorder', ['Reorder rules', 'Reorder rule', 'ROP'], 'material', [
    ref('material', 'Material', 'mdm.materials', { required: true, list: true }),
    ref('plant', 'Plant or tank farm', 'mdm.plants', { required: true, list: true }),
    num('dailyUse', 'Daily use', 't/day', { required: true, min: 0 }),
    num('leadTime', 'Lead time', 'days', { required: true, min: 0 }),
    num('safety', 'Safety stock', 't', { required: true, min: 0 }),
    calc('rop', 'Reorder point', (v) => round1(n(v, 'dailyUse') * n(v, 'leadTime') + n(v, 'safety')), { unit: 't', list: true }),
    num('onHand', 'On hand', 't', { required: true, min: 0 }),
    calc('action', 'Action', (v) => (n(v, 'onHand') <= n(v, 'dailyUse') * n(v, 'leadTime') + n(v, 'safety') ? 'Raise PR' : 'OK'), { list: true }),
    pick('trigger', 'Trigger', ['Auto PR', 'Notify procurement'], { required: true }),
  ], ACTIVE, { groupBy: 'action' }),
  master('sys', 'topics', ['Event topics', 'Event topic', 'TOP'], 'topic', [
    text('topic', 'Topic', { required: true, list: true }),
    pick('broker', 'Broker', ['Kafka', 'RabbitMQ'], { required: true, list: true }),
    text('producer', 'Producer', { required: true, list: true }),
    text('consumers', 'Consumers'),
    num('version', 'Schema version', undefined, { min: 1 }),
    num('lag', 'Consumer lag', 'msgs', { list: true }),
    num('dlq', 'Dead letters', undefined, { list: true }),
  ], ACTIVE, { groupBy: 'broker' }),
  master('sys', 'connectors', ['CDC connectors', 'CDC connector', 'CDC'], 'name', [
    text('name', 'Connector', { required: true, list: true }),
    text('source', 'Source schema.table', { required: true, list: true }),
    pick('sink', 'Sink', ['ClickHouse', 'S3 archive'], { required: true, list: true }),
    num('lag', 'Replication lag', 's', { list: true }),
    num('rows', 'Rows per day', undefined),
  ], ACTIVE, { groupBy: 'sink' }),
  master('sys', 'apis', ['API gateway routes', 'API route', 'GWR'], 'route', [
    text('route', 'Route', { required: true, list: true }),
    text('consumer', 'Consumer', { required: true, list: true }),
    text('version', 'Version', { required: true, list: true }),
    num('quota', 'Quota', 'req/min', { required: true, min: 1 }),
    num('p95', 'p95 latency', 'ms', { list: true }),
    num('errors', 'Error rate', '%'),
    date('keyExpiry', 'API key expires', { list: true }),
  ], ACTIVE, { dateField: 'keyExpiry' }),
  master('sys', 'idp', ['Identity providers', 'Identity provider', 'IDP'], 'name', [
    text('name', 'Name', { required: true, list: true }),
    pick('protocol', 'Protocol', ['OIDC', 'SAML 2.0', 'LDAP / AD'], { required: true, list: true }),
    pick('mfa', 'MFA', ['Required', 'Optional', 'Off'], { required: true, list: true }),
    text('realm', 'Keycloak realm'),
    num('users', 'Users', undefined, { list: true }),
  ], ACTIVE),
]

export const SCOPE: readonly RecordType[] = [
  type('mdm', 'changes', ['Master change requests', 'Change request', 'MCR'], 'subject', [
    text('subject', 'Subject', { required: true, list: true }),
    pick('object', 'Master', ['Customer', 'Vendor', 'Material'], { required: true, list: true }),
    pick('change', 'Change', ['Create', 'Update', 'Merge duplicate', 'Block'], { required: true, list: true }),
    ref('partner', 'Golden record', 'mdm.partners'),
    ref('duplicateOf', 'Duplicate of', 'mdm.partners'),
    pick('distribute', 'Distribute to', ['All entities', 'Rotama', 'Rodame', 'Roasi'], { required: true }),
    note('reason', 'Reason'),
  ], flow(
    [
      ['draft', 'Draft', 'neutral'],
      ['submitted', 'Submitted', 'info'],
      ['approved', 'Approved', 'success'],
      ['distributed', 'Distributed', 'success'],
      ['rejected', 'Rejected', 'danger'],
    ],
    [
      ['draft', 'submitted', 'Submit'],
      ['submitted', 'approved', 'Approve', 'approve'],
      ['submitted', 'rejected', 'Reject', 'approve'],
      ['approved', 'distributed', 'Distribute to entities'],
      ['rejected', 'draft', 'Reopen'],
    ],
  ), { groupBy: 'change' }),

  type('epm', 'adjustments', ['Consolidation journals', 'Consolidation journal', 'CJ'], 'description', [
    ref('consolidation', 'Consolidation run', 'epm.consolidations', { required: true, list: true, parent: true }),
    pick('kind', 'Kind', ['Intercompany elimination', 'Equity elimination', 'Reclassification', 'CTA'], { required: true, list: true }),
    text('description', 'Description', { required: true, list: true }),
    ref('debit', 'Debit group account', 'mdm.groupcoa', { required: true }),
    ref('credit', 'Credit group account', 'mdm.groupcoa', { required: true }),
    money('amount', 'Amount', { required: true, list: true }),
  ], APPROVAL, { sumField: 'amount', groupBy: 'kind' }),
  type('epm', 'revaluations', ['FX revaluation runs', 'FX revaluation', 'FXR'], 'period', [
    period(),
    entity('entity', 'Entity', { required: true, list: true }),
    pick('currency', 'Currency', CURRENCIES, { required: true, list: true }),
    num('exposure', 'Open foreign balance', undefined, { required: true }),
    num('bookRate', 'Book rate', 'IDR', { required: true, min: 0 }),
    num('closingRate', 'Closing rate', 'IDR', { required: true, min: 0 }),
    pick('kind', 'Kind', ['Unrealised', 'Realised', 'Translation (CTA)'], { required: true, list: true }),
    calc('gainLoss', 'FX gain or loss', (v) => Math.round(n(v, 'exposure') * (n(v, 'closingRate') - n(v, 'bookRate'))), { unit: 'Rp', list: true }),
  ], flow(
    [
      ['draft', 'Draft', 'neutral'],
      ['posted', 'Posted', 'success'],
      ['reversed', 'Reversed', 'info'],
    ],
    [
      ['draft', 'posted', 'Post', 'approve'],
      ['posted', 'reversed', 'Reverse next period'],
    ],
  ), { sumField: 'gainLoss', groupBy: 'currency' }),
  type('epm', 'forecasts', ['Rolling forecasts', 'Forecast', 'RF'], 'period', [
    period(),
    entity('entity', 'Entity', { required: true, list: true }),
    pick('scenario', 'Scenario', ['Base', 'Upside', 'Downside', 'What-if'], { required: true, list: true }),
    money('revenue', 'Revenue', { required: true }),
    money('cost', 'Cost', { required: true }),
    calc('ebitda', 'EBITDA', (v) => n(v, 'revenue') - n(v, 'cost'), { unit: 'Rp', list: true }),
  ], APPROVAL, { sumField: 'ebitda', groupBy: 'scenario' }),

  type('vms', 'demands', ['Group demand plans', 'Demand plan', 'DP'], 'material', [
    ref('material', 'Material', 'mdm.materials', { required: true, list: true }),
    period(),
    num('rodame', 'Rodame need', 't', { required: true, min: 0 }),
    num('roasi', 'Roasi need', 't', { required: true, min: 0 }),
    num('rotama', 'Rotama need', 't', { required: true, min: 0 }),
    calc('total', 'Group volume', (v) => n(v, 'rodame') + n(v, 'roasi') + n(v, 'rotama'), { unit: 't', list: true }),
    ref('contract', 'Umbrella contract', 'vms.contracts'),
  ], flow(
    [
      ['draft', 'Draft', 'neutral'],
      ['consolidated', 'Consolidated', 'info'],
      ['allocated', 'Allocated', 'success'],
    ],
    [
      ['draft', 'consolidated', 'Consolidate'],
      ['consolidated', 'allocated', 'Allocate volume', 'approve'],
      ['consolidated', 'draft', 'Send back'],
    ],
  ), { sumField: 'total', groupBy: 'material' }),
  type('vms', 'rfqs', ['RFQs & tenders', 'RFQ', 'RFQ'], 'title', [
    text('title', 'Title', { required: true, list: true }),
    ref('material', 'Material', 'mdm.materials', { required: true }),
    num('qty', 'Quantity', 't', { required: true, min: 1, list: true }),
    pick('mode', 'Mode', ['RFQ', 'Sealed tender', 'E-auction'], { required: true, list: true }),
    date('closes', 'Bidding closes', { required: true, list: true }),
    num('bids', 'Bids received'),
    money('bestPrice', 'Best price per t', { list: true }),
    ref('winner', 'Awarded to', 'mdm.partners'),
  ], flow(
    [
      ['open', 'Open for bids', 'info'],
      ['evaluating', 'Evaluating', 'warning'],
      ['awarded', 'Awarded', 'success'],
      ['cancelled', 'Cancelled', 'neutral'],
    ],
    [
      ['open', 'evaluating', 'Close bidding'],
      ['evaluating', 'awarded', 'Award', 'approve'],
      ['evaluating', 'open', 'Reopen bidding'],
      ['open', 'cancelled', 'Cancel'],
    ],
  ), { groupBy: 'mode', dateField: 'closes' }),
  type('vms', 'quotations', ['Vendor quotations', 'Quotation', 'QT'], 'title', [
    text('title', 'Quotation', { required: true, list: true }),
    ref('rfq', 'RFQ', 'vms.rfqs', { required: true, list: true, parent: true }),
    ref('vendor', 'Vendor', 'mdm.partners', { required: true, list: true }),
    money('price', 'Price per t', { required: true, list: true }),
    num('leadTime', 'Lead time', 'days', { required: true, min: 0 }),
    date('validTo', 'Valid until', { required: true }),
    note('notes', 'Notes'),
  ], flow(
    [
      ['submitted', 'Submitted', 'info'],
      ['shortlisted', 'Shortlisted', 'warning'],
      ['awarded', 'Awarded', 'success'],
      ['declined', 'Declined', 'neutral'],
    ],
    [
      ['submitted', 'shortlisted', 'Shortlist'],
      ['shortlisted', 'awarded', 'Award', 'approve'],
      ['submitted', 'declined', 'Decline'],
      ['shortlisted', 'declined', 'Decline'],
    ],
  ), { groupBy: 'vendor', dateField: 'validTo' }, true),
  type('vms', 'vendorinvoices', ['Vendor portal invoices', 'Portal invoice', 'VI'], 'invoiceNo', [
    text('invoiceNo', 'Invoice number', { required: true, list: true }),
    ref('order', 'Purchase order', 'vms.orders', { required: true, list: true, parent: true }),
    ref('vendor', 'Vendor', 'mdm.partners', { required: true, list: true }),
    money('amount', 'Amount', { required: true, list: true }),
    date('due', 'Due date', { required: true, list: true }),
  ], flow(
    [
      ['submitted', 'Submitted', 'info'],
      ['matched', 'Three-way matched', 'warning'],
      ['approved', 'Approved', 'success'],
      ['paid', 'Paid', 'success'],
      ['rejected', 'Rejected', 'danger'],
    ],
    [
      ['submitted', 'matched', 'Match PO and receipt'],
      ['matched', 'approved', 'Approve', 'approve'],
      ['approved', 'paid', 'Mark paid'],
      ['submitted', 'rejected', 'Reject'],
    ],
  ), { sumField: 'amount', dateField: 'due' }, true),

  type('grc', 'reports', ['Compliance reports', 'Compliance report', 'CR'], 'title', [
    text('title', 'Report', { required: true, list: true }),
    pick('regulator', 'Regulator', ['KLHK (SIMPEL)', 'Kemenhub', 'ESDM', 'Disnaker', 'BKPM (OSS)'], { required: true, list: true }),
    period(),
    entity('entity', 'Entity', { required: true, list: true }),
    num('evidence', 'Evidence files', undefined, { min: 0 }),
    text('signedBy', 'E-signed by'),
    date('due', 'Due to regulator', { required: true, list: true }),
  ], flow(
    [
      ['draft', 'Draft', 'neutral'],
      ['signed', 'E-signed', 'info'],
      ['submitted', 'Submitted', 'warning'],
      ['accepted', 'Accepted', 'success'],
    ],
    [
      ['draft', 'signed', 'E-sign', 'approve'],
      ['signed', 'draft', 'Revoke signature'],
      ['signed', 'submitted', 'Submit to regulator'],
      ['submitted', 'accepted', 'Mark accepted'],
    ],
  ), { groupBy: 'regulator', dateField: 'due' }),

  type('she', 'audits', ['K3 audits', 'K3 audit', 'KA'], 'title', [
    text('title', 'Audit', { required: true, list: true }),
    ref('area', 'Work area', 'she.areas', { required: true, list: true }),
    pick('standard', 'Standard', ['SMK3 PP 50/2012', 'ISO 45001', 'ISO 14001', 'Internal'], { required: true, list: true }),
    text('auditor', 'Lead auditor', { required: true }),
    date('date', 'Audit date', { required: true, list: true }),
    num('checklist', 'Checklist items', undefined, { required: true, min: 1 }),
    num('passed', 'Items passed', undefined, { required: true, min: 0 }),
    calc('score', 'Score', (v) => (n(v, 'checklist') ? round1((n(v, 'passed') / n(v, 'checklist')) * 100) : 0), { unit: '%', list: true }),
    num('findings', 'Findings raised', undefined, { min: 0 }),
  ], flow(
    [
      ['planned', 'Planned', 'neutral'],
      ['progress', 'In progress', 'info'],
      ['reported', 'Reported', 'warning'],
      ['closed', 'Closed', 'success'],
    ],
    [
      ['planned', 'progress', 'Start audit'],
      ['progress', 'reported', 'Issue report'],
      ['reported', 'closed', 'Close audit', 'approve'],
    ],
  ), { groupBy: 'standard', dateField: 'date' }),

  type('tms', 'telemetry', ['Tank telemetry', 'Telemetry reading', 'TLM'], 'reading', [
    text('reading', 'Reading point', { required: true, list: true }),
    ref('trip', 'Trip', 'tms.trips', { required: true, list: true, parent: true }),
    ref('device', 'Sensor', 'tms.devices', { required: true }),
    date('date', 'Date', { required: true, list: true }),
    num('temperature', 'Cargo temperature', '°C', { required: true, list: true }),
    num('pressure', 'Tank pressure', 'bar', { required: true, list: true }),
    num('tempMax', 'Temperature limit', '°C', { required: true }),
    num('pressureMax', 'Pressure limit', 'bar', { required: true }),
    calc('alarm', 'Condition', (v) => (n(v, 'temperature') > n(v, 'tempMax') || n(v, 'pressure') > n(v, 'pressureMax') ? 'Alarm' : 'Normal'), { list: true }),
  ], flow(
    [
      ['logged', 'Logged', 'info'],
      ['acknowledged', 'Acknowledged', 'success'],
    ],
    [['logged', 'acknowledged', 'Acknowledge']],
  ), { groupBy: 'alarm', dateField: 'date' }),

  type('wms', 'tasks', ['Putaway & picking tasks', 'Warehouse task', 'WT'], 'task', [
    text('task', 'Task', { required: true, list: true }),
    pick('kind', 'Kind', ['Putaway', 'Picking'], { required: true, list: true }),
    ref('lot', 'Lot', 'wms.lots', { required: true, list: true }),
    ref('bin', 'Target bin', 'wms.bins', { required: true }),
    pick('rule', 'Rotation rule', ['FEFO', 'FIFO'], { required: true, list: true }),
    pick('materialClass', 'Material hazard class', B3_CLASSES, { required: true }),
    pick('zoneClass', 'Zone hazard class', B3_CLASSES, { required: true }),
    calc('segregation', 'Segregation check', (v) => segregation(v.materialClass, v.zoneClass), { list: true }),
    text('scanned', 'Scanned barcode'),
  ], flow(
    [
      ['open', 'Open', 'neutral'],
      ['progress', 'In progress', 'info'],
      ['done', 'Confirmed', 'success'],
    ],
    [
      ['open', 'progress', 'Start'],
      ['progress', 'done', 'Confirm with scan'],
    ],
  ), { groupBy: 'segregation' }),

  type('bpf', 'moisture', ['Moisture adjustments', 'Moisture adjustment', 'MA'], 'lot', [
    text('lot', 'Lot', { required: true, list: true }),
    ref('order', 'Batch order', 'bpf.orders', { required: true, list: true, parent: true }),
    num('wet', 'Wet weight', 't', { required: true, min: 0 }),
    num('moisture', 'Measured moisture', '%', { required: true, min: 0, max: 30 }),
    num('standard', 'Standard moisture', '%', { required: true, min: 0, max: 30 }),
    calc('dry', 'Dry weight', (v) => round1(n(v, 'wet') * (1 - n(v, 'moisture') / 100)), { unit: 't' }),
    calc('delta', 'Quantity adjustment', (v) => round1((n(v, 'wet') * (1 - n(v, 'moisture') / 100)) / (1 - n(v, 'standard') / 100) - n(v, 'wet')), { unit: 't', list: true }),
    money('price', 'Standard cost per t', { required: true }),
    calc('value', 'Inventory value change', (v) => Math.round(((n(v, 'wet') * (1 - n(v, 'moisture') / 100)) / (1 - n(v, 'standard') / 100) - n(v, 'wet')) * n(v, 'price')), { unit: 'Rp', list: true }),
  ], POSTED, { sumField: 'value' }),
  type('mrp', 'planned', ['Planned orders', 'Planned order', 'PLO'], 'material', [
    ref('material', 'Material', 'mdm.materials', { required: true, list: true }),
    ref('requirement', 'Requirement', 'mrp.requirements', { parent: true }),
    num('qty', 'Quantity', 't', { required: true, min: 1, list: true }),
    num('leadTime', 'Lead time', 'days', { required: true, min: 0 }),
    num('safety', 'Safety stock', 't', { min: 0 }),
    date('release', 'Release by', { required: true, list: true }),
    ref('requisition', 'Converted to PR', 'vms.requisitions'),
  ], flow(
    [
      ['planned', 'Planned', 'neutral'],
      ['firmed', 'Firmed', 'info'],
      ['converted', 'Converted to PR', 'success'],
    ],
    [
      ['planned', 'firmed', 'Firm'],
      ['firmed', 'planned', 'Unfirm'],
      ['firmed', 'converted', 'Convert to PR'],
    ],
  ), { groupBy: 'material', dateField: 'release' }),

  type('cfp', 'campaigns', ['Production campaigns', 'Campaign', 'CMP'], 'name', [
    text('name', 'Campaign', { required: true, list: true }),
    ref('unit', 'Reactor or unit', 'cfp.units', { required: true, list: true }),
    date('start', 'Start', { required: true, list: true }),
    date('end', 'End'),
    num('planned', 'Planned output', 't', { required: true, min: 0 }),
    num('actual', 'Actual output', 't', { min: 0 }),
    num('standardYield', 'Standard yield', '%', { required: true, min: 0, max: 100 }),
    calc('attainment', 'Output vs plan', (v) => (n(v, 'planned') ? round1((n(v, 'actual') / n(v, 'planned')) * 100) : 0), { unit: '%', list: true }),
    calc('loss', 'Yield loss', (v) => round1(Math.max(0, n(v, 'planned') - n(v, 'actual'))), { unit: 't', list: true }),
    pick('lossCause', 'Main loss cause', ['None', 'Catalyst ageing', 'Feed impurity', 'Unplanned trip', 'Off-spec recycle', 'Leak'], { required: true }),
  ], flow(
    [
      ['planned', 'Planned', 'neutral'],
      ['running', 'Running', 'info'],
      ['closed', 'Closed', 'success'],
    ],
    [
      ['planned', 'running', 'Start campaign'],
      ['running', 'closed', 'Close and reconcile', 'approve'],
    ],
  ), { groupBy: 'lossCause', dateField: 'start' }),
  type('cfp', 'coproducts', ['Co-product cost allocation', 'Cost allocation', 'JCA'], 'product', [
    ref('campaign', 'Campaign', 'cfp.campaigns', { required: true, list: true, parent: true }),
    text('product', 'Product', { required: true, list: true }),
    pick('kind', 'Kind', ['Main product', 'Co-product', 'By-product'], { required: true, list: true }),
    num('qty', 'Quantity', 't', { required: true, min: 0 }),
    money('jointCost', 'Campaign joint cost', { required: true }),
    num('share', 'Relative sales value share', '%', { required: true, min: 0, max: 100 }),
    calc('allocated', 'Allocated cost', (v) => Math.round((n(v, 'jointCost') * n(v, 'share')) / 100), { unit: 'Rp', list: true }),
    calc('unitCost', 'Cost per t', (v) => (n(v, 'qty') ? Math.round((n(v, 'jointCost') * n(v, 'share')) / 100 / n(v, 'qty')) : 0), { unit: 'Rp' }),
  ], POSTED, { sumField: 'allocated', groupBy: 'kind' }),
]
