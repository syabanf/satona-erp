"""Builds the Satona ERP walkthrough deck in the WIT Company Profile 2026 style."""
import sys

SKILL = '/Users/syabanf/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/d96de9a2-d3f1-4120-b409-b0df46291a07/7a881940-79d3-4b7a-9e4b-0eddd4c50719/skills/wit-deck-2'
SHOTS = sys.argv[1] if len(sys.argv) > 1 else 'shots'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'WIT_ID_-_Satona_ERP.pptx'
sys.path.insert(0, f'{SKILL}/scripts')
from witdeck import *  # noqa: E402,F403


def shot(name):
    return f'{SHOTS}/{name}.png'


d = Deck('Satona ERP', 2026)

d.cover(['Satona ERP', 'Group Console'], 'Product walkthrough', 'October 2026')

d.agenda(['WHAT THIS', 'DECK COVERS'], [
    ('CONTEXT.', 'One ERP for a logistics, fertiliser and chemicals group', 'SLIDES 3-4'),
    ('EASE.', 'Search, drawer and charts that open records', 'SLIDES 5-9'),
    ('OPERATIONS.', 'Fleet, plants, tank farm and SHE / K3', 'SLIDES 10-17'),
    ('SERVICES.', 'HRIS, finance and approval control', 'SLIDES 18-22'),
    ('DELIVERY.', 'Scrum SDLC from backlog to release', 'SLIDES 23-25'),
    ('ARCHITECTURE.', 'Ready to split into microservices', 'SLIDES 26-27'),
    ('PLANNING.', 'Releases, sprints and squads', 'SLIDES 28-29'),
], hashtag=None)

# CONTEXT
d.art_cards('CONTEXT. The group', ['One ERP for a', 'chemical group'], [
    ('Four companies, one console', [
        'Satona Holding: master data, finance, procurement, governance, BI',
        'Rotama: tanker fleet, warehouses and dangerous-goods transport',
        'Rodame: NPK and urea plants, MES, maintenance, distributors',
        'Roasi: continuous chemical process, tank farm, genealogy',
    ], False),
    ('Shared services across the group', [
        'HRIS, finance and accounting, purchasing and inventory',
        'SHE / K3 management for every plant and depot',
        'System administration with a multilevel approval matrix',
    ], True),
], art='erp-manufacturing-retail')

d.stats('PLATFORM. In numbers', 'Built from the scope and user matrix.', [
    ('4', 'Companies in the group'),
    ('26', 'Modules', True),
    ('162', 'Record types with forms and workflows'),
    ('80', 'Master data types'),
    ('78', 'Roles from the user matrix'),
    ('515', 'Transaction codes in the menu'),
    ('2,562', 'Employees across the group'),
    ('188', 'Automated tests passing'),
], note='Frontend demo with in-memory data: every screen works, data resets on reload.')

# EASE
d.showcase('EASE. Executive overview', 'Each role lands on its own home screen.', [
    'Quick login for 24 personas, from CFO to driver and contractor',
    'Menus, buttons and approvals follow the signed-in role',
    'Group map, revenue by entity and items that need attention',
    'Phones get a bottom tab bar instead of a hamburger menu',
], shot('overview'), tags=['Role-based', 'Light and dark'])

d.compare('EASE. Compared with SAP', 'Familiar for SAP users, simpler for everyone else.', 'The SAP habit', 'In Satona ERP', [
    ('Memorise a T-code for every screen', 'Type a record number, a name or "new permit"; T-codes still work'),
    ('Separate create, change and display transactions', 'One drawer creates, views, edits, approves and deletes in place'),
    ('Reports exported, then filtered in Excel', 'Every chart opens the records behind it; any table exports CSV'),
    ('Approvals hidden in a workflow inbox', 'The record shows each approval level, who signed and who is next'),
    ('Generic menus for every user', 'The menu, buttons and home screen follow the role'),
])

