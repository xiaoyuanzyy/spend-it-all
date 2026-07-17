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
  const sign = num < 0 ? '-' : '';
  return sign + '$' + Math.floor(Math.abs(num)).toLocaleString('en-US');
}

// 外国人名取"·"最后一段展示："埃隆·马斯克" → "马斯克"；中文名保持不变
function shortName(name) {
  if (!name) return name;
  const parts = name.split('·');
  return parts[parts.length - 1];
}

module.exports = {
  formatMoney,
  formatM,
  formatFull,
  formatCNY,
  formatK,
  today,
  shortName
};
