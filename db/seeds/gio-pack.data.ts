/**
 * Demo data for a Gio Pack-like distributor in Corral de Bustos, Córdoba.
 * Names, CUITs and amounts are invented. CUITs get a valid check digit at seed time.
 */

export const business = {
  name: 'Gio Pack',
}

export const categories = [
  'Bolsas',
  'Descartables',
  'Papelería',
  'Film y aluminio',
  'Limpieza',
  'Bandejas y envases',
] as const

type Category = typeof categories[number]

export interface ProductSeed {
  code: string
  name: string
  brand?: string
  category: Category
  price: string
  vatRate?: string
  /** Units counted at the initial stock count. */
  stock: number
}

export const products: ProductSeed[] = [
  // Bolsas
  { code: 'BOL-001', name: 'Bolsa camiseta 30x40 x100', brand: 'Polibag', category: 'Bolsas', price: '2850.00', stock: 120 },
  { code: 'BOL-002', name: 'Bolsa camiseta 40x50 x100', brand: 'Polibag', category: 'Bolsas', price: '3990.00', stock: 95 },
  { code: 'BOL-003', name: 'Bolsa camiseta 45x60 x100', brand: 'Polibag', category: 'Bolsas', price: '5250.00', stock: 60 },
  { code: 'BOL-004', name: 'Bolsa residuo 45x60 x10', brand: 'Limpex', category: 'Bolsas', price: '890.00', stock: 300 },
  { code: 'BOL-005', name: 'Bolsa residuo 60x90 x10', brand: 'Limpex', category: 'Bolsas', price: '1450.00', stock: 240 },
  { code: 'BOL-006', name: 'Bolsa consorcio 80x110 x10', brand: 'Limpex', category: 'Bolsas', price: '2980.00', stock: 150 },
  { code: 'BOL-007', name: 'Bolsa arranque 20x30 rollo x500', category: 'Bolsas', price: '3600.00', stock: 40 },
  { code: 'BOL-008', name: 'Bolsa papel madera N°5 x100', category: 'Bolsas', price: '6900.00', stock: 25 },
  // Descartables
  { code: 'DES-001', name: 'Vaso plástico 180cc x100', brand: 'Darnel', category: 'Descartables', price: '2350.00', stock: 200 },
  { code: 'DES-002', name: 'Vaso plástico 330cc x50', brand: 'Darnel', category: 'Descartables', price: '2780.00', stock: 140 },
  { code: 'DES-003', name: 'Vaso térmico 240cc x25', brand: 'Darnel', category: 'Descartables', price: '3150.00', stock: 80 },
  { code: 'DES-004', name: 'Plato plástico playo 22cm x50', category: 'Descartables', price: '3400.00', stock: 90 },
  { code: 'DES-005', name: 'Cubiertos plásticos surtidos x100', category: 'Descartables', price: '2990.00', stock: 70 },
  { code: 'DES-006', name: 'Sorbete flexible x500', category: 'Descartables', price: '2100.00', stock: 55 },
  { code: 'DES-007', name: 'Guante descartable nitrilo x100', brand: 'Safety', category: 'Descartables', price: '8900.00', stock: 30 },
  // Papelería
  { code: 'PAP-001', name: 'Servilleta 30x30 x100', brand: 'Elite', category: 'Papelería', price: '1650.00', stock: 180 },
  { code: 'PAP-002', name: 'Rollo de cocina x3', brand: 'Elite', category: 'Papelería', price: '2450.00', stock: 160 },
  { code: 'PAP-003', name: 'Papel higiénico 300m bobina', category: 'Papelería', price: '4100.00', stock: 75 },
  { code: 'PAP-004', name: 'Toalla intercalada x2500', category: 'Papelería', price: '12500.00', stock: 35 },
  { code: 'PAP-005', name: 'Papel obra 70x100 x10 pliegos', category: 'Papelería', price: '5800.00', stock: 20 },
  // Film y aluminio
  { code: 'FIL-001', name: 'Film stretch 38cm x 1,2kg', category: 'Film y aluminio', price: '9800.00', stock: 45 },
  { code: 'FIL-002', name: 'Film PVC 38cm x 1000m', category: 'Film y aluminio', price: '18900.00', stock: 22 },
  { code: 'FIL-003', name: 'Papel aluminio 30cm x 100m', brand: 'Rendidor', category: 'Film y aluminio', price: '14600.00', stock: 28 },
  // Limpieza
  { code: 'LIM-001', name: 'Lavandina 5L', brand: 'Clorox', category: 'Limpieza', price: '4200.00', stock: 100 },
  { code: 'LIM-002', name: 'Detergente concentrado 5L', category: 'Limpieza', price: '6800.00', stock: 85 },
  { code: 'LIM-003', name: 'Desengrasante 5L', category: 'Limpieza', price: '7900.00', stock: 40 },
  { code: 'LIM-004', name: 'Trapo de piso gris', category: 'Limpieza', price: '1350.00', stock: 150 },
  { code: 'LIM-005', name: 'Esponja doble faz x10', category: 'Limpieza', price: '3200.00', stock: 60 },
  // Bandejas y envases
  { code: 'BAN-001', name: 'Bandeja telgopor 103 x100', category: 'Bandejas y envases', price: '5600.00', stock: 110 },
  { code: 'BAN-002', name: 'Bandeja telgopor 107 x100', category: 'Bandejas y envases', price: '7400.00', stock: 90 },
  { code: 'BAN-003', name: 'Bandeja aluminio F100 x100', category: 'Bandejas y envases', price: '15800.00', stock: 30 },
  { code: 'BAN-004', name: 'Envase pote 500cc con tapa x50', category: 'Bandejas y envases', price: '8200.00', stock: 50 },
  { code: 'BAN-005', name: 'Caja pizza blanca 35cm x50', category: 'Bandejas y envases', price: '16500.00', stock: 0 },
]

