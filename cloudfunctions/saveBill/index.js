// 云函数：saveBill
// 保存单次账单
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 计数所有账单（含已删除），确保期数永远递增不重复
  const countRes = await db.collection('bills')
    .where({ openid })
    .count();
  const period = countRes.total + 1;

  const data = {
    openid,
    period,
    deleted: false,
    billionaireId: event.billionaireId || 0,
    billionaireName: event.billionaireName || '富豪',
    products: event.products || [],
    total: event.total || 0,
    budget: event.budget || 0,
    over: event.over || 0,
    success: !!event.success,
    mode: event.mode || 'normal',
    createdAt: event.createdAt || Date.now()
  };
  try {
    const res = await db.collection('bills').add({ data });
    return { ok: true, _id: res._id, period };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
