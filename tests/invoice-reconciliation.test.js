const test = require('node:test');
const assert = require('node:assert/strict');

const pricing = require('../lib/pricing');
const invoice = require('../lib/invoice');
const reports = require('../lib/reports');

test('checkout uses HSN slab and discounts subtotal before GST', () => {
  const items = [{
    id: 1,
    name: 'Rice',
    sku: 'RICE-1',
    hsn: '1006',
    price: 100,
    qty: 1
  }];

  assert.deepEqual(pricing.computeTotals(items, 'WELCOME'), {
    subtotal: 100,
    discount: 5,
    taxable: 95,
    tax: 4.75,
    cgst: 2.38,
    sgst: 2.37,
    total: 99.75,
    lines: [{
      id: 1,
      name: 'Rice',
      hsn: '1006',
      gstPercent: 5,
      gross: 100,
      discount: 5,
      taxable: 95,
      tax: 4.75,
      net: 99.75
    }]
  });
});

test('invoice uses the checkout HSN slab and discounts subtotal before GST', () => {
  const order = {
    id: 1001,
    items: [{ name: 'Rice', sku: 'RICE-1', hsn: '1006', price: 100, qty: 1 }],
    coupon: 'WELCOME',
    total: 99.75
  };

  assert.deepEqual(invoice.computeInvoiceFigures(order), {
    subtotal: 100,
    discount: 5,
    tax: 4.75,
    cgst: 2.38,
    sgst: 2.37,
    total: 99.75,
    rows: [{
      name: 'Rice',
      sku: 'RICE-1',
      hsn: '1006',
      qty: 1,
      price: 100,
      gstPercent: 5,
      line: 100,
      lineTax: 4.75
    }]
  });
});

test('rendered invoice shows the HSN GST split and matches an HSN-only order ledger', () => {
  const items = [{
    id: 1,
    name: 'Rice',
    sku: 'RICE-1',
    hsn: '1006',
    price: 100,
    qty: 1
  }];
  const billed = pricing.computeTotals(items, '');
  const order = {
    id: 1002,
    date: '2026-11-21',
    customer: 'Walk-in',
    items,
    subtotal: billed.subtotal,
    discount: billed.discount,
    tax: billed.tax,
    total: billed.total
  };

  const figures = invoice.computeInvoiceFigures(order);
  assert.equal(billed.tax, 5);
  assert.equal(billed.cgst, 2.5);
  assert.equal(billed.sgst, 2.5);
  assert.equal(billed.total, 105);
  assert.equal(figures.tax, 5);
  assert.equal(figures.cgst, 2.5);
  assert.equal(figures.sgst, 2.5);
  assert.equal(figures.total, 105);

  const html = invoice.render(order);
  assert.match(html, /<td class="r">5%<\/td><td class="r">₹5\.00<\/td>/);
  assert.match(html, /CGST \+ SGST \(Total GST\)<\/td><td class="r">₹5\.00/);
  assert.match(html, /Invoice Total<\/td><td class="r">₹105\.00/);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
});

test('invoice respects the SAVE10 discount cap and HSN GST slab', () => {
  const order = {
    id: 1004,
    items: [{ name: 'Groundnut Oil', sku: 'OIL-002', hsn: '1508', price: 1120, qty: 2 }],
    coupon: 'SAVE10',
    total: 2194.5
  };

  assert.deepEqual(invoice.computeInvoiceFigures(order), {
    subtotal: 2240,
    discount: 150,
    tax: 104.5,
    cgst: 52.25,
    sgst: 52.25,
    total: 2194.5,
    rows: [{
      name: 'Groundnut Oil',
      sku: 'OIL-002',
      hsn: '1508',
      qty: 2,
      price: 1120,
      gstPercent: 5,
      line: 2240,
      lineTax: 104.5
    }]
  });
});

test('GST reconciliation reports orders as matched when invoice and checkout agree', () => {
  const db = {
    orders: [{
      id: 1001,
      date: '2026-11-21',
      customer: 'Walk-in',
      coupon: 'WELCOME',
      items: [{ name: 'Rice', sku: 'RICE-1', hsn: '1006', price: 100, qty: 1 }],
      subtotal: 100,
      discount: 5,
      tax: 4.75,
      total: 99.75
    }],
    customers: [],
    products: []
  };

  const result = reports.getGstReconciliation(db);
  assert.equal(result.totalChecked, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.totalDelta, 0);
  assert.deepEqual(result.rows[0], {
    orderId: 1001,
    date: '2026-11-21',
    customer: 'Walk-in',
    coupon: 'WELCOME',
    ledgerSubtotal: 100,
    ledgerDiscount: 5,
    ledgerTax: 4.75,
    ledgerTotal: 99.75,
    invoiceDiscount: 5,
    invoiceTax: 4.75,
    invoiceTotal: 99.75,
    delta: 0,
    matched: true
  });
});