d.showcase('EASE. Global search', 'One search box finds any record.', [
    'Cmd+K, Ctrl+K or / opens it from any screen',
    'Finds records by number or by words in any field',
    '"new permit" offers the create form for that record',
    'Transaction codes such as PTW01 jump straight to their screen',
    'Recent records and pending approvals show before you type',
], shot('search'), tags=['Cmd+K', 'Records + menus'])

d.showcase('EASE. Work in place', 'Create and edit without leaving the page.', [
    'A side drawer opens any record for view, edit, approve or delete',
    'New forms prefill today and the user\'s company',
    'Operational pages carry New buttons for the records they use',
    'Press N on a list to start a new record',
], shot('drawer'), tags=['Drawer', 'Smart defaults'])

d.showcase('EASE. Lists and drill-down', 'Every chart opens the records behind it.', [
    'Click a month, a status slice or a day to filter the table',
    'Period filter stays in the URL, so links and Back keep it',
    'Select rows to approve, move or delete them in bulk',
    'Export any filtered list to CSV for Excel',
], shot('bulk'), tags=['Bulk actions', 'CSV export'])

# PLANTS
d.steps('OPERATIONS. Fleet check-in', 'A driver is cleared to drive in four checks.', [
    ('P2H checklist', '16 pre-trip checks in 6 groups; a failed critical item blocks departure'),
    ('Fatigue scan', 'The DSM camera scans the driver\'s face for signs of fatigue'),
    ('Breath test', 'Alcohol result recorded with the check-in'),
    ('Gate decision', 'Fit to drive or Hold; the approver clears or blocks at the gate'),
], callout=('Drivers file their own check-in.', 'The driver app shows only check-in, its history and the gate decision.'))

d.phones('OPERATIONS. On the phone', 'Field roles work from a phone-sized console.', [
    'Bottom tab bar: home, worklist, approvals and the full menu',
    'Drivers land on check-in; SHE managers on the SHE cockpit',
    'Approvers sign their level from the approvals tab',
], [shot('phone-checkin'), shot('phone-she'), shot('phone-approvals')], tags=['Driver', 'SHE Manager'])

d.showcase('OPERATIONS. Safety ADAS and DSM', 'Driver safety events reviewed as they arrive.', [
    'Live stream of ADAS road events and DSM cabin events',
    'Camera frame per event, hour-of-day heat strip and event types',
    'Driver safety scores rank who needs coaching',
    'Review, coach and close each event in its workflow',
], shot('safety'), tags=['ADAS', 'DSM'])

d.showcase('OPERATIONS. Production in 3D', 'The plant line in 3D, coloured by OEE.', [
    'Block height and colour follow each work centre\'s OEE',
    'Click a block to open its shift records',
    'Dashboard tab: OEE per day, downtime Pareto and the shop floor',
], shot('mes-3d'), tags=['MES', 'three.js'])

d.showcase('OPERATIONS. Tank farm', 'Tank levels and reorder points at a glance.', [
    'Glass tanks show the live level; red marks a tank under its reorder point',
    'A low tank raises a purchase requisition from the same screen',
    'Gauges tab adds level trends and stock reconciliation',
], shot('tank-3d'), tags=['TFM', 'Auto reorder'])

# SHE / K3
d.showcase('SHE / K3. Cockpit', 'Lagging and leading indicators on one screen.', [
    'Days without LTI, LTIFR and TRIR from the incident register',
    'Safety pyramid from fatalities down to unsafe acts',
    'Work areas with open permits, incidents and inspection scores',
    'Each chart opens the incidents or observations behind it',
], shot('she'), tags=['K3', 'Clickable charts'])

d.flow('SHE / K3. Permit to work', 'No permit is approved on a failed gas test.', [
    dict(label='Permit to work',
         before=[['Permit request', '(K3 or contractor)'], ['Gas test', '(O2 and LEL)']],
         question='Gas test pass?',
         after=[['Safety Inspector', 'level 1'], ['K3 Officer, then', 'SHE Manager']],
         no='Ventilate and re-test',
         note='Approve stays blocked -> re-test', note_at='no',
         loop=True),
])

