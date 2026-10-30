/** Group shared services carried over from the Habitat and NüHabit ERPs: HRIS, accounting, inventory control, purchasing execution, service desk and document control. */
import type { RecordType } from '../records'
import { ACTIVE, APPROVAL, calc, date, entity, flow, money, n, note, num, pick, ref, round1, text, master, type } from './kit'

export const GRADES = ['G1 Operator', 'G2 Technician', 'G3 Supervisor', 'G4 Superintendent', 'G5 Manager', 'G6 General manager'] as const

export const HRIS_MASTERS: readonly RecordType[] = [
  master('hrs', 'orgunits', ['Organisation units', 'Org unit', 'ORG'], 'name', [
    text('name', 'Name', { required: true, list: true }),
    ref('parentUnit', 'Reports to', 'hrs.orgunits', { parent: true, list: true }),
    entity('entity', 'Entity', { required: true, list: true }),
    pick('level', 'Level', ['Directorate', 'Division', 'Department', 'Section'], { required: true, list: true }),
    num('budgetHeadcount', 'Budgeted headcount', 'people', { min: 0 }),
  ], ACTIVE, { groupBy: 'level' }),
  master('hrs', 'positions', ['Positions', 'Position', 'JOB'], 'title', [
    text('title', 'Title', { required: true, list: true }),
    ref('orgunit', 'Org unit', 'hrs.orgunits', { required: true, list: true }),
    pick('grade', 'Grade', GRADES, { required: true, list: true }),
    pick('k3Role', 'K3 role', ['None', 'Ahli K3 required', 'SIO required', 'First aider'], { list: true }),
  ], ACTIVE, { groupBy: 'grade' }),
  master('hrs', 'shifts', ['Shift patterns', 'Shift', 'SHF'], 'name', [
    text('name', 'Name', { required: true, list: true }),
    text('start', 'Starts', { required: true, list: true }),
    text('end', 'Ends', { required: true, list: true }),
    num('hours', 'Hours', 'h', { required: true, min: 1, max: 12, list: true }),
    pick('pattern', 'Pattern', ['Office 5x2', '4 crew 3 shift', '2 crew 12 h'], { required: true }),
  ], ACTIVE),
  master('hrs', 'leavetypes', ['Leave types', 'Leave type', 'LVT'], 'name', [
    text('name', 'Name', { required: true, list: true }),
    num('days', 'Days per year', 'days', { required: true, min: 0, list: true }),
    pick('paid', 'Paid', ['Yes', 'No'], { required: true, list: true }),
  ], ACTIVE),
]

