/** HRIS beyond time and pay: recruitment, lifecycle, performance, learning, salary structure and expense claims. */
import type { RecordType } from '../records'
import { ACTIVE, APPROVAL, calc, date, entity, flow, money, n, note, num, pick, ref, round1, text, master, type } from './kit'

const CLEARANCE = ['Pending', 'Cleared'] as const
const LEVELS = ['Low', 'Medium', 'High'] as const
/** Final review score: 60% KPI, 30% behaviour rated by the division head, 10% contribution. */
const reviewScore = (v: Parameters<typeof n>[0]) => round1(n(v, 'kpi') * 0.6 + n(v, 'behaviour') * 0.3 + n(v, 'contribution') * 0.1)
const band = (score: number) => (score >= 90 ? 'Istimewa' : score >= 75 ? 'Baik' : score >= 60 ? 'Cukup' : 'Perlu pembinaan')
/** The nine-box cell of a successor: potential against performance. */
const NINE_BOX: Record<string, string> = {
  'High/High': 'Star', 'High/Medium': 'High potential', 'High/Low': 'Rough diamond',
  'Medium/High': 'High performer', 'Medium/Medium': 'Core player', 'Medium/Low': 'Inconsistent',
  'Low/High': 'Trusted professional', 'Low/Medium': 'Effective', 'Low/Low': 'Underperformer',
}

export const PEOPLE_MASTERS: readonly RecordType[] = [
  master('hrs', 'worklocations', ['Work locations', 'Work location', 'WLC'], 'name', [
    text('name', 'Name', { required: true, list: true }),
    entity('entity', 'Entity', { required: true, list: true }),
    num('lat', 'Latitude', '°', { required: true, min: -90, max: 90 }),
    num('lng', 'Longitude', '°', { required: true, min: -180, max: 180 }),
    num('radius', 'Check-in radius', 'm', { required: true, min: 10, list: true }),
  ], ACTIVE, { groupBy: 'entity' }),
  master('hrs', 'grades', ['Salary grades', 'Salary grade', 'GRD'], 'grade', [
    text('grade', 'Grade', { required: true, list: true }),
    money('min', 'Minimum', { required: true, list: true }),
    money('mid', 'Midpoint', { required: true, list: true }),
    money('max', 'Maximum', { required: true, list: true }),
  ], ACTIVE, { groupBy: 'grade' }),
  master('hrs', 'courses', ['Courses (LMS)', 'Course', 'CRS'], 'title', [
    text('title', 'Title', { required: true, list: true }),
    pick('category', 'Category', ['Safety', 'Compliance', 'Technical', 'Leadership', 'Onboarding'], { required: true, list: true }),
    num('hours', 'Hours', 'h', { required: true, min: 0.5, list: true }),
    num('passMark', 'Pass mark', '%', { required: true, min: 0, max: 100 }),
    pick('mandatory', 'Mandatory', ['Yes', 'No'], { required: true, list: true }),
    num('validity', 'Certificate validity', 'months', { min: 0 }),
  ], ACTIVE, { groupBy: 'category' }),
]

