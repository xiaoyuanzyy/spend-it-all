// 云函数：saveSharedBill
// 保存分享账单到共享库
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { total, budget, billionaire, products, mode, success } = event;
  try {
    const res = await db.collection('sharedBills').add({
      data: {
        total: total || 0,
        budget: budget || 0,
        billionaire: billionaire || {},
        products: products || [],
        mode: mode || 'normal',
        success: success || false,
        createdAt: Date.now()
      }
    });
    return { ok: true, _id: res._id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