export const HRIS: readonly RecordType[] = [
  type('hrs', 'attendance', ['Attendance', 'Attendance record', 'ATT'], 'date', [
    ref('employee', 'Employee', 'mdm.employees', { required: true, list: true }),
    date('date', 'Date', { required: true, list: true }),
    ref('shift', 'Shift', 'hrs.shifts', { required: true }),
    text('checkIn', 'Check in', { list: true }),
    text('checkOut', 'Check out'),
    pick('result', 'Result', ['On time', 'Late', 'Absent', 'On leave'], { required: true, list: true }),
    pick('method', 'Method', ['Face recognition', 'Gate RFID', 'Mobile GPS'], { required: true }),
  ], flow([['recorded', 'Recorded', 'info'], ['verified', 'Verified', 'success'], ['disputed', 'Disputed', 'warning']], [
    ['recorded', 'verified', 'Verify'],
    ['recorded', 'disputed', 'Dispute'],
    ['disputed', 'verified', 'Resolve'],
  ]), { groupBy: 'result', dateField: 'date' }, true),
  type('hrs', 'leaves', ['Leave requests', 'Leave request', 'LV'], 'reason', [
    ref('employee', 'Employee', 'mdm.employees', { required: true, list: true }),
    ref('leaveType', 'Leave type', 'hrs.leavetypes', { required: true, list: true }),
    date('from', 'From', { required: true, list: true }),
    num('days', 'Days', 'days', { required: true, min: 0.5, max: 30, list: true }),
    text('reason', 'Reason', { required: true }),
  ], APPROVAL, { sumField: 'days', groupBy: 'leaveType', dateField: 'from' }, true),
  type('hrs', 'overtime', ['Overtime requests', 'Overtime request', 'OT'], 'reason', [
    ref('employee', 'Employee', 'mdm.employees', { required: true, list: true }),
    date('date', 'Date', { required: true, list: true }),
    num('hours', 'Hours', 'h', { required: true, min: 0.5, max: 14, list: true }),
    text('reason', 'Reason', { required: true }),
    calc('pay', 'Overtime pay', (v) => Math.round(n(v, 'hours') * 1.5 * 38_000), { unit: 'Rp', list: true }),
  ], APPROVAL, { sumField: 'hours', groupBy: 'employee', dateField: 'date' }, true),
  type('hrs', 'payroll', ['Payroll runs', 'Payroll run', 'PAY'], 'period', [
    text('period', 'Period', { required: true, list: true }),
    entity('entity', 'Entity', { required: true, list: true }),
    num('headcount', 'Headcount', 'people', { required: true, min: 1, list: true }),
    money('gross', 'Gross pay', { required: true, list: true }),
    money('deductions', 'BPJS, PPh 21 and loans', { required: true }),
    calc('net', 'Net pay', (v) => n(v, 'gross') - n(v, 'deductions'), { unit: 'Rp', list: true }),
  ], flow([['draft', 'Draft', 'neutral'], ['calculated', 'Calculated', 'info'], ['approved', 'Approved', 'success'], ['paid', 'Paid', 'success'], ['rejected', 'Rejected', 'danger']], [
    ['draft', 'calculated', 'Calculate'],
    ['calculated', 'approved', 'Approve', 'approve'],
    ['calculated', 'rejected', 'Reject', 'approve'],
    ['approved', 'paid', 'Release to bank'],
    ['rejected', 'draft', 'Reopen'],
  ]), { sumField: 'gross', groupBy: 'entity' }),
  type('hrs', 'loans', ['Employee loans', 'Employee loan', 'LOA'], 'purpose', [
    ref('employee', 'Employee', 'mdm.employees', { required: true, list: true }),
    text('purpose', 'Purpose', { required: true }),
    money('amount', 'Amount', { required: true, list: true }),
    num('tenor', 'Tenor', 'months', { required: true, min: 1, max: 36, list: true }),
    calc('installment', 'Monthly installment', (v) => Math.round(n(v, 'amount') / Math.max(1, n(v, 'tenor'))), { unit: 'Rp' }),
  ], APPROVAL, { sumField: 'amount' }),
  type('hrs', 'contracts', ['Employment contracts', 'Contract', 'KTR'], 'kind', [
    ref('employee', 'Employee', 'mdm.employees', { required: true, list: true }),
    pick('kind', 'Type', ['PKWTT (permanent)', 'PKWT (fixed term)', 'Outsourced', 'Internship'], { required: true, list: true }),
    date('start', 'Start', { required: true }),
    date('end', 'End', { list: true }),
  ], flow([['active', 'Active', 'success'], ['renewal', 'Due for renewal', 'warning'], ['ended', 'Ended', 'neutral']], [
    ['active', 'renewal', 'Flag for renewal'],
    ['renewal', 'active', 'Renew', 'approve'],
    ['renewal', 'ended', 'End contract', 'approve'],
  ]), { groupBy: 'kind', dateField: 'end' }),
  type('hrs', 'candidates', ['Recruitment pipeline', 'Candidate', 'CAN'], 'name', [
    text('name', 'Name', { required: true, list: true }),
    ref('position', 'Position', 'hrs.positions', { required: true, list: true }),
    pick('source', 'Source', ['Job portal', 'Referral', 'Campus', 'Head hunter', 'Walk in'], { required: true, list: true }),
    num('psychotest', 'Psychotest score', 'pts', { min: 0, max: 100 }),
    pick('mcuResult', 'Pre-employment MCU', ['Pending', 'Fit', 'Fit with note', 'Unfit'], { list: true }),
  ], flow([['applied', 'Applied', 'neutral'], ['screening', 'Screening', 'info'], ['interview', 'Interview', 'info'], ['offer', 'Offer', 'warning'], ['hired', 'Hired', 'success'], ['declined', 'Not selected', 'danger']], [
    ['applied', 'screening', 'Screen'],
    ['screening', 'interview', 'Invite to interview'],
    ['interview', 'offer', 'Make offer', 'approve'],
    ['offer', 'hired', 'Mark hired'],
    ['screening', 'declined', 'Decline'],
    ['interview', 'declined', 'Decline'],
  ]), { groupBy: 'source' }),
  type('hrs', 'onboarding', ['Onboarding & offboarding', 'Onboarding task', 'ONB'], 'task', [
    ref('employee', 'Employee', 'mdm.employees', { required: true, list: true }),
    pick('kind', 'Kind', ['Onboarding', 'Offboarding'], { required: true, list: true }),
    pick('task', 'Task', ['K3 induction', 'PPE issued', 'Site access card', 'Laptop and email', 'BPJS registration', 'Exit interview', 'Asset return', 'Final settlement'], { required: true, list: true }),
    date('due', 'Due', { required: true, list: true }),
  ], flow([['open', 'Open', 'neutral'], ['done', 'Done', 'success']], [['open', 'done', 'Mark done']]), { groupBy: 'task', dateField: 'due' }),
  type('hrs', 'appraisals', ['KPI scorecards', 'Scorecard', 'APR'], 'period', [
    ref('employee', 'Employee', 'mdm.employees', { required: true, list: true }),
    text('period', 'Period', { required: true, list: true }),
    num('kpi', 'KPI achievement', '%', { required: true, min: 0, max: 150 }),
    num('safety', 'Safety behaviour', '%', { required: true, min: 0, max: 100 }),
    calc('score', 'Final score', (v) => round1(n(v, 'kpi') * 0.7 + n(v, 'safety') * 0.3), { unit: 'pts', list: true }),
  ], APPROVAL, { groupBy: 'period' }),
  type('hrs', 'trainings', ['Training records', 'Training', 'TRN'], 'course', [
    ref('employee', 'Employee', 'mdm.employees', { required: true, list: true }),
    pick('course', 'Course', ['Chemical handling & GHS', 'Emergency response', 'Confined space entry', 'Working at height', 'LOTO', 'Defensive driving', 'ISO 9001 awareness', 'Leadership'], { required: true, list: true }),
    date('date', 'Date', { required: true, list: true }),
    num('hours', 'Hours', 'h', { required: true, min: 1 }),
    date('expiry', 'Valid until'),
  ], flow([['planned', 'Planned', 'info'], ['done', 'Completed', 'success'], ['missed', 'Missed', 'danger']], [
    ['planned', 'done', 'Mark completed'],
    ['planned', 'missed', 'Mark missed'],
    ['missed', 'planned', 'Reschedule'],
  ]), { sumField: 'hours', groupBy: 'course', dateField: 'date' }),
  type('hrs', 'announcements', ['Announcements', 'Announcement', 'ANN'], 'title', [
    text('title', 'Title', { required: true, list: true }),
    pick('audience', 'Audience', ['All employees', 'Plant crews', 'Office staff', 'Drivers'], { required: true, list: true }),
    note('body', 'Message', { required: true }),
    date('publish', 'Publish on', { required: true, list: true }),
  ], flow([['draft', 'Draft', 'neutral'], ['published', 'Published', 'success']], [['draft', 'published', 'Publish', 'approve']]), { dateField: 'publish' }),
]