d.showcase('SHE / K3. Permit board', 'Every permit by state, with its next approver.', [
    'Requested, approved, active and suspended permits side by side',
    'Failed gas tests flagged in red on the card',
    'Approve, issue, suspend or close from the board',
    'Health tab: MCU fitness, licences due, B3 waste and fire equipment',
], shot('she-permits'), tags=['PTW', 'JSA'])

# SERVICES
d.showcase('SERVICES. Human capital', 'HRIS for 2,562 people across four companies.', [
    'Attendance, leave, overtime, payroll, contracts and recruitment',
    'Org chart counts staff in every unit and the units below it',
    'Employees file leave and overtime from the ESS portal',
    'K3 training completion tracked with the HR records',
], shot('hris'), tags=['HRIS', 'ESS'])

d.showcase('SERVICES. Finance and accounting', 'Payables, receivables and the close in one place.', [
    'Journals, AP with 3-way match, AR, e-Faktur and vendor payments',
    'AP and AR aging; each bucket opens exactly its invoices',
    'Journals waiting for approval with approve and reject in the row',
    'Bank reconciliation, petty cash, cash advances and period close',
], shot('finance'), tags=['FIN', 'e-Faktur'])

# CONTROL
d.table('SERVICES. Approval matrix', 'Approval levels set by document, company and amount.', ['Document', 'Amount band', 'Level 1', 'Level 2', 'Level 3'], [
    ['Purchase order', 'Up to Rp 500 M', 'Head of Procurement', '', ''],
    ['Purchase order', 'Above Rp 500 M', 'Head of Procurement', 'Finance Controller', 'CFO'],
    ['Requisition', 'Above Rp 1 B', 'Head of Procurement', 'CFO', ''],
    ['Leave request', 'Above 5 days', 'HR Manager', 'HR Director', ''],
    ['Payroll run', 'Any', 'HR Director', 'Finance Controller', 'CFO'],
    ['Permit to work', 'Any', 'Safety Inspector', 'K3 Officer', 'SHE Manager'],
    ['Journal entry', 'Above Rp 1 B', 'Chief Accountant', 'Finance Controller', ''],
    ['Vendor payment', 'Any', 'Finance Controller', 'CFO', ''],
    ['Scrap and disposal', 'Any', 'Inventory Controller', 'SHE Manager', ''],
], widths=[3, 2.6, 3.2, 3.2, 3], light=True, note='Rules, levels, delegations and permission overrides are master data in System Administration.')

d.showcase('SERVICES. Approval on the record', 'Each record shows who signed and who is next.', [
    'Approval chain card: signed levels, the current level and the rest',
    'The approve button names the level: "Approve, level 2 of 3"',
    'Delegations let a deputy sign while the approver is away',
    'A rejection clears the signatures and starts the round again',
], shot('permit'), tags=['Multilevel', 'Delegation'])

d.cards('SERVICES. Administration', 'Settings are records, so admins change them without code.', [
    ('Roles and approval', [
        'Roles from the user matrix, with permission overrides per module',
        'Approval matrix by document, company and amount, with SLA hours',
        'Delegations with start and end dates for approvers on leave',
    ], True),
    ('General setup', [
        'Number ranges, holiday calendar and notification templates',
        'Currencies, tax codes, company codes, plants and cost centres',
        'Every change keeps its history on the record',
    ], False),
])

# DELIVERY
d.steps('DELIVERY. Scrum SDLC', 'Working software every two weeks.', [
    ('Backlog', 'Product Owner orders features from the scope and user matrix'),
    ('Planning', 'The team commits to a sprint goal and the stories that meet it'),
    ('Build', 'Daily stand-up; code review and automated tests on every merge'),
    ('Test', 'QA in staging; key users run UAT on finished stories'),
    ('Review', 'The team demos working software to Satona each sprint'),
    ('Retro', 'The team agrees one or two improvements for the next sprint'),
], callout=('Two-week sprints.', 'Each sprint ends with a release candidate in staging; production gets it at the next release.'))

