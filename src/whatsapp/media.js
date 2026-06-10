'use strict';

const path = require('path');
const root = p => path.join(__dirname, '..', '..', p);

const allProducts = [
  ...require(root('catalogo.json')),
  ...require(root('catalogo-griferia.json')),
  ...require(root('catalogo-jardin.json')),
];

function getProductById(id) {
  return allProducts.find(p => String(p.id) === String(id)) || null;
}

function getAllProducts() {
  return allProducts;
}

module.exports = { getProductById, getAllProducts };