export const FINANCE: readonly RecordType[] = [
  type('fin', 'journals', ['Journal entries', 'Journal entry', 'JE'], 'description', [
    text('description', 'Description', { required: true, list: true }),
    entity('entity', 'Entity', { required: true, list: true }),
    ref('account', 'Account', 'mdm.accounts', { required: true, list: true }),
    ref('costcenter', 'Cost centre', 'mdm.costcenters'),
    money('amount', 'Amount', { required: true, list: true }),
    date('date', 'Posting date', { required: true }),
  ], flow([['draft', 'Draft', 'neutral'], ['submitted', 'Submitted', 'info'], ['posted', 'Posted', 'success'], ['rejected', 'Rejected', 'danger']], [
    ['draft', 'submitted', 'Submit'],
    ['submitted', 'posted', 'Approve and post', 'approve'],
    ['submitted', 'rejected', 'Reject', 'approve'],
    ['rejected', 'draft', 'Reopen'],
  ]), { sumField: 'amount', groupBy: 'entity', dateField: 'date' }),
  type('fin', 'payables', ['Vendor invoices (AP)', 'Vendor invoice', 'API'], 'invoiceNo', [
    text('invoiceNo', 'Invoice no.', { required: true, list: true }),
    ref('vendor', 'Vendor', 'mdm.partners', { required: true, list: true }),
    ref('po', 'Purchase order', 'vms.orders', { parent: true }),
    entity('entity', 'Entity', { required: true }),
    money('amount', 'Amount', { required: true, list: true }),
    date('due', 'Due', { required: true, list: true }),
  ], flow([['received', 'Received', 'neutral'], ['matched', '3-way matched', 'info'], ['approved', 'Approved to pay', 'success'], ['paid', 'Paid', 'success'], ['disputed', 'Disputed', 'danger']], [
    ['received', 'matched', 'Match PO and GRN'],
    ['received', 'disputed', 'Dispute'],
    ['matched', 'approved', 'Approve', 'approve'],
    ['approved', 'paid', 'Mark paid'],
    ['disputed', 'received', 'Resolve'],
  ]), { sumField: 'amount', groupBy: 'vendor', dateField: 'due' }),
  type('fin', 'receivables', ['Customer invoices (AR)', 'Customer invoice', 'ARI'], 'invoiceNo', [
    text('invoiceNo', 'Invoice no.', { required: true, list: true }),
    ref('customer', 'Customer', 'mdm.partners', { required: true, list: true }),
    entity('entity', 'Entity', { required: true }),
    money('amount', 'Amount', { required: true, list: true }),
    date('due', 'Due', { required: true, list: true }),
  ], flow([['issued', 'Issued', 'info'], ['overdue', 'Overdue', 'danger'], ['paid', 'Paid', 'success']], [
    ['issued', 'paid', 'Record payment'],
    ['issued', 'overdue', 'Flag overdue'],
    ['overdue', 'paid', 'Record payment'],
  ]), { sumField: 'amount', groupBy: 'customer', dateField: 'due' }),
  type('fin', 'payments', ['Vendor payments', 'Vendor payment', 'VPY'], 'reference', [
    text('reference', 'Reference', { required: true, list: true }),
    ref('invoice', 'Vendor invoice', 'fin.payables', { required: true, list: true }),
    ref('bank', 'House bank', 'mdm.banks', { required: true }),
    money('amount', 'Amount', { required: true, list: true }),
    date('date', 'Value date', { required: true, list: true }),
  ], APPROVAL, { sumField: 'amount', dateField: 'date' }),
  type('fin', 'taxinvoices', ['Tax invoices (e-Faktur)', 'Tax invoice', 'EFK'], 'number', [
    text('number', 'NSFP number', { required: true, list: true }),
    ref('invoice', 'Customer invoice', 'fin.receivables', { required: true, parent: true, list: true }),
    pick('tax', 'Tax', ['PPN 11%', 'PPN 12%', 'PPh 22', 'PPh 23'], { required: true, list: true }),
    money('base', 'Tax base', { required: true }),
    calc('amount', 'Tax amount', (v) => Math.round(n(v, 'base') * (String(v.tax).includes('12') ? 0.12 : String(v.tax).includes('11') ? 0.11 : String(v.tax).includes('22') ? 0.015 : 0.02)), { unit: 'Rp', list: true }),
  ], flow([['draft', 'Draft', 'neutral'], ['uploaded', 'Uploaded to DJP', 'info'], ['approved', 'Approved by DJP', 'success'], ['cancelled', 'Cancelled', 'danger']], [
    ['draft', 'uploaded', 'Upload to e-Faktur'],
    ['uploaded', 'approved', 'Record approval'],
    ['uploaded', 'cancelled', 'Cancel', 'approve'],
  ]), { groupBy: 'tax' }),
  type('fin', 'reconciliations', ['Bank reconciliations', 'Bank reconciliation', 'BRC'], 'period', [
    ref('bank', 'House bank', 'mdm.banks', { required: true, parent: true, list: true }),
    text('period', 'Period', { required: true, list: true }),
    money('statement', 'Bank statement balance', { required: true }),
    money('ledger', 'Ledger balance', { required: true }),
    calc('difference', 'Difference', (v) => n(v, 'statement') - n(v, 'ledger'), { unit: 'Rp', list: true }),
  ], flow([['open', 'Open', 'neutral'], ['matched', 'Matched', 'info'], ['approved', 'Approved', 'success']], [
    ['open', 'matched', 'Match items'],
    ['matched', 'approved', 'Approve', 'approve'],
  ])),
  type('fin', 'pettycash', ['Petty cash', 'Petty cash claim', 'PCV'], 'purpose', [
    text('purpose', 'Purpose', { required: true, list: true }),
    entity('entity', 'Entity', { required: true, list: true }),
    ref('costcenter', 'Cost centre', 'mdm.costcenters', { required: true }),
    money('amount', 'Amount', { required: true, list: true }),
    date('date', 'Date', { required: true, list: true }),
  ], APPROVAL, { sumField: 'amount', groupBy: 'entity', dateField: 'date' }, true),
  type('fin', 'advances', ['Cash advances', 'Cash advance', 'CA'], 'purpose', [
    ref('employee', 'Employee', 'mdm.employees', { required: true, list: true }),
    text('purpose', 'Purpose', { required: true, list: true }),
    money('amount', 'Amount', { required: true, list: true }),
    date('settleBy', 'Settle by', { required: true, list: true }),
  ], flow([['requested', 'Requested', 'neutral'], ['approved', 'Approved', 'info'], ['paid', 'Paid out', 'warning'], ['settled', 'Settled', 'success'], ['rejected', 'Rejected', 'danger']], [
    ['requested', 'approved', 'Approve', 'approve'],
    ['requested', 'rejected', 'Reject', 'approve'],
    ['approved', 'paid', 'Pay out'],
    ['paid', 'settled', 'Settle'],
  ]), { sumField: 'amount', dateField: 'settleBy' }, true),
  master('fin', 'closing', ['Period close checklist', 'Close task', 'PCL'], 'task', [
    ref('period', 'Fiscal period', 'epm.periods', { required: true, parent: true, list: true }),
    pick('task', 'Task', ['Accrue unbilled freight', 'Revalue FX balances', 'Depreciation run', 'Inventory valuation', 'Intercompany match', 'Tax provision', 'Bank reconciliation'], { required: true, list: true }),
    text('owner', 'Owner', { required: true, list: true }),
  ], flow([['open', 'Open', 'neutral'], ['done', 'Done', 'success']], [['open', 'done', 'Mark done']]), { groupBy: 'task' }),
  master('fin', 'assets', ['Fixed assets', 'Fixed asset', 'FA'], 'name', [
    text('name', 'Name', { required: true, list: true }),
    entity('entity', 'Entity', { required: true, list: true }),
    pick('class', 'Class', ['Plant & machinery', 'Storage tanks', 'Vehicles', 'Buildings', 'IT equipment'], { required: true, list: true }),
    money('cost', 'Acquisition cost', { required: true, list: true }),
    num('life', 'Useful life', 'years', { required: true, min: 1, max: 40 }),
    calc('depreciation', 'Yearly depreciation', (v) => Math.round(n(v, 'cost') / Math.max(1, n(v, 'life'))), { unit: 'Rp' }),
  ], ACTIVE, { sumField: 'cost', groupBy: 'class' }),
]