d.table('DELIVERY. Ceremonies', 'Every ceremony has an owner and an output.', ['Ceremony', 'When', 'Who', 'Output'], [
    ['Sprint planning', 'Day 1, 2 hours', 'Product Owner, Scrum Master, team', 'Sprint goal and sprint backlog'],
    ['Daily stand-up', 'Every day, 15 minutes', 'Development team', 'Blockers raised and owned'],
    ['Backlog refinement', 'Mid-sprint, 1 hour', 'Product Owner, team', 'Ready stories for the next sprint'],
    ['Sprint review', 'Last day, 1 hour', 'Team and Satona stakeholders', 'Accepted increment and feedback'],
    ['Retrospective', 'Last day, 1 hour', 'Team and Scrum Master', 'Improvement actions'],
    ['Release and UAT', 'Each release', 'Key users and QA', 'Sign-off to go live'],
], widths=[3, 3, 4.2, 4.2], light=True)

d.cards('DELIVERY. Quality gates', 'A story enters a sprint ready and leaves it done.', [
    ('Definition of ready', [
        'Acceptance criteria and the role that uses the story',
        'Record types, fields and workflow states agreed',
        'Designs and test data available',
    ], False),
    ('Definition of done', [
        'Code reviewed; unit and API tests pass in CI',
        'Deployed to staging and passes the UI checks: no overflow, both themes',
        'Product Owner accepts it in the sprint review',
    ], True),
], numbered=False)

# ARCHITECTURE
s_arch, b = d.dark('ARCHITECTURE. Microservice-ready', 'One service per business domain, behind one gateway.')
C = 'SB'
def box(x, y, w, h, head, sub=None, fill=GLASS, line=None, size=15):
    ps = [para(run(head, C, size), algn='ctr', lh=size * 1.15)]
    if sub:
        ps.append(para(run(sub, 'RG', 11, GREY), algn='ctr', lh=14))
    b.rrect(x, y, w, h, 0.1, fill=fill, line=line, paras=ps)
W3 = (17.95 - 2 * 0.3) / 3
for i, (h, sub) in enumerate([('Web console', 'React, role-based menus'), ('Phone and driver app', 'Check-in, ESS, approvals'), ('Partner portals', 'Vendors, distributors, contractors')]):
    box(1.02 + i * (W3 + 0.3), 2.55, W3, 0.8, h, sub)
