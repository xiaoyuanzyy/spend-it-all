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
  submitRoomResult: (data) => call('submitRoomResult', data),
  // 资料
  saveProfile: (data) => call('saveProfile', data),
  getProfile: () => call('getProfile', {}),
  // 检查花名是否已被占用
  checkName: (nickname) => call('checkName', { nickname }),
  // 用户排行榜
  getLeaderboard: () => call('getLeaderboard', {}),
  // 分享账单
  saveSharedBill: (data) => call('saveSharedBill', data),
  getSharedBill: (shareId) => call('getSharedBill', { shareId }),
};