export const PEOPLE: readonly RecordType[] = [
  type('hrs', 'requisitions', ['Headcount requisitions', 'Headcount requisition', 'HCR'], 'title', [
    text('title', 'Title', { required: true, list: true }),
    ref('position', 'Position', 'hrs.positions', { required: true, list: true }),
    ref('orgunit', 'Org unit', 'hrs.orgunits', { required: true }),
    num('headcount', 'Headcount', 'people', { required: true, min: 1, list: true }),
    pick('reason', 'Reason', ['New role', 'Replacement', 'Expansion'], { required: true, list: true }),
    date('needBy', 'Needed by', { required: true, list: true }),
  ], flow([['draft', 'Draft', 'neutral'], ['submitted', 'Submitted', 'info'], ['approved', 'Approved', 'success'], ['filled', 'Filled', 'success'], ['rejected', 'Rejected', 'danger']], [
    ['draft', 'submitted', 'Submit'],
    ['submitted', 'approved', 'Approve', 'approve'],
    ['submitted', 'rejected', 'Reject', 'approve'],
    ['approved', 'filled', 'Mark filled'],
    ['rejected', 'draft', 'Reopen'],
  ]), { sumField: 'headcount', groupBy: 'reason', dateField: 'needBy' }),
  type('hrs', 'jobs', ['Job postings', 'Job posting', 'JPT'], 'title', [
    text('title', 'Title', { required: true, list: true }),
    ref('requisition', 'Headcount requisition', 'hrs.requisitions', { required: true, parent: true }),
    text('location', 'Location', { required: true, list: true }),
    pick('employmentType', 'Employment type', ['Permanent', 'Fixed term', 'Internship'], { required: true, list: true }),
    pick('workMode', 'Work mode', ['On site', 'Hybrid', 'Remote'], { required: true }),
    date('closing', 'Closing date', { required: true, list: true }),
    note('description', 'Job description'),
  ], flow([['draft', 'Draft', 'neutral'], ['published', 'Published', 'success'], ['closed', 'Closed', 'neutral']], [['draft', 'published', 'Publish'], ['published', 'closed', 'Close posting']]), { groupBy: 'employmentType', dateField: 'closing' }),
  type('hrs', 'psikotes', ['Psychometric tests', 'Psychometric test', 'PSI'], 'instrument', [
    ref('candidate', 'Candidate', 'hrs.candidates', { required: true, parent: true, list: true }),
    pick('instrument', 'Instrument', ['PAPI Kostick', 'Baum', 'DAP', 'Wartegg', 'Aritmatika'], { required: true, list: true }),
    num('score', 'Score', 'pts', { min: 0, max: 100, list: true }),
    note('notes', 'Reviewer notes'),
  ], flow([['pending', 'Pending', 'neutral'], ['in_progress', 'In progress', 'info'], ['done', 'Done', 'warning'], ['reviewed', 'Reviewed', 'success']], [
    ['pending', 'in_progress', 'Start test'],
    ['in_progress', 'done', 'Finish test'],
    ['done', 'reviewed', 'Review result'],
  ]), { groupBy: 'instrument' }),
  type('hrs', 'offers', ['Job offers', 'Job offer', 'OFR'], 'start', [
    ref('candidate', 'Candidate', 'hrs.candidates', { required: true, parent: true, list: true }),
    ref('position', 'Position', 'hrs.positions', { required: true, list: true }),
    money('salary', 'Offered salary', { required: true, list: true }),
    date('start', 'Start date', { required: true, list: true }),
  ], flow([['draft', 'Draft', 'neutral'], ['submitted', 'Submitted', 'info'], ['approved', 'Approved', 'info'], ['sent', 'Sent to candidate', 'warning'], ['accepted', 'Accepted', 'success'], ['declined', 'Declined', 'danger'], ['rejected', 'Rejected', 'danger']], [
    ['draft', 'submitted', 'Submit'],
    ['submitted', 'approved', 'Approve', 'approve'],
    ['submitted', 'rejected', 'Reject', 'approve'],
    ['approved', 'sent', 'Send to candidate'],
    ['sent', 'accepted', 'Record acceptance'],
    ['sent', 'declined', 'Record decline'],
    ['rejected', 'draft', 'Reopen'],
  ]), { sumField: 'salary', groupBy: 'position', dateField: 'start' }),
  type('hrs', 'offboarding', ['Offboarding', 'Offboarding case', 'OFB'], 'kind', [
    ref('employee', 'Employee', 'mdm.employees', { required: true, list: true }),
    pick('kind', 'Separation type', ['Voluntary', 'Termination', 'Layoff', 'End of contract', 'Retirement'], { required: true, list: true }),
    date('lastDay', 'Last working day', { required: true, list: true }),
    pick('clearanceHr', 'HR clearance', CLEARANCE),
    pick('clearanceIt', 'IT clearance', CLEARANCE),
    pick('clearanceFinance', 'Finance clearance', CLEARANCE),
    pick('clearanceManager', 'Manager clearance', CLEARANCE),
    money('severance', 'Final settlement'),
    note('exitNotes', 'Exit interview notes'),
  ], flow([['submitted', 'Submitted', 'neutral'], ['notice', 'Notice period', 'info'], ['exit_interview', 'Exit interview', 'warning'], ['completed', 'Completed', 'success']], [
    ['submitted', 'notice', 'Start notice period'],
    ['notice', 'exit_interview', 'Hold exit interview'],
    ['exit_interview', 'completed', 'Complete offboarding'],
  ]), { sumField: 'severance', groupBy: 'kind', dateField: 'lastDay' }),
  type('hrs', 'resignations', ['Resignations', 'Resignation', 'RSG'], 'reason', [
    ref('employee', 'Employee', 'mdm.employees', { required: true, list: true }),
    date('lastDay', 'Last working day', { required: true, list: true }),
    text('reason', 'Reason', { required: true }),
  ], APPROVAL, { groupBy: 'employee', dateField: 'lastDay' }, true),
  type('hrs', 'profilechanges', ['Profile change requests', 'Profile change', 'PCR'], 'field', [
    ref('employee', 'Employee', 'mdm.employees', { required: true, list: true }),
    pick('field', 'Field to change', ['Name', 'Department', 'Tax status (PTKP)'], { required: true, list: true }),
    text('proposed', 'New value', { required: true, list: true }),
    text('previous', 'Previous value'),
    text('reason', 'Reason'),
  ], APPROVAL, { groupBy: 'field' }, true),
  type('hrs', 'corrections', ['Attendance corrections', 'Attendance correction', 'ATC'], 'reason', [
    ref('employee', 'Employee', 'mdm.employees', { required: true, list: true }),
    date('date', 'Date', { required: true, list: true }),
    text('checkIn', 'Check in', { required: true, list: true }),
    text('checkOut', 'Check out', { list: true }),
    text('reason', 'Reason', { required: true }),
  ], APPROVAL, { groupBy: 'employee', dateField: 'date' }, true),
  type('hrs', 'merit', ['Merit proposals', 'Merit proposal', 'MRT'], 'effective', [
    ref('employee', 'Employee', 'mdm.employees', { required: true, list: true }),
    money('current', 'Current base pay', { required: true }),
    money('proposed', 'Proposed base pay', { required: true, list: true }),
    calc('increase', 'Increase', (v) => round1(((n(v, 'proposed') - n(v, 'current')) / Math.max(1, n(v, 'current'))) * 100), { unit: '%', list: true }),
    date('effective', 'Effective from', { required: true, list: true }),
    text('reason', 'Reason'),
  ], APPROVAL, { sumField: 'proposed', groupBy: 'employee', dateField: 'effective' }),
  type('hrs', 'expenses', ['Expense claims', 'Expense claim', 'EXP'], 'description', [
    ref('employee', 'Employee', 'mdm.employees', { required: true, list: true }),
    pick('category', 'Category', ['Travel', 'Meals', 'Fuel', 'Accommodation', 'Medical', 'Other'], { required: true, list: true }),
    text('description', 'Description', { required: true }),
    money('amount', 'Amount', { required: true, list: true }),
    date('date', 'Date', { required: true, list: true }),
    ref('costcenter', 'Cost centre', 'mdm.costcenters'),
  ], flow([['draft', 'Draft', 'neutral'], ['submitted', 'Submitted', 'info'], ['approved', 'Approved', 'success'], ['paid', 'Paid', 'success'], ['rejected', 'Rejected', 'danger']], [
    ['draft', 'submitted', 'Submit'],
    ['submitted', 'approved', 'Approve', 'approve'],
    ['submitted', 'rejected', 'Reject', 'approve'],
    ['approved', 'paid', 'Reimburse'],
    ['rejected', 'draft', 'Reopen'],
  ]), { sumField: 'amount', groupBy: 'category', dateField: 'date' }, true),
  type('hrs', 'logbook', ['Daily logbook', 'Logbook entry', 'LOG'], 'date', [
    ref('employee', 'Employee', 'mdm.employees', { required: true, list: true }),
    date('date', 'Date', { required: true, list: true }),
    note('tasks', 'Work done', { required: true }),
    num('completion', 'Checklist completed', '%', { required: true, min: 0, max: 100, list: true }),
    calc('score', 'Daily KPI score', (v) => Math.round(n(v, 'completion')), { unit: 'pts', list: true }),
  ], APPROVAL, { groupBy: 'employee', dateField: 'date' }, true),
  type('hrs', 'depttasks', ['Department tasks', 'Department task', 'DTK'], 'title', [
    text('title', 'Task', { required: true, list: true }),
    ref('orgunit', 'Org unit', 'hrs.orgunits', { required: true, list: true }),
    ref('employee', 'Assignee', 'mdm.employees', { required: true, list: true }),
    pick('recurrence', 'Recurrence', ['Once', 'Daily', 'Weekly', 'Monthly'], { required: true, list: true }),
    date('due', 'Due', { required: true, list: true }),
  ], flow([['pending', 'Pending', 'neutral'], ['done', 'Done', 'info'], ['approved', 'Approved', 'success'], ['rejected', 'Rejected', 'danger']], [
    ['pending', 'done', 'Mark done'],
    ['done', 'approved', 'Approve', 'approve'],
    ['done', 'rejected', 'Reject', 'approve'],
    ['rejected', 'pending', 'Reopen'],
  ]), { groupBy: 'recurrence', dateField: 'due' }),
  type('hrs', 'reviews', ['Performance reviews', 'Performance review', 'REV'], 'period', [
    ref('employee', 'Employee', 'mdm.employees', { required: true, list: true }),
    text('period', 'Period', { required: true, list: true }),
    num('kpi', 'KPI score', 'pts', { required: true, min: 0, max: 100 }),
    num('behaviour', 'Behaviour score', 'pts', { required: true, min: 0, max: 100 }),
    num('contribution', 'Contribution score', 'pts', { required: true, min: 0, max: 100 }),
    calc('final', 'Final score', reviewScore, { unit: 'pts', list: true }),
    calc('band', 'Rating', (v) => band(reviewScore(v)), { list: true }),
    note('selfNote', 'Self-assessment'),
  ], APPROVAL, { groupBy: 'period' }),
  type('hrs', 'feedback360', ['360 feedback', '360 review', 'F36'], 'relation', [
    ref('employee', 'Reviewer', 'mdm.employees', { required: true, list: true }),
    ref('subject', 'Reviewed employee', 'mdm.employees', { required: true, list: true }),
    pick('relation', 'Relation', ['Self', 'Manager', 'Peer', 'Direct report'], { required: true, list: true }),
    num('score', 'Score', 'of 5', { min: 1, max: 5, list: true }),
    note('comment', 'Comment'),
  ], flow([['pending', 'Pending', 'neutral'], ['submitted', 'Submitted', 'info'], ['approved', 'Approved', 'success']], [['pending', 'submitted', 'Submit review'], ['submitted', 'approved', 'Approve', 'approve']]), { groupBy: 'relation' }),
  type('hrs', 'enrollments', ['Course enrolments', 'Course enrolment', 'ENR'], 'course', [
    ref('employee', 'Employee', 'mdm.employees', { required: true, list: true }),
    ref('course', 'Course', 'hrs.courses', { required: true, parent: true, list: true }),
    num('progress', 'Progress', '%', { min: 0, max: 100, list: true }),
    num('score', 'Quiz score', '%', { min: 0, max: 100 }),
    date('validUntil', 'Certificate valid until', { list: true }),
  ], flow([['assigned', 'Assigned', 'neutral'], ['in_progress', 'In progress', 'info'], ['completed', 'Completed', 'success']], [['assigned', 'in_progress', 'Start course'], ['in_progress', 'completed', 'Complete course']]), { groupBy: 'course', dateField: 'validUntil' }),
  type('hrs', 'succession', ['Succession plans', 'Succession plan', 'SUC'], 'readiness', [
    ref('position', 'Key position', 'hrs.positions', { required: true, list: true }),
    ref('employee', 'Successor', 'mdm.employees', { required: true, list: true }),
    pick('readiness', 'Readiness', ['Ready now', '1 to 2 years', '3 to 5 years'], { required: true, list: true }),
    pick('potential', 'Potential', LEVELS, { required: true }),
    pick('performance', 'Performance', LEVELS, { required: true }),
    calc('box', 'Nine-box', (v) => NINE_BOX[`${String(v.potential)}/${String(v.performance)}`] ?? '', { list: true }),
    note('plan', 'Development plan'),
  ], flow([['planned', 'Planned', 'neutral'], ['in_progress', 'In progress', 'info'], ['done', 'Done', 'success']], [['planned', 'in_progress', 'Start plan'], ['in_progress', 'done', 'Complete plan']]), { groupBy: 'readiness' }),
]