b.line(10, 3.38, 10, 3.62)
box(1.02, 3.65, 17.95, 0.62, 'API gateway  ·  Keycloak SSO and role tokens  ·  audit log', size=14)
b.line(10, 4.3, 10, 4.55)
W5 = (17.95 - 4 * 0.25) / 5
SERVICES = [
    ('Identity and access', 'SYS roles, permissions', False), ('Master data', 'MDM, company codes, plants', False),
    ('Workflow and approval', 'Matrix, levels, delegations', True), ('Finance', 'FIN, EPM, FBL, GRC', False),
    ('Procurement and stock', 'VMS, INV, WMS', False), ('Human capital', 'HRS, ESS, GAS', False),
    ('SHE / K3', 'Permits, incidents, MCU', False), ('Logistics', 'TMS, HAZ, DMS, devices', False),
    ('Plant operations', 'MES, EAM, QC, BPF, MRP', False), ('Process and storage', 'CFP, TFM, GTR, EHS', False),
]
for i, (h, sub, accent) in enumerate(SERVICES):
    box(1.02 + (i % 5) * (W5 + 0.25), 4.58 + (i // 5) * 1.25, W5, 1.05, h, sub,
        fill=REDGLASS if accent else GLASS, line=ln(RED, 19050, 80000) if accent else None)
b.line(10, 6.9, 10, 7.12)
box(1.02, 7.15, 17.95, 0.62, 'Event bus  ·  RecordCreated, StatusChanged, ApprovalSigned, AlarmRaised', size=14)
b.line(10, 7.8, 10, 8.05)
for i, (h, sub) in enumerate([('Database per service', 'Each service owns its tables'), ('Reporting and command centre', 'BI and OCC read from events'), ('Notifications', 'Email, WhatsApp, in-app')]):
    box(1.02 + i * (W3 + 0.3), 8.08, W3, 0.95, h, sub)
d.notes(s_arch, 'Service boundaries follow the module catalogue; the workflow service is shared because every module uses the approval matrix.')

d.compare('ARCHITECTURE. From demo to services', 'The demo already splits along the same seams.', 'In the demo today', 'In production', [
    ('Clean architecture: domain and use cases carry no React', 'Domain and use-case code moves into each service unchanged'),
    ('Pages call ports in application/ports.ts', 'HTTP adapters call the service APIs behind the same ports'),
    ('Mock adapters; VITE_API_URL picks the source', 'Point VITE_API_URL at the gateway; no page changes'),
    ('Records live in memory and reset on reload', 'Each service owns a database and publishes events'),
    ('Access and approval rules run in the browser', 'Services enforce them; Keycloak tokens carry the role'),
])

# PLANNING
d.table('PLANNING. Release plan', 'Six releases in sixteen two-week sprints.', ['Release', 'Sprints', 'Scope', 'Exit criteria'], [
    ['Sprint 0: foundation', '1', 'Repositories, CI/CD, environments, Keycloak, gateway, event bus', 'Pipeline deploys to staging'],
    ['R1: core platform', '3', 'Identity, master data, workflow and approval, finance', 'Approval matrix live for real users'],
    ['R2: logistics', '3', 'TMS, WMS, HAZ, fleet devices, check-in, ADAS and DSM', 'Rotama runs trips in the ERP'],
    ['R3: plants', '4', 'MES, EAM, QC, BPF, MRP, tank farm, process, genealogy', 'Rodame and Roasi shifts recorded'],
    ['R4: shared services', '3', 'HRIS, SHE / K3, inventory, purchasing, service desk', 'Payroll and permits run live'],
    ['R5: insight and go-live', '2', 'BI, command centre, data migration, training, hypercare', 'Go-live sign-off'],
    ['Total', '16', 'About 32 weeks of build', ''],
], widths=[3.2, 1.4, 6.6, 4.2], total_row=True, align=['l', 'ctr', 'l', 'l'], note='Proposed plan; the team confirms sprint counts and velocity in Sprint 0.')

d.columns('PLANNING. Squads', 'Four squads, each owning its services end to end.', [
    dict(status=None, status_label='SQUAD 1', head='Platform', sub='Core services', items=[
        'Identity and access', 'Master data', 'Workflow and approval', 'Gateway and CI/CD']),
    dict(status=None, status_label='SQUAD 2', head='Logistics', sub='Rotama', items=[
        'TMS and fleet devices', 'WMS and HAZ', 'Check-in, ADAS and DSM', 'Distribution (DMS)']),
    dict(status=None, status_label='SQUAD 3', head='Plants', sub='Rodame and Roasi', items=[
        'MES and EAM', 'QC, BPF and MRP', 'Tank farm and process', 'Genealogy and recall']),
    dict(status=None, status_label='SQUAD 4', head='Business', sub='Shared services', items=[
        'Finance and accounting', 'HRIS and ESS', 'SHE / K3', 'Procurement and inventory']),
])

d.closing('A working walkthrough of the whole group, ready for review with Satona.', 'Try it with', ['Any of 24 personas', 'Cmd+K search', 'Click any chart'], [('Repository', 'github.com/syabanf/satona-erp'), ('Web', 'www.wit.id')])

d.save(OUT)
print('saved', OUT)
