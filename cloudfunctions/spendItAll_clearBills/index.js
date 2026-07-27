// 云函数：clearBills
// 清空当前用户的所有账单
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async () => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  try {
    const res = await db.collection('spendItAll_bills').where({ openid }).get();
    const tasks = res.data.map(doc => db.collection('spendItAll_bills').doc(doc._id).update({ data: { deleted: true } }));
    await Promise.all(tasks);
    return { ok: true, removed: res.data.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
