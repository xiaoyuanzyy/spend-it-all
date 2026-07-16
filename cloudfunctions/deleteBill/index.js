// 云函数：deleteBill
// 删除单条账单（仅本人）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { billId } = event;
  if (!billId) return { ok: false, error: 'billId required' };
  try {
    // 校验所属
    const bill = await db.collection('bills').doc(billId).get();
    if (bill.data && bill.data.openid !== openid) {
      return { ok: false, error: '无权限' };
    }
    // 软删除：标记为不可见
    await db.collection('bills').doc(billId).update({ data: { deleted: true } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
