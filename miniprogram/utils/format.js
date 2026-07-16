// utils/format.js
// 金额格式化
function formatMoney(num) {
  if (num === null || num === undefined) return '0';
  if (Math.abs(num) >= 1e9) {
    return '$' + (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  }
  if (Math.abs(num) >= 1e6) {
    return '$' + (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (Math.abs(num) >= 1e3) {
    return '$' + (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return '$' + num.toLocaleString('en-US');
}

function formatCNY(num) {
  if (num === null || num === undefined) return '¥0';
  return '¥' + num.toLocaleString('en-US');
}

function formatK(num) {
  if (num === null || num === undefined) return '0';
  if (Math.abs(num) >= 1e3) {
    return Math.round(num / 1e3) + 'K';
  }
  return num.toString();
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatM(num) {
  if (num === null || num === undefined) return '$0M';
  return '$' + (num / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
}

function formatFull(num) {
  if (num === null || num === undefined) return '$0';
  return '$' + Math.floor(num).toLocaleString('en-US');
}

module.exports = {
  formatMoney,
  formatM,
  formatFull,
  formatCNY,
  formatK,
  today
};
