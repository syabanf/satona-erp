/** The 57 rows of the Satona gap analysis (30 Oct 2026) and the demo screens that answer each one. */
export type Entity = 'holding' | 'rotama' | 'rodame' | 'roasi' | 'integration'
export interface GapItem {
  no: number
  entity: Entity
  module: string
  scope: string
  priority: 'High' | 'Medium'
  /** What the gap sheet found in the SIW app before this round. */
  before: 'Missing' | 'Partial'
  links: ReadonlyArray<[label: string, to: string]>
  /** Set where the demo shows the behaviour on mock data only. */
  note?: string
}

const r = (path: string) => `/modules/${path}`
const BACKEND = 'Shown as configuration and mock telemetry; the real broker, pipeline and gateway come with the backend build.'

export const GAP_ITEMS: readonly GapItem[] = [
  { no: 1, entity: 'holding', module: 'MDM', scope: 'Central chart of accounts', priority: 'High', before: 'Partial', links: [['Group chart of accounts', r('mdm/groupcoa')], ['Local accounts mapped', r('mdm/accounts')]] },
  { no: 2, entity: 'holding', module: 'MDM', scope: 'Group customer and vendor master', priority: 'High', before: 'Partial', links: [['Master change requests', r('mdm/changes')], ['Business partners', r('mdm/partners')]] },
  { no: 3, entity: 'holding', module: 'MDM', scope: 'Material catalogue and B3 codes', priority: 'High', before: 'Partial', links: [['Material catalogue', r('mdm/materials')], ['UN dangerous goods list', r('haz/unlist')]] },
  { no: 4, entity: 'holding', module: 'EPM', scope: 'Automated monthly and yearly consolidation', priority: 'High', before: 'Missing', links: [['Consolidation runs', r('epm/consolidations')], ['Consolidation journals', r('epm/adjustments')]] },
  { no: 5, entity: 'holding', module: 'EPM', scope: 'Intercompany elimination', priority: 'High', before: 'Missing', links: [['Intercompany entries', r('epm/intercompany')], ['Elimination journals', r('epm/adjustments')]] },
  { no: 6, entity: 'holding', module: 'EPM', scope: 'Multi-currency FX revaluation', priority: 'High', before: 'Missing', links: [['FX revaluation runs', r('epm/revaluations')], ['FX rates', r('epm/fx')]] },
  { no: 7, entity: 'holding', module: 'EPM', scope: 'Group budgeting and forecasting', priority: 'Medium', before: 'Partial', links: [['Group budgets', r('epm/budgets')], ['Rolling forecasts', r('epm/forecasts')]] },
  { no: 8, entity: 'holding', module: 'VMS', scope: 'Central purchasing of ammonia, phosphoric acid and sulfur', priority: 'High', before: 'Partial', links: [['Group demand plans', r('vms/demands')], ['RFQs and tenders', r('vms/rfqs')], ['Outline contracts', r('vms/contracts')]] },
  { no: 9, entity: 'holding', module: 'VMS', scope: 'Supplier rating and ranking', priority: 'Medium', before: 'Partial', links: [['Supplier ratings', r('vms/ratings')], ['Rating criteria', r('vms/criteria')], ['Approved vendor list', r('vms/avl')]] },
  { no: 10, entity: 'holding', module: 'VMS', scope: 'B2B vendor portal', priority: 'Medium', before: 'Missing', links: [['Vendor quotations', r('vms/quotations')], ['Vendor portal invoices', r('vms/vendorinvoices')], ['Vendor login', '/login']] },
  { no: 11, entity: 'holding', module: 'GRC', scope: 'B3 permits and licence renewal', priority: 'High', before: 'Missing', links: [['Permits and licences', r('grc/permits')], ['K3 licences', r('she/licences')]] },
  { no: 12, entity: 'holding', module: 'GRC', scope: 'Regulatory audit trail and environmental compliance', priority: 'Medium', before: 'Partial', links: [['Compliance reports with e-sign', r('grc/reports')], ['Regulations register', r('grc/regulations')]] },
  { no: 13, entity: 'holding', module: 'SHE', scope: 'Holding EHS / K3 audits', priority: 'High', before: 'Missing', links: [['K3 audits', r('she/audits')], ['CAPA', r('she/capa')], ['SHE cockpit', '/she']] },
  { no: 14, entity: 'holding', module: 'GRC', scope: 'Corporate risk matrix', priority: 'Medium', before: 'Missing', links: [['Risk register', r('grc/risks')], ['Risk heat map', '/analytics']] },
  { no: 15, entity: 'holding', module: 'BI', scope: 'Executive KPIs across subsidiaries', priority: 'High', before: 'Partial', links: [['Executive overview', '/'], ['KPI targets', r('bi/kpis')]] },
  { no: 16, entity: 'holding', module: 'BI', scope: 'Production, inventory turnover, sales and purchasing dashboards', priority: 'Medium', before: 'Partial', links: [['Group analytics', '/analytics']] },
  { no: 17, entity: 'holding', module: 'BI', scope: 'Group asset utilisation analytics', priority: 'Medium', before: 'Missing', links: [['Group analytics', '/analytics'], ['Fixed assets', r('fin/assets')]] },
  { no: 18, entity: 'rotama', module: 'TMS', scope: 'Tank truck route optimisation', priority: 'High', before: 'Missing', links: [['Trips with drops and cost', r('tms/trips')], ['Lanes', r('tms/lanes')], ['Fleet map', '/fleet']] },
  { no: 19, entity: 'rotama', module: 'TMS', scope: 'GPS tracking and driver behaviour', priority: 'High', before: 'Missing', links: [['Fleet map', '/fleet'], ['Geofences', r('tms/geofences')], ['Safety ADAS and DSM', '/fleet/safety']] },
  { no: 20, entity: 'rotama', module: 'TMS', scope: 'IoT tank temperature and pressure telemetry', priority: 'Medium', before: 'Missing', links: [['Tank telemetry', r('tms/telemetry')], ['IoT devices', r('tms/devices')]] },
  { no: 21, entity: 'rotama', module: 'WMS', scope: 'Storage segregation by hazard class', priority: 'High', before: 'Missing', links: [['Putaway and picking tasks', r('wms/tasks')], ['Zones', r('wms/zones')], ['Bins', r('wms/bins')]] },
  { no: 22, entity: 'rotama', module: 'WMS', scope: 'Lot tracking with FEFO and FIFO', priority: 'High', before: 'Partial', links: [['Lots', r('wms/lots')], ['Warehouse tasks', r('wms/tasks')]] },
  { no: 23, entity: 'rotama', module: 'HAZ', scope: 'B3 manifest automation (KLHK, Kemenhub)', priority: 'High', before: 'Missing', links: [['B3 manifests with Festronik number', r('haz/manifests')]] },
  { no: 24, entity: 'rotama', module: 'HAZ', scope: 'Driver DG certificates and safety passport', priority: 'High', before: 'Missing', links: [['Driver certificates', r('haz/certificates')], ['Fleet check-in', '/fleet/checkin']] },
  { no: 25, entity: 'rotama', module: 'FBL', scope: 'Cost-plus freight tariff', priority: 'High', before: 'Missing', links: [['Rate cards', r('fbl/rates')]] },
  { no: 26, entity: 'rotama', module: 'FBL', scope: 'Internal freight invoices to Rodame and Roasi', priority: 'High', before: 'Missing', links: [['Freight invoices', r('fbl/invoices')], ['Intercompany entries', r('epm/intercompany')]] },
  { no: 27, entity: 'rotama', module: 'FBL', scope: 'Logistics billing to external customers', priority: 'Medium', before: 'Partial', links: [['Freight invoices with POD', r('fbl/invoices')]] },
  { no: 28, entity: 'rodame', module: 'BPF', scope: 'Flexible NPK and urea formulas', priority: 'High', before: 'Partial', links: [['Formulas with versions', r('bpf/formulas')], ['Bills of materials', r('bpf/bom')]] },
  { no: 29, entity: 'rodame', module: 'BPF', scope: 'Automatic grade moisture adjustment', priority: 'High', before: 'Missing', links: [['Moisture adjustments', r('bpf/moisture')]] },
  { no: 30, entity: 'rodame', module: 'MRP', scope: 'Bulk raw material planning', priority: 'High', before: 'Partial', links: [['Requirements', r('mrp/requirements')], ['Planned orders', r('mrp/planned')]] },
  { no: 31, entity: 'rodame', module: 'MRP', scope: 'Granulator, dryer and mixer scheduling', priority: 'High', before: 'Missing', links: [['Scheduling board', '/mrp/planning'], ['Work centres', r('mrp/workcenters')]] },
  { no: 32, entity: 'rodame', module: 'MRP', scope: 'Capacity requirement planning', priority: 'Medium', before: 'Missing', links: [['Capacity load', '/mrp/planning'], ['Routings', r('mes/routing')]] },
  { no: 33, entity: 'rodame', module: 'QC', scope: 'N, P, K and moisture lab testing', priority: 'High', before: 'Partial', links: [['Samples', r('qc/samples')], ['Inspection plans', r('qc/plans')], ['Test methods', r('qc/methods')]] },
  { no: 34, entity: 'rodame', module: 'QC', scope: 'Certificate of analysis', priority: 'High', before: 'Missing', links: [['Certificates of analysis', r('qc/coa')]] },
  { no: 35, entity: 'rodame', module: 'QC', scope: 'Rejection and reprocessing workflow', priority: 'Medium', before: 'Partial', links: [['Quality holds', r('mes/holds')], ['Non-conformance reports', r('mes/ncr')]] },
  { no: 36, entity: 'rodame', module: 'EAM', scope: 'Predictive and preventive maintenance', priority: 'High', before: 'Missing', links: [['Reliability cockpit', '/eam/reliability'], ['Maintenance plans', r('eam/plans')], ['Work orders', r('eam/workorders')]] },
  { no: 37, entity: 'rodame', module: 'EAM', scope: 'Granulator dryer maintenance and spare parts', priority: 'Medium', before: 'Missing', links: [['Spare parts', r('eam/parts')], ['Job plans', r('eam/jobplans')]] },
  { no: 38, entity: 'rodame', module: 'EAM', scope: 'Scale and gauge calibration', priority: 'Medium', before: 'Missing', links: [['Calibrations', r('eam/calibrations')]] },
  { no: 39, entity: 'rodame', module: 'DMS', scope: 'Subsidised and commercial quota allocation', priority: 'High', before: 'Missing', links: [['Quota allocations', r('dms/quotas')], ['Distribution map', '/distribution']] },
  { no: 40, entity: 'rodame', module: 'DMS', scope: 'Regional distributor and kiosk network', priority: 'High', before: 'Partial', links: [['Distributors with credit limits', r('dms/distributors')], ['Kiosks', r('dms/kiosks')]] },
  { no: 41, entity: 'rodame', module: 'DMS', scope: 'Distributor mobile order app', priority: 'Medium', before: 'Partial', links: [['Distributor orders', r('dms/orders')], ['Distributor login', '/login']] },
  { no: 42, entity: 'roasi', module: 'CFP', scope: 'Continuous reactor tracking 24/7', priority: 'High', before: 'Missing', links: [['Production campaigns', r('cfp/campaigns')], ['Shift process logs', r('cfp/logs')]] },
  { no: 43, entity: 'roasi', module: 'CFP', scope: 'By-product and co-product accounting', priority: 'High', before: 'Missing', links: [['Co-product cost allocation', r('cfp/coproducts')]] },
  { no: 44, entity: 'roasi', module: 'CFP', scope: 'Yield loss analysis and waste', priority: 'Medium', before: 'Partial', links: [['Campaign yield loss', r('cfp/campaigns')], ['Process waste', r('cfp/waste')]] },
  { no: 45, entity: 'roasi', module: 'EHS', scope: 'Automatic MSDS / SDS', priority: 'High', before: 'Missing', links: [['Safety data sheets', r('ehs/sds')]] },
  { no: 46, entity: 'roasi', module: 'EHS', scope: 'Plant chemical hazard matrix', priority: 'High', before: 'Missing', links: [['Chemical hazard matrix', r('ehs/hazards')], ['HIRADC', r('she/hiradc')], ['Permit to work', r('she/permits')]] },
  { no: 47, entity: 'roasi', module: 'EHS', scope: 'Stack emission and wastewater monitoring', priority: 'High', before: 'Missing', links: [['Emission readings', r('ehs/emissions')], ['Monitoring points', r('ehs/points')]] },
  { no: 48, entity: 'roasi', module: 'TFM', scope: 'IoT dip level gauges', priority: 'High', before: 'Missing', links: [['Tank farm', '/tank-farm'], ['Gauges', r('tfm/gauges')]] },
  { no: 49, entity: 'roasi', module: 'TFM', scope: 'Real-time liquid and gas stock reconciliation', priority: 'High', before: 'Missing', links: [['Tank reconciliations', r('tfm/recons')]] },
  { no: 50, entity: 'roasi', module: 'TFM', scope: 'Auto-reorder point trigger', priority: 'High', before: 'Partial', links: [['Reorder rules', r('inv/reorder')], ['Tanks', r('tfm/tanks')]] },
  { no: 51, entity: 'roasi', module: 'GTR', scope: 'Batch genealogy from vendor lot to customer', priority: 'High', before: 'Missing', links: [['Traceability', '/traceability']] },
  { no: 52, entity: 'roasi', module: 'GTR', scope: 'Rapid recall on contamination', priority: 'High', before: 'Missing', links: [['Recalls and mock recalls', r('gtr/recalls')]] },
  { no: 53, entity: 'integration', module: 'Kafka / RabbitMQ', scope: 'Central event bus between subsidiaries', priority: 'High', before: 'Missing', links: [['Event topics', r('sys/topics')], ['Integration layer', '/integration']], note: BACKEND },
  { no: 54, entity: 'integration', module: 'Debezium CDC', scope: 'Change data capture to the warehouse', priority: 'Medium', before: 'Partial', links: [['CDC connectors', r('sys/connectors')]], note: BACKEND },
  { no: 55, entity: 'integration', module: 'ClickHouse', scope: 'Analytics warehouse for history and BI', priority: 'High', before: 'Missing', links: [['CDC sinks', r('sys/connectors')], ['Group analytics', '/analytics']], note: BACKEND },
  { no: 56, entity: 'integration', module: 'Keycloak IAM', scope: 'Group SSO with RBAC and ABAC', priority: 'High', before: 'Partial', links: [['Identity providers', r('sys/idp')], ['Roles', r('sys/roles')], ['User matrix', '/users']], note: BACKEND },
  { no: 57, entity: 'integration', module: 'Kong API gateway', scope: 'Throttling, quotas and API keys', priority: 'Medium', before: 'Partial', links: [['API gateway routes', r('sys/apis')]], note: BACKEND },
]
