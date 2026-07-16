// utils/cloud.js
// 云开发调用封装
function call(fn, data = {}) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: fn,
      data,
      success: res => resolve(res.result),
      fail: err => {
        console.error(`[Cloud:${fn}] failed`, err);
        reject(err);
      }
    });
  });
}

/**
 * 将产品列表中的 cloud:// 图片文件ID 转换为临时 HTTP URL
 * 用于 CSS background-image 渲染（不支持 cloud:// 协议）
 */
async function resolveProductImages(products) {
  // 收集所有 cloud:// 协议的图片
  const cloudIds = products
    .filter(p => p.image && p.image.startsWith('cloud://'))
    .map(p => p.image);

  if (cloudIds.length === 0) return products;

  try {
    const res = await wx.cloud.getTempFileURL({ fileList: cloudIds });
    const urlMap = {};
    (res.fileList || []).forEach(f => {
      if (f.tempFileURL) urlMap[f.fileID] = f.tempFileURL;
    });

    // 替换 cloud:// 为临时 HTTP URL
    return products.map(p => ({
      ...p,
      image: urlMap[p.image] || p.image,
    }));
  } catch (e) {
    console.warn('[cloud] getTempFileURL 失败，使用占位图:', e);
    return products;
  }
}

module.exports = {
  call,
  resolveProductImages,
  // 富豪数据
  getBillionaire: () => call('getBillionaire', {}),
  // 商品列表
  getProducts: (billionaireId) => call('getProducts', { billionaireId }),
  // 保存账单
  saveBill: (payload) => call('saveBill', payload),
  // 账单列表
  getBills: () => call('getBills', {}),
  // 删除账单
  deleteBill: (billId) => call('deleteBill', { billId }),
  // 清空账单
  clearBills: () => call('clearBills', {}),
  // 房间
  createRoom: (data) => call('createRoom', data),
  joinRoom: (data) => call('joinRoom', data),
  startRoom: (data) => call('startRoom', data),
  getRoom: (data) => call('getRoom', data),
  // 资料
  saveProfile: (data) => call('saveProfile', data),
  getProfile: () => call('getProfile', {}),
  // AI 生成商品图片
  generateProductImages: (data) => call('generateProductImages', data || {}),
};
