/**
 * Sub-modules that group a module's record types in its side panel, so a long list of master data or daily work
 * reads as a few named sets. Modules with a short list stay ungrouped.
 */
const SUB_MODULES: Record<string, ReadonlyArray<[label: string, types: readonly string[]]>> = {
  eam: [
    ['Aset dan mesin', ['assets', 'partfits', 'meters', 'conditions']],
    ['Suku cadang', ['parts', 'issues']],
    ['Perencanaan perawatan', ['plans', 'jobplans', 'workorders', 'requests']],
    ['Tim dan alat', ['technicians', 'tools']],
    ['Keandalan dan kalibrasi', ['failurecodes', 'rca', 'calibrations']],
  ],
  mes: [
    ['Rute dan shift', ['routing', 'shifts', 'workorders']],
    ['Kinerja (OEE)', ['reasons', 'oee', 'downtime']],
    ['Mutu', ['defects', 'holds', 'ncr']],
  ],
  mdm: [
    ['Organisasi', ['companies', 'plants', 'costcenters', 'profitcenters']],
    ['Keuangan', ['accounts', 'groupcoa', 'currencies', 'taxcodes', 'paymentterms', 'banks']],
    ['Mitra, material dan karyawan', ['partners', 'materials', 'employees', 'uom', 'changes']],
  ],
  sys: [
    ['Integrasi', ['topics', 'connectors', 'apis', 'idp']],
    ['Akses dan persetujuan', ['roles', 'permissions', 'matrix', 'levels', 'delegations']],
    ['Umum', ['numbering', 'settings', 'holidays', 'templates']],
  ],
  she: [
    ['Bahaya dan izin kerja', ['areas', 'hiradc', 'permits', 'jsa']],
    ['Insiden dan inspeksi', ['incidents', 'observations', 'inspections', 'capa', 'audits']],
    ['APD dan kesehatan', ['ppe', 'ppeissues', 'mcu', 'fireequipment', 'toolbox']],
    ['Lingkungan dan lisensi', ['waste', 'licences']],
  ],
  hrs: [
    ['Organisasi', ['orgunits', 'positions', 'contracts']],
    ['Waktu kerja', ['shifts', 'leavetypes', 'attendance', 'leaves', 'overtime']],
    ['Gaji dan pinjaman', ['payroll', 'loans']],
    ['Talenta', ['candidates', 'onboarding', 'appraisals', 'trainings', 'announcements']],
  ],
  vms: [
    ['Pemasok', ['avl', 'criteria', 'ratings', 'inforecords', 'contracts']],
    ['Pengadaan', ['demands', 'requisitions', 'rfqs', 'quotations', 'orders']],
    ['Penerimaan dan tagihan', ['receipts', 'inspections', 'returns', 'vendorinvoices']],
  ],
  tms: [
    ['Armada', ['vehicles', 'drivers', 'devices', 'p2h', 'checkins']],
    ['Rute dan lokasi', ['locations', 'lanes', 'geofences', 'trips']],
    ['Telemetri dan keselamatan', ['telemetry', 'safety']],
  ],
  fin: [
    ['Buku besar', ['journals', 'closing', 'assets']],
    ['Utang dan piutang', ['payables', 'receivables', 'payments', 'taxinvoices']],
    ['Kas dan bank', ['reconciliations', 'pettycash', 'advances']],
  ],
  epm: [
    ['Konsolidasi', ['periods', 'consolidations', 'intercompany', 'adjustments']],
    ['Mata uang', ['fx', 'revaluations']],
    ['Anggaran', ['budgets', 'forecasts']],
  ],
  occ: [
    ['Pemantauan', ['units', 'sources', 'cameras', 'energy']],
    ['Alarm', ['register', 'escalation', 'alarms']],
    ['Proyek', ['projects']],
  ],
}

/** The sub-module of a record type, such as "Suku cadang" for `eam.parts`; undefined where the module has none. */
export function subModuleOf(typeKey: string): string | undefined {
  const [module = '', type = ''] = typeKey.split('.')
  return SUB_MODULES[module]?.find(([, types]) => types.includes(type))?.[0]
}

/** Sub-module labels of a module in panel order. */
export const subModulesOf = (module: string) => (SUB_MODULES[module] ?? []).map(([label]) => label)
