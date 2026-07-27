// 云函数：getSharedBill
// 获取他人分享的账单（绕过前端数据库权限限制）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { shareId } = event;
  if (!shareId) return { ok: false, error: '缺少 shareId' };
  try {
    const res = await db.collection('spendItAll_sharedBills').doc(shareId).get();
    if (!res.data) return { ok: false, error: '账单不存在' };
    return { ok: true, data: res.data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
