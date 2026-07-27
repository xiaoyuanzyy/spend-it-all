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

module.exports = {
  call,
  // 富豪数据
  getBillionaire: () => call('spendItAll_getBillionaire', {}),
  // 商品列表
  getProducts: (billionaireId) => call('spendItAll_getProducts', { billionaireId }),
  // 保存账单
  saveBill: (payload) => call('spendItAll_saveBill', payload),
  // 账单列表
  getBills: () => call('spendItAll_getBills', {}),
  // 删除账单
  deleteBill: (billId) => call('spendItAll_deleteBill', { billId }),
  // 清空账单
  clearBills: () => call('spendItAll_clearBills', {}),
  // 房间
  createRoom: (data) => call('spendItAll_createRoom', data),
  joinRoom: (data) => call('spendItAll_joinRoom', data),
  startRoom: (data) => call('spendItAll_startRoom', data),
  getRoom: (data) => call('spendItAll_getRoom', data),
  submitRoomResult: (data) => call('spendItAll_submitRoomResult', data),
  // 资料
  saveProfile: (data) => call('spendItAll_saveProfile', data),
  getProfile: () => call('spendItAll_getProfile', {}),
  // 检查花名是否已被占用
  checkName: (nickname) => call('spendItAll_checkName', { nickname }),
  // 用户排行榜
  getLeaderboard: () => call('spendItAll_getLeaderboard', {}),
  // 分享账单
  saveSharedBill: (data) => call('spendItAll_saveSharedBill', data),
  getSharedBill: (shareId) => call('spendItAll_getSharedBill', { shareId }),
};