export const INVENTORY: readonly RecordType[] = [
  master('inv', 'stock', ['Stock balances', 'Stock balance', 'STK'], 'material', [
    ref('material', 'Material', 'mdm.materials', { required: true, list: true }),
    ref('plant', 'Plant', 'mdm.plants', { required: true, parent: true, list: true }),
    num('onHand', 'On hand', 't', { required: true, min: 0, list: true }),
    num('minimum', 'Minimum', 't', { required: true, min: 0 }),
    calc('state', 'Stock state', (v) => (n(v, 'onHand') <= n(v, 'minimum') ? 'Low' : 'OK'), { list: true }),
    date('expiry', 'Shelf life ends'),
  ], ACTIVE, { sumField: 'onHand', groupBy: 'state' }),
  type('inv', 'adjustments', ['Stock adjustments', 'Stock adjustment', 'ADJ'], 'reason', [
    ref('stock', 'Stock balance', 'inv.stock', { required: true, list: true }),
    num('qty', 'Quantity change', 't', { required: true, list: true }),
    pick('reason', 'Reason', ['Count difference', 'Evaporation loss', 'Spillage', 'Reclassification', 'Damaged packaging'], { required: true, list: true }),
    money('value', 'Value', { required: true }),
  ], APPROVAL, { sumField: 'value', groupBy: 'reason' }),
  type('inv', 'counts', ['Stock opname', 'Stock count', 'OPN'], 'scope', [
    ref('plant', 'Plant', 'mdm.plants', { required: true, list: true }),
    text('scope', 'Scope', { required: true, list: true }),
    date('date', 'Count date', { required: true, list: true }),
    num('items', 'Items counted', 'items', { required: true, min: 1 }),
    num('variance', 'Variance', '%', { required: true, list: true }),
  ], flow([['planned', 'Planned', 'neutral'], ['counting', 'Counting', 'info'], ['review', 'In review', 'warning'], ['posted', 'Posted', 'success']], [
    ['planned', 'counting', 'Start count'],
    ['counting', 'review', 'Submit counts'],
    ['review', 'posted', 'Approve and post', 'approve'],
    ['review', 'counting', 'Recount'],
  ]), { dateField: 'date' }),
  type('inv', 'transfers', ['Stock transfers', 'Stock transfer', 'TRF'], 'material', [
    ref('material', 'Material', 'mdm.materials', { required: true, list: true }),
    ref('from', 'From plant', 'mdm.plants', { required: true, list: true }),
    ref('to', 'To plant', 'mdm.plants', { required: true, list: true }),
    num('qty', 'Quantity', 't', { required: true, min: 0.1, list: true }),
  ], flow([['draft', 'Draft', 'neutral'], ['transit', 'In transit', 'info'], ['received', 'Received', 'success']], [
    ['draft', 'transit', 'Dispatch'],
    ['transit', 'received', 'Confirm receipt'],
  ]), { sumField: 'qty' }),
  type('inv', 'scrap', ['Scrap & disposal', 'Scrap request', 'SCR'], 'reason', [
    ref('material', 'Material', 'mdm.materials', { required: true, list: true }),
    num('qty', 'Quantity', 't', { required: true, min: 0.01, list: true }),
    pick('reason', 'Reason', ['Expired', 'Off-spec', 'Contaminated', 'Damaged packaging'], { required: true, list: true }),
    pick('b3', 'Hazardous waste (B3)', ['Yes', 'No'], { required: true, list: true }),
  ], APPROVAL, { sumField: 'qty', groupBy: 'reason' }),
]

