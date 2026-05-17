'use strict';

const catalogoImp      = require('../../catalogo.json');
const catalogoGriferia = require('../../catalogo-griferia.json');
const catalogoJardin   = require('../../catalogo-jardin.json');

const SURFACE_GROUPS = {
  techo_losa:           ['losa', 'techo', 'azotea', 'tejado', 'terraza', 'marquesina', 'boveda', 'techo verde'],
  areas_humedas:        ['baño', 'cocina', 'balcon', 'jardinera', 'sauna', 'pared interior', 'canaleta de hormigon'],
  subterranea:          ['subterraneo', 'cimiento', 'sotano', 'muro de contencion', 'tanque enterrado',
                         'pozo de ascensor', 'mamposteria en contacto con suelo', 'aparcamiento', 'tunel', 'presa'],
  piscina_cisterna:     ['piscina', 'cisterna', 'deposito de agua', 'reservorio'],
  pared_fachada:        ['pared exterior', 'fachada', 'bloque de hormigon', 'revoque', 'drywall',
                         'mamposteria de ladrillo', 'marco metalico', 'marco de madera', 'fibrocemento',
                         'techo metalico', 'canaleta metalica', 'tuberia PVC'],
  juntas_fisuras:       ['junta', 'fisura', 'grieta'],
  hormigon_estructural: ['hormigon en masa', 'hormigon estructural', 'mortero estructural',
                         'hormigon fresco', 'hormigon con agua activa', 'junta con chorro de agua'],
};

const UBICACION_GROUPS_GRIFERIA = {
  bano:       ['baño', 'lavamanos'],
  cocina:     ['cocina'],
  lavanderia: ['lavanderia'],
  filtros:    ['filtro de agua'],
  exterior:   ['jardin', 'exterior'],
};

const UBICACION_GROUPS_JARDIN = {
  accesorios:     ['jardin', 'exterior'],
  tuberias_riego: ['riego', 'tuberia'],
  deposito:       ['deposito', 'cisterna', 'tanque'],
};

const CATEGORY_MENU_ROWS = [
  { id: 'cat_impermeabilizante', title: 'Impermeabilizantes',  description: 'Membranas, selladores, mantas líquidas' },
  { id: 'cat_griferia',          title: 'Grifería y Plomería', description: 'Grifos, duchas, accesorios de baño' },
  { id: 'cat_jardin',            title: 'Jardín y Riego',      description: 'Mangueras, pistolas, tuberías de riego' },
];

const SURFACE_MENU_ROWS = [
  { id: 'surf_techo_losa',        title: 'Techo o losa',         description: 'Azotea, losa expuesta, techo sin tráfico' },
  { id: 'surf_areas_humedas',     title: 'Áreas húmedas',        description: 'Baño, cocina, balcón, jardinera' },
  { id: 'surf_subterranea',       title: 'Subterráneo',          description: 'Cimientos, sótano, muros con suelo' },
  { id: 'surf_piscina_cisterna',  title: 'Piscina o cisterna',   description: 'Piscinas, cisternas, depósitos de agua' },
  { id: 'surf_pared_fachada',     title: 'Pared o fachada',      description: 'Paredes con humedad, fachadas' },
  { id: 'surf_juntas_fisuras',    title: 'Juntas y fisuras',     description: 'Sellado de juntas, grietas' },
  { id: 'surf_hormigon',          title: 'Hormigón estructural', description: 'Hormigón en masa, morteros' },
  { id: 'surf_no_se',             title: 'No sé / Otro',         description: 'Cuéntame tu caso' },
];

const UBICACION_MENU_ROWS_GRIFERIA = [
  { id: 'ubi_bano',       title: 'Baño',             description: 'Grifos de lavamanos, duchas, accesorios' },
  { id: 'ubi_cocina',     title: 'Cocina',            description: 'Grifos de mesa y pared para cocina' },
  { id: 'ubi_lavanderia', title: 'Lavandería',        description: 'Grifos y accesorios para lavadora' },
  { id: 'ubi_filtros',    title: 'Filtros de Agua',   description: 'Purificadores y grifos con filtro' },
  { id: 'ubi_exterior',   title: 'Exterior / Jardín', description: 'Grifos para uso al aire libre' },
];

const UBICACION_MENU_ROWS_JARDIN = [
  { id: 'ubi_accesorios',     title: 'Pistolas y Mangueras',  description: 'Hidropistolas, mangueras, kits de riego' },
  { id: 'ubi_tuberias_riego', title: 'Tuberías y Válvulas',   description: 'Conectores, adaptadores, válvulas' },
  { id: 'ubi_deposito',       title: 'Depósitos y Cisternas', description: 'Flotadores, válvulas para tanques' },
];

const CATALOG_MAP  = { griferia: catalogoGriferia, jardin: catalogoJardin };
const GROUP_MAP    = { griferia: UBICACION_GROUPS_GRIFERIA, jardin: UBICACION_GROUPS_JARDIN };
const FIELD_MAP    = { griferia: 'ubicacion', jardin: 'ubicacion' };

function filterProducts(categoryId, subFilterId) {
  const catalog  = CATALOG_MAP[categoryId]  ?? catalogoImp;
  const groupMap = GROUP_MAP[categoryId]    ?? SURFACE_GROUPS;
  const field    = FIELD_MAP[categoryId]    ?? 'superficies';

  let results  = catalog.slice();
  const keywords = subFilterId ? groupMap[subFilterId] : null;

  if (keywords) {
    results = results.filter(p =>
      p[field]?.some(s =>
        keywords.some(kw => s.toLowerCase().includes(kw.toLowerCase()))
      )
    );
  }

  return results;
}

module.exports = {
  filterProducts,
  SURFACE_GROUPS,        SURFACE_MENU_ROWS,
  UBICACION_GROUPS_GRIFERIA, UBICACION_MENU_ROWS_GRIFERIA,
  UBICACION_GROUPS_JARDIN,   UBICACION_MENU_ROWS_JARDIN,
  CATEGORY_MENU_ROWS,
};
