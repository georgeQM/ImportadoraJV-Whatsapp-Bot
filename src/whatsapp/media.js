'use strict';

const path = require('path');
const products = require(path.join(__dirname, '..', '..', 'productos.json'));

function getProductById(id) {
  return products.find(p => p.id.toString() === id.toString());
}

function getAllProducts() {
  return products;
}

module.exports = { getProductById, getAllProducts };