/** Purchasing execution after the requisition, as in Habitat purchasing: PO, goods receipt, incoming QC, returns. */
export const PURCHASING: readonly RecordType[] = [
  type('vms', 'orders', ['Purchase orders', 'Purchase order', 'PO'], 'title', [
    text('title', 'Title', { required: true, list: true }),
    ref('requisition', 'Requisition', 'vms.requisitions', { parent: true }),
    ref('vendor', 'Vendor', 'mdm.partners', { required: true, list: true }),
    ref('material', 'Material', 'mdm.materials', { required: true }),
    num('qty', 'Quantity', 't', { required: true, min: 0.1, list: true }),
    money('value', 'Value', { required: true, list: true }),
    date('delivery', 'Delivery date', { required: true }),
  ], flow([['draft', 'Draft', 'neutral'], ['submitted', 'Submitted', 'info'], ['released', 'Released', 'success'], ['closed', 'Closed', 'neutral'], ['rejected', 'Rejected', 'danger']], [
    ['draft', 'submitted', 'Submit'],
    ['submitted', 'released', 'Approve and release', 'approve'],
    ['submitted', 'rejected', 'Reject', 'approve'],
    ['released', 'closed', 'Close'],
    ['rejected', 'draft', 'Reopen'],
  ]), { sumField: 'value', groupBy: 'vendor', dateField: 'delivery' }),
  type('vms', 'receipts', ['Goods receipts', 'Goods receipt', 'GRN'], 'delivery', [
    ref('po', 'Purchase order', 'vms.orders', { required: true, list: true }),
    text('delivery', 'Delivery note', { required: true, list: true }),
    num('qty', 'Received', 't', { required: true, min: 0.1, list: true }),
    pick('coa', 'Certificate of analysis', ['Attached', 'Missing'], { required: true, list: true }),
    date('date', 'Received on', { required: true }),
  ], flow([['received', 'Received', 'info'], ['quarantine', 'In quarantine', 'warning'], ['accepted', 'Accepted', 'success'], ['rejected', 'Rejected', 'danger']], [
    ['received', 'quarantine', 'Send to QC'],
    ['quarantine', 'accepted', 'Release', 'approve'],
    ['quarantine', 'rejected', 'Reject', 'approve'],
  ]), { sumField: 'qty', dateField: 'date' }),
  type('vms', 'inspections', ['Incoming QC', 'Incoming inspection', 'IQC'], 'parameter', [
    ref('receipt', 'Goods receipt', 'vms.receipts', { required: true, list: true }),
    pick('parameter', 'Parameter', ['Purity', 'Moisture', 'Density', 'Colour (APHA)', 'Particle size'], { required: true, list: true }),
    num('result', 'Result', '', { required: true, list: true }),
    pick('verdict', 'Verdict', ['Pass', 'Fail'], { required: true, list: true }),
  ], flow([['open', 'Open', 'neutral'], ['done', 'Done', 'success']], [['open', 'done', 'Sign off', 'approve']]), { groupBy: 'verdict' }),
  type('vms', 'returns', ['Returns to vendor', 'Return to vendor', 'RTV'], 'reason', [
    ref('receipt', 'Goods receipt', 'vms.receipts', { required: true, list: true }),
    num('qty', 'Quantity', 't', { required: true, min: 0.1, list: true }),
    pick('reason', 'Reason', ['Off-spec', 'Leaking drum', 'Wrong material', 'Missing COA'], { required: true, list: true }),
  ], flow([['requested', 'Requested', 'neutral'], ['shipped', 'Shipped back', 'info'], ['credited', 'Credit note received', 'success']], [
    ['requested', 'shipped', 'Ship back', 'approve'],
    ['shipped', 'credited', 'Record credit note'],
  ]), { sumField: 'qty', groupBy: 'reason' }),
]

