/** PT Satona (Holding): MDM, EPM, VMS, GRC, BI. */
import type { RecordType } from '../records'
import { ACTIVE, APPROVAL, B3_CLASSES, calc, date, entity, flow, money, n, note, num, pick, ref, round1, text, master, type } from './kit'

export const HOLDING: readonly RecordType[] = [
  master('mdm', 'accounts', ['Chart of accounts', 'Account', 'ACC'], 'name', [
    text('code', 'Account code', { required: true, list: true }),
    text('name', 'Account name', { required: true, list: true }),
    pick('class', 'Class', ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'], { required: true, list: true }),
    entity('entity', 'Used by', { list: true }),
  ], ACTIVE, { groupBy: 'class' }),
  master('mdm', 'partners', ['Business partners', 'Partner', 'BP'], 'name', [
    text('name', 'Name', { required: true, list: true }),
    pick('kind', 'Kind', ['Customer', 'Vendor', 'Intercompany'], { required: true, list: true }),
    text('npwp', 'NPWP'),
    text('city', 'City', { list: true }),
    entity('entity', 'Owner entity', { required: true, list: true }),
  ], ACTIVE, { groupBy: 'kind' }),
  master('mdm', 'materials', ['Material catalogue', 'Material', 'MAT'], 'name', [
    text('code', 'Material code', { required: true, list: true }),
    text('name', 'Name', { required: true, list: true }),
    pick('b3Class', 'B3 class', B3_CLASSES, { required: true, list: true }),
    pick('uom', 'Unit', ['t', 'm³', 'kg', 'L'], { required: true, list: true }),
  ], ACTIVE, { groupBy: 'b3Class' }),
  master('mdm', 'employees', ['Employees', 'Employee', 'EMP'], 'name', [
    text('nik', 'NIK', { required: true, list: true }),
    text('name', 'Name', { required: true, list: true }),
    entity('entity', 'Entity', { required: true, list: true }),
    text('department', 'Department', { required: true, list: true }),
    ref('orgunit', 'Org unit', 'hrs.orgunits', { parent: true }),
    ref('position', 'Position', 'hrs.positions'),
    pick('employment', 'Employment', ['Permanent', 'Fixed term', 'Outsourced'], { list: true }),
    date('joined', 'Joined'),
  ], ACTIVE, { groupBy: 'entity' }),

  type('epm', 'consolidations', ['Consolidation runs', 'Consolidation run', 'CON'], 'period', [
    text('period', 'Period (YYYY-MM)', { required: true, list: true }),
    money('revenue', 'Group revenue', { required: true, list: true }),
    money('eliminations', 'Intercompany eliminations', { required: true }),
    money('netIncome', 'Net income', { list: true }),
    calc('margin', 'Net margin', (v) => (n(v, 'revenue') ? round1((n(v, 'netIncome') / n(v, 'revenue')) * 100) : 0), { unit: '%', list: true }),
  ], flow(
    [
      ['draft', 'Draft', 'neutral'],
      ['reviewed', 'Reviewed', 'info'],
      ['posted', 'Posted', 'success'],
    ],
    [
      ['draft', 'reviewed', 'Mark reviewed'],
      ['reviewed', 'posted', 'Post', 'approve'],
      ['reviewed', 'draft', 'Send back'],
    ],
  ), { sumField: 'revenue' }),
  type('epm', 'intercompany', ['Intercompany entries', 'Intercompany entry', 'ICE'], 'description', [
    entity('from', 'From entity', { required: true, list: true }),
    entity('to', 'To entity', { required: true, list: true }),
    text('description', 'Description', { required: true, list: true }),
    money('amount', 'Amount', { required: true, list: true }),
    date('date', 'Posting date', { required: true }),
  ], flow(
    [
      ['unmatched', 'Unmatched', 'warning'],
      ['matched', 'Matched', 'info'],
      ['eliminated', 'Eliminated', 'success'],
    ],
    [
      ['unmatched', 'matched', 'Match'],
      ['matched', 'eliminated', 'Eliminate', 'approve'],
      ['matched', 'unmatched', 'Unmatch'],
    ],
  ), { sumField: 'amount', groupBy: 'from', dateField: 'date' }),
  master('epm', 'fx', ['FX rates', 'FX rate', 'FX'], 'currency', [
    pick('currency', 'Currency', ['USD', 'EUR', 'SGD', 'CNY', 'JPY'], { required: true, list: true }),
    num('rate', 'Rate to IDR', 'IDR', { required: true, min: 0, list: true }),
    date('date', 'Rate date', { required: true, list: true }),
  ], ACTIVE, { groupBy: 'currency', dateField: 'date' }),
  type('epm', 'budgets', ['Group budgets', 'Budget', 'BUD'], 'name', [
    text('name', 'Budget name', { required: true, list: true }),
    entity('entity', 'Entity', { required: true, list: true }),
    num('year', 'Fiscal year', undefined, { required: true, min: 2024, max: 2030 }),
    money('opex', 'Opex', { required: true }),
    money('capex', 'Capex', { required: true }),
    calc('total', 'Total', (v) => n(v, 'opex') + n(v, 'capex'), { unit: 'Rp', list: true }),
  ], APPROVAL, { sumField: 'total', groupBy: 'entity' }),

  type('vms', 'requisitions', ['Purchase requisitions', 'Purchase requisition', 'PR'], 'title', [
    text('title', 'Title', { required: true, list: true }),
    ref('material', 'Material', 'mdm.materials', { required: true }),
    num('qty', 'Quantity', 't', { required: true, min: 1, list: true }),
    entity('entity', 'Requesting entity', { required: true, list: true }),
    ref('vendor', 'Preferred vendor', 'mdm.partners'),
    money('value', 'Estimated value', { required: true, list: true }),
    date('needBy', 'Needed by', { required: true }),
  ], flow(
    [
      ['draft', 'Draft', 'neutral'],
      ['submitted', 'Submitted', 'info'],
      ['approved', 'Approved', 'success'],
      ['po', 'PO issued', 'success'],
      ['rejected', 'Rejected', 'danger'],
    ],
    [
      ['draft', 'submitted', 'Submit'],
      ['submitted', 'approved', 'Approve', 'approve'],
      ['submitted', 'rejected', 'Reject', 'approve'],
      ['approved', 'po', 'Issue PO'],
      ['rejected', 'draft', 'Reopen'],
    ],
  ), { sumField: 'value', groupBy: 'entity', dateField: 'needBy' }),
  type('vms', 'ratings', ['Supplier ratings', 'Supplier rating', 'VR'], 'period', [
    ref('vendor', 'Vendor', 'mdm.partners', { required: true, list: true }),
    text('period', 'Period', { required: true, list: true }),
    num('quality', 'Quality', 'pts', { required: true, min: 0, max: 100 }),
    num('delivery', 'On-time delivery', 'pts', { required: true, min: 0, max: 100 }),
    num('price', 'Price competitiveness', 'pts', { required: true, min: 0, max: 100 }),
    calc('score', 'Score', (v) => round1(n(v, 'quality') * 0.4 + n(v, 'delivery') * 0.35 + n(v, 'price') * 0.25), { list: true }),
    calc('grade', 'Grade', (v) => {
      const s = n(v, 'quality') * 0.4 + n(v, 'delivery') * 0.35 + n(v, 'price') * 0.25
      return s >= 85 ? 'A' : s >= 70 ? 'B' : 'C'
    }, { list: true }),
  ], APPROVAL, { groupBy: 'grade' }),

  type('grc', 'permits', ['Permits & licences', 'Permit', 'PRM'], 'name', [
    text('name', 'Permit', { required: true, list: true }),
    pick('issuer', 'Issuer', ['KLHK', 'Kemenhub', 'ESDM', 'Pemda', 'BKPM'], { required: true, list: true }),
    entity('entity', 'Holder', { required: true, list: true }),
    date('expiry', 'Expires', { required: true, list: true }),
  ], flow(
    [
      ['active', 'Active', 'success'],
      ['renewal', 'Renewal in progress', 'warning'],
      ['expired', 'Expired', 'danger'],
    ],
    [
      ['active', 'renewal', 'Start renewal'],
      ['renewal', 'active', 'Mark renewed', 'approve'],
      ['active', 'expired', 'Mark expired'],
      ['expired', 'renewal', 'Start renewal'],
    ],
  ), { groupBy: 'issuer', dateField: 'expiry' }),
  type('grc', 'findings', ['Audit findings', 'Finding', 'AF'], 'title', [
    text('title', 'Finding', { required: true, list: true }),
    pick('area', 'Area', ['Environment', 'K3 / EHS', 'Finance', 'IT', 'Legal'], { required: true, list: true }),
    pick('severity', 'Severity', ['Low', 'Medium', 'High', 'Critical'], { required: true, list: true }),
    entity('entity', 'Entity', { required: true }),
    text('owner', 'Owner', { required: true }),
    date('due', 'Due', { required: true, list: true }),
  ], flow(
    [
      ['open', 'Open', 'warning'],
      ['progress', 'In progress', 'info'],
      ['closed', 'Closed', 'success'],
    ],
    [
      ['open', 'progress', 'Start work'],
      ['progress', 'closed', 'Close', 'approve'],
      ['closed', 'open', 'Reopen', 'approve'],
    ],
  ), { groupBy: 'severity', dateField: 'due' }),
  type('grc', 'risks', ['Risk register', 'Risk', 'RSK'], 'title', [
    text('title', 'Risk', { required: true, list: true }),
    entity('entity', 'Entity', { required: true, list: true }),
    num('likelihood', 'Likelihood', '/5', { required: true, min: 1, max: 5 }),
    num('impact', 'Impact', '/5', { required: true, min: 1, max: 5 }),
    calc('score', 'Score', (v) => n(v, 'likelihood') * n(v, 'impact'), { list: true }),
    calc('level', 'Level', (v) => {
      const s = n(v, 'likelihood') * n(v, 'impact')
      return s >= 15 ? 'High' : s >= 8 ? 'Medium' : 'Low'
    }, { list: true }),
    text('owner', 'Owner'),
  ], flow(
    [
      ['open', 'Open', 'warning'],
      ['mitigating', 'Mitigating', 'info'],
      ['closed', 'Closed', 'success'],
    ],
    [
      ['open', 'mitigating', 'Start mitigation'],
      ['mitigating', 'closed', 'Close', 'approve'],
    ],
  ), { groupBy: 'level' }),

  master('bi', 'kpis', ['KPI targets', 'KPI', 'KPI'], 'kpi', [
    text('kpi', 'KPI', { required: true, list: true }),
    entity('entity', 'Entity', { required: true, list: true }),
    text('period', 'Period', { required: true }),
    num('target', 'Target', undefined, { required: true }),
    num('actual', 'Actual', undefined, { required: true }),
    calc('attainment', 'Attainment', (v) => (n(v, 'target') ? round1((n(v, 'actual') / n(v, 'target')) * 100) : 0), { unit: '%', list: true }),
  ], ACTIVE, { groupBy: 'entity' }),
]

export const HOLDING_MASTERS: readonly RecordType[] = [
  master('mdm', 'companies', ['Company codes', 'Company code', 'CC'], 'name', [
    text('code', 'Company code', { required: true, list: true }),
    text('name', 'Legal name', { required: true, list: true }),
    entity('entity', 'Entity', { required: true, list: true }),
    text('npwp', 'NPWP', { required: true }),
    text('address', 'Registered address'),
    pick('currency', 'Local currency', ['IDR', 'USD'], { required: true, list: true }),
  ], ACTIVE),
  master('mdm', 'plants', ['Plants & sites', 'Plant', 'PLT'], 'name', [
    text('code', 'Plant code', { required: true, list: true }),
    text('name', 'Name', { required: true, list: true }),
    ref('company', 'Company code', 'mdm.companies', { required: true, list: true }),
    pick('kind', 'Kind', ['Head office', 'Plant', 'Depot', 'Warehouse', 'Tank farm'], { required: true, list: true }),
    text('city', 'City', { required: true, list: true }),
  ], ACTIVE, { groupBy: 'kind' }),
  master('mdm', 'costcenters', ['Cost centres', 'Cost centre', 'KS'], 'name', [
    text('code', 'Cost centre', { required: true, list: true }),
    text('name', 'Name', { required: true, list: true }),
    ref('company', 'Company code', 'mdm.companies', { required: true, list: true }),
    text('owner', 'Person responsible'),
    money('budget', 'Annual budget', { list: true }),
  ], ACTIVE, { sumField: 'budget', groupBy: 'company' }),
  master('mdm', 'profitcenters', ['Profit centres', 'Profit centre', 'PC'], 'name', [
    text('code', 'Profit centre', { required: true, list: true }),
    text('name', 'Name', { required: true, list: true }),
    ref('company', 'Company code', 'mdm.companies', { required: true, list: true }),
    pick('segment', 'Segment', ['Fertiliser', 'Chemicals', 'Logistics', 'Corporate'], { required: true, list: true }),
  ], ACTIVE, { groupBy: 'segment' }),
  master('mdm', 'uom', ['Units of measure', 'Unit', 'UOM'], 'name', [
    text('code', 'Unit', { required: true, list: true }),
    text('name', 'Description', { required: true, list: true }),
    pick('dimension', 'Dimension', ['Mass', 'Volume', 'Count', 'Length', 'Time'], { required: true, list: true }),
    num('toBase', 'Factor to base unit', undefined, { required: true, min: 0, list: true }),
  ], ACTIVE, { groupBy: 'dimension' }),
  master('mdm', 'paymentterms', ['Payment terms', 'Payment term', 'PT'], 'name', [
    text('code', 'Key', { required: true, list: true }),
    text('name', 'Description', { required: true, list: true }),
    num('days', 'Net days', 'days', { required: true, min: 0, list: true }),
    num('discount', 'Cash discount', '%', { min: 0, max: 10 }),
  ], ACTIVE),
  master('mdm', 'banks', ['House banks', 'House bank', 'HB'], 'name', [
    text('name', 'Bank', { required: true, list: true }),
    ref('company', 'Company code', 'mdm.companies', { required: true, list: true }),
    text('account', 'Account number', { required: true, list: true }),
    pick('currency', 'Currency', ['IDR', 'USD'], { required: true, list: true }),
  ], ACTIVE),
  master('epm', 'periods', ['Fiscal periods', 'Fiscal period', 'FP'], 'period', [
    text('period', 'Period (YYYY-MM)', { required: true, list: true }),
    ref('company', 'Company code', 'mdm.companies', { required: true, list: true }),
  ], flow(
    [
      ['open', 'Open', 'success'],
      ['closing', 'Closing', 'warning'],
      ['closed', 'Closed', 'neutral'],
    ],
    [
      ['open', 'closing', 'Start closing'],
      ['closing', 'closed', 'Close period', 'approve'],
      ['closed', 'open', 'Reopen', 'approve'],
    ],
  )),
  master('vms', 'inforecords', ['Purchasing info records', 'Info record', 'IR'], 'material', [
    ref('vendor', 'Vendor', 'mdm.partners', { required: true, list: true }),
    ref('material', 'Material', 'mdm.materials', { required: true, list: true }),
    money('price', 'Net price per t', { required: true, list: true }),
    num('leadTime', 'Lead time', 'days', { required: true, min: 0, list: true }),
    ref('terms', 'Payment terms', 'mdm.paymentterms'),
  ], ACTIVE),
  master('vms', 'contracts', ['Outline contracts', 'Contract', 'CTR'], 'title', [
    text('title', 'Contract', { required: true, list: true }),
    ref('vendor', 'Vendor', 'mdm.partners', { required: true, list: true }),
    money('target', 'Target value', { required: true, list: true }),
    date('validTo', 'Valid to', { required: true, list: true }),
  ], APPROVAL, { sumField: 'target', dateField: 'validTo' }),
  master('grc', 'regulations', ['Regulations register', 'Regulation', 'REG'], 'title', [
    text('code', 'Reference', { required: true, list: true }),
    text('title', 'Title', { required: true, list: true }),
    pick('issuer', 'Issued by', ['KLHK', 'Kemenhub', 'Kemnaker', 'ESDM', 'Kemenperin'], { required: true, list: true }),
    pick('topic', 'Topic', ['B3 waste', 'Dangerous goods transport', 'K3', 'Emissions', 'Industry licence'], { required: true, list: true }),
  ], ACTIVE, { groupBy: 'topic' }),
]

/** Group Operations Command Centre, ported from the WIT GPI Command Center: units, alarms, escalation, sources, energy, projects. */
export const OCC_TYPES: readonly RecordType[] = [
  master('occ', 'units', ['Monitored units', 'Monitored unit', 'MU'], 'name', [
    text('tag', 'Tag', { required: true, list: true }),
    text('name', 'Unit', { required: true, list: true }),
    ref('site', 'Site', 'mdm.plants', { required: true, list: true }),
    pick('kind', 'Kind', ['Reactor', 'Granulator', 'Dryer', 'Boiler', 'Tank', 'Tanker fleet', 'Power feeder'], { required: true, list: true }),
    num('load', 'Current load', '%', { min: 0, max: 120 }),
    num('runHours', 'Run hours', 'h', { min: 0 }),
  ], flow(
    [
      ['running', 'Running', 'success'],
      ['standby', 'Standby', 'info'],
      ['tripped', 'Tripped', 'danger'],
      ['maintenance', 'Maintenance', 'warning'],
    ],
    [
      ['running', 'tripped', 'Record trip'],
      ['running', 'standby', 'Put on standby'],
      ['standby', 'running', 'Start'],
      ['tripped', 'running', 'Restart', 'approve'],
      ['running', 'maintenance', 'Hand to maintenance'],
      ['maintenance', 'running', 'Return to service'],
    ],
  ), { groupBy: 'kind' }),
  master('occ', 'register', ['Alarm register', 'Alarm definition', 'AD'], 'name', [
    text('code', 'Alarm code', { required: true, list: true }),
    text('name', 'Alarm', { required: true, list: true }),
    pick('kind', 'Category', ['Process', 'Equipment trip', 'Safety', 'Environment', 'Communication', 'Inventory'], { required: true, list: true }),
    pick('priority', 'Default priority', ['Critical', 'High', 'Medium', 'Low'], { required: true, list: true }),
    text('threshold', 'Trigger condition', { required: true }),
  ], ACTIVE, { groupBy: 'kind' }),
  master('occ', 'escalation', ['Escalation matrix', 'Escalation rule', 'ESC'], 'role', [
    pick('priority', 'Priority', ['Critical', 'High', 'Medium', 'Low'], { required: true, list: true }),
    pick('level', 'Level', ['1 · Site O&M', '2 · Command centre', '3 · Management'], { required: true, list: true }),
    text('role', 'Notify role', { required: true, list: true }),
    num('within', 'If not acknowledged within', 'min', { required: true, min: 1, list: true }),
    pick('channel', 'Channel', ['In-app', 'WhatsApp', 'Email', 'Phone call'], { required: true, list: true }),
  ], ACTIVE, { groupBy: 'priority' }),
  master('occ', 'sources', ['Data sources', 'Data source', 'DS'], 'name', [
    text('name', 'Source', { required: true, list: true }),
    ref('site', 'Site', 'mdm.plants', { required: true, list: true }),
    pick('kind', 'Kind', ['DCS / SCADA', 'PLC gateway', 'IoT tank gauges', 'Fleet GPS', 'CCTV NVR', 'Energy meter'], { required: true, list: true }),
    text('protocol', 'Protocol', { list: true }),
  ], flow(
    [
      ['connected', 'Connected', 'success'],
      ['degraded', 'Degraded', 'warning'],
      ['offline', 'Offline', 'danger'],
      ['planned', 'Not integrated', 'neutral'],
    ],
    [
      ['connected', 'degraded', 'Flag degraded'],
      ['degraded', 'offline', 'Flag offline'],
      ['degraded', 'connected', 'Restore'],
      ['offline', 'connected', 'Restore'],
      ['planned', 'connected', 'Commission', 'approve'],
    ],
  ), { groupBy: 'kind' }),
  master('occ', 'cameras', ['CCTV cameras', 'Camera', 'CAM'], 'name', [
    text('name', 'Camera', { required: true, list: true }),
    ref('site', 'Site', 'mdm.plants', { required: true, list: true }),
    pick('zone', 'Zone', ['Gate', 'Process area', 'Tank farm', 'Loading bay', 'Warehouse', 'Control room'], { required: true, list: true }),
    pick('analytics', 'Video analytics', ['None', 'PPE detection', 'Intrusion', 'Fire and smoke'], { list: true }),
  ], flow(
    [
      ['online', 'Online', 'success'],
      ['offline', 'Offline', 'danger'],
      ['planned', 'Planned', 'neutral'],
    ],
    [
      ['online', 'offline', 'Flag offline'],
      ['offline', 'online', 'Restore'],
      ['planned', 'online', 'Commission'],
    ],
  ), { groupBy: 'zone' }),

  type('occ', 'alarms', ['Alarms', 'Alarm', 'ALM'], 'message', [
    ref('unit', 'Unit', 'occ.units', { required: true, list: true }),
    ref('definition', 'Alarm', 'occ.register', { required: true, list: true }),
    pick('priority', 'Priority', ['Critical', 'High', 'Medium', 'Low'], { required: true, list: true }),
    text('message', 'Message', { required: true, list: true }),
    text('reading', 'Reading'),
    text('assignee', 'Assigned to'),
    pick('escalation', 'Escalation', ['1 · Site O&M', '2 · Command centre', '3 · Management']),
    note('resolution', 'Resolution'),
    date('raised', 'Raised', { required: true }),
  ], flow(
    [
      ['new', 'New', 'danger'],
      ['acknowledged', 'Acknowledged', 'warning'],
      ['assigned', 'Assigned', 'info'],
      ['resolved', 'Resolved', 'success'],
      ['closed', 'Closed', 'neutral'],
    ],
    [
      ['new', 'acknowledged', 'Acknowledge'],
      ['acknowledged', 'assigned', 'Assign'],
      ['assigned', 'resolved', 'Resolve'],
      ['resolved', 'closed', 'Close after review', 'approve'],
    ],
  ), { groupBy: 'priority', dateField: 'raised' }),
  type('occ', 'energy', ['Energy & fuel log', 'Energy reading', 'EN'], 'site', [
    ref('site', 'Site', 'mdm.plants', { required: true, list: true }),
    date('date', 'Date', { required: true, list: true }),
    num('power', 'Electricity', 'MWh', { required: true, min: 0, list: true }),
    num('gas', 'Natural gas', 'MMBTU', { min: 0 }),
    num('diesel', 'Diesel', 'kL', { min: 0, list: true }),
    num('output', 'Production', 't', { min: 0 }),
    calc('intensity', 'Energy intensity', (v) => (n(v, 'output') ? round1((n(v, 'power') * 1000) / n(v, 'output')) : 0), { unit: 'kWh/t', list: true }),
  ], flow(
    [
      ['reported', 'Reported', 'info'],
      ['validated', 'Validated', 'success'],
    ],
    [['reported', 'validated', 'Validate', 'approve']],
  ), { sumField: 'power', groupBy: 'site', dateField: 'date' }),
  type('occ', 'projects', ['Capex projects', 'Project', 'PRJ'], 'title', [
    text('title', 'Project', { required: true, list: true }),
    ref('site', 'Site', 'mdm.plants', { required: true, list: true }),
    money('budget', 'Budget', { required: true, list: true }),
    money('spent', 'Spent to date', { min: 0 }),
    num('progress', 'Progress', '%', { required: true, min: 0, max: 100, list: true }),
    text('contractor', 'Contractor'),
    date('due', 'Target completion', { required: true, list: true }),
  ], flow(
    [
      ['planned', 'Planned', 'neutral'],
      ['construction', 'Construction', 'info'],
      ['commissioning', 'Commissioning', 'warning'],
      ['done', 'Handed over', 'success'],
    ],
    [
      ['planned', 'construction', 'Start construction', 'approve'],
      ['construction', 'commissioning', 'Start commissioning'],
      ['commissioning', 'done', 'Hand over', 'approve'],
    ],
  ), { sumField: 'budget', groupBy: 'site', dateField: 'due' }),
]