/** An inactive product, to have one hidden from order entry. */
export const inactiveProductCodes = ['PAP-005']

export interface CustomerSeed {
  key: string
  name: string
  legalName?: string
  /** 10 digits without the check digit; the seed computes it. */
  cuitBase?: string
  vatCondition?: 'responsable_inscripto' | 'monotributo' | 'consumidor_final' | 'exento'
  phone?: string
  branches: { name?: string, address: string, city: string }[]
  /** Carried over from the old Excel sheet. Positive means the customer owes. */
  openingBalance?: { amount: string, date: string }
}

export const customers: CustomerSeed[] = [
  {
    key: 'super-el-trebol',
    name: 'Super El Trébol',
    legalName: 'El Trébol Alimentos SRL',
    cuitBase: '3071234567',
    vatCondition: 'responsable_inscripto',
    phone: '3468 412233',
    branches: [
      { name: 'Centro', address: 'Av. Santa Fe 455', city: 'Corral de Bustos' },
      { name: 'Barrio Norte', address: 'Belgrano 1120', city: 'Corral de Bustos' },
    ],
    openingBalance: { amount: '184500.00', date: '2026-10-31' },
  },
  {
    key: 'panaderia-la-espiga',
    name: 'Panadería La Espiga',
    cuitBase: '2028456789',
    vatCondition: 'monotributo',
    phone: '3468 455810',
    branches: [{ address: 'San Martín 230', city: 'Corral de Bustos' }],
    openingBalance: { amount: '42300.00', date: '2026-10-31' },
  },
  {
    key: 'rotiseria-don-tito',
    name: 'Rotisería Don Tito',
    cuitBase: '2031987654',
    vatCondition: 'monotributo',
    phone: '3468 401177',
    branches: [{ address: 'Rivadavia 88', city: 'Isla Verde' }],
  },
  {
    key: 'carniceria-los-hermanos',
    name: 'Carnicería Los Hermanos',
    legalName: 'Los Hermanos Ganadera SA',
    cuitBase: '3070987612',
    vatCondition: 'responsable_inscripto',
    phone: '3468 490021',
    branches: [{ address: 'Bv. Colón 610', city: 'Isla Verde' }],
    openingBalance: { amount: '96750.00', date: '2026-10-31' },
  },
  {
    key: 'kiosco-el-paso',
    name: 'Kiosco El Paso',
    vatCondition: 'consumidor_final',
    phone: '3468 15 667788',
    branches: [{ address: 'Ruta 11 km 3', city: 'Camilo Aldao' }],
  },
  {
    key: 'almacen-dona-rosa',
    name: 'Almacén Doña Rosa',
    cuitBase: '2725678901',
    vatCondition: 'monotributo',
    phone: '3468 470099',
    branches: [{ address: 'Italia 345', city: 'Camilo Aldao' }],
    openingBalance: { amount: '15800.00', date: '2026-10-31' },
  },
  {
    key: 'heladeria-polo-norte',
    name: 'Heladería Polo Norte',
    cuitBase: '2033445566',
    vatCondition: 'monotributo',
    phone: '3472 421300',
    branches: [{ address: '9 de Julio 150', city: 'Monte Maíz' }],
  },
  {
    key: 'club-atletico-monte-maiz',
    name: 'Club Atlético Monte Maíz',
    legalName: 'Asociación Civil Club Atlético Monte Maíz',
    cuitBase: '3069012345',
    vatCondition: 'exento',
    phone: '3472 420050',
    branches: [{ name: 'Cantina', address: 'Sarmiento 900', city: 'Monte Maíz' }],
    openingBalance: { amount: '-8000.00', date: '2026-10-31' },
  },
  {
    key: 'autoservicio-guatimozin',
    name: 'Autoservicio Guatimozín',
    cuitBase: '3071555444',
    vatCondition: 'responsable_inscripto',
    phone: '3468 498112',
    branches: [{ address: 'Av. Libertad 210', city: 'Guatimozín' }],
  },
  {
    key: 'bar-la-esquina',
    name: 'Bar La Esquina',
    cuitBase: '2040112233',
    vatCondition: 'monotributo',
    phone: '3468 15 554433',
    branches: [{ address: 'Mitre y Moreno', city: 'Inriville' }],
  },
  {
    key: 'distribuidora-del-sur',
    name: 'Distribuidora del Sur',
    legalName: 'Del Sur Distribuciones SRL',
    cuitBase: '3071888999',
    vatCondition: 'responsable_inscripto',
    phone: '3472 425566',
    branches: [
      { name: 'Depósito', address: 'Ruta 9 km 443', city: 'Marcos Juárez' },
      { name: 'Local', address: 'San Martín 1020', city: 'Marcos Juárez' },
    ],
  },
  {
    key: 'comedor-escolar-arias',
    name: 'Comedor Escolar Arias',
    vatCondition: 'exento',
    phone: '3468 440120',
    branches: [{ address: 'Escuela Normal, Belgrano 500', city: 'Arias' }],
  },
]

export const suppliers = [
  { key: 'plasticos-del-centro', name: 'Plásticos del Centro SA', cuitBase: '3070111222', phone: '351 4567890' },
  { key: 'papelera-rosario', name: 'Papelera Rosario SRL', cuitBase: '3070333444', phone: '341 4223344' },
  { key: 'quimica-pampeana', name: 'Química Pampeana SA', cuitBase: '3070555666', phone: '3462 431100' },
]