/** Ticketing and the data room from NüHabit, used here for IT and GA requests and controlled documents (SOP, SDS, permits). */
export const SERVICE_DESK: readonly RecordType[] = [
  master('gas', 'categories', ['Ticket categories', 'Ticket category', 'TCT'], 'name', [
    text('name', 'Name', { required: true, list: true }),
    pick('team', 'Team', ['IT', 'General affairs', 'Facilities', 'HR services'], { required: true, list: true }),
    num('sla', 'Resolution SLA', 'h', { required: true, min: 1, list: true }),
  ], ACTIVE, { groupBy: 'team' }),
  type('gas', 'tickets', ['Service tickets', 'Ticket', 'TKT'], 'title', [
    text('title', 'Title', { required: true, list: true }),
    ref('category', 'Category', 'gas.categories', { required: true, list: true }),
    pick('priority', 'Priority', ['Low', 'Medium', 'High', 'Critical'], { required: true, list: true }),
    entity('entity', 'Entity', { required: true }),
    text('requester', 'Requester', { required: true }),
  ], flow([['open', 'Open', 'neutral'], ['assigned', 'Assigned', 'info'], ['progress', 'In progress', 'info'], ['resolved', 'Resolved', 'success'], ['closed', 'Closed', 'neutral']], [
    ['open', 'assigned', 'Assign'],
    ['assigned', 'progress', 'Start'],
    ['progress', 'resolved', 'Resolve'],
    ['resolved', 'closed', 'Close'],
    ['resolved', 'progress', 'Reopen'],
  ]), { groupBy: 'priority' }, true),
  type('gas', 'documents', ['Document control', 'Controlled document', 'DOC'], 'title', [
    text('title', 'Title', { required: true, list: true }),
    pick('kind', 'Type', ['SOP', 'Work instruction', 'SDS', 'Permit copy', 'Policy', 'Emergency plan'], { required: true, list: true }),
    entity('entity', 'Entity', { required: true, list: true }),
    text('revision', 'Revision', { required: true, list: true }),
    date('review', 'Next review', { required: true, list: true }),
  ], flow([['draft', 'Draft', 'neutral'], ['review', 'In review', 'info'], ['effective', 'Effective', 'success'], ['obsolete', 'Obsolete', 'neutral']], [
    ['draft', 'review', 'Send for review'],
    ['review', 'effective', 'Approve', 'approve'],
    ['review', 'draft', 'Return'],
    ['effective', 'obsolete', 'Withdraw', 'approve'],
  ]), { groupBy: 'kind', dateField: 'review' }),
]
