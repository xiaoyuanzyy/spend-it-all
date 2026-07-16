// 云函数：getBills
// 获取当前用户的所有账单
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async () => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  try {
    const res = await db.collection('bills')
      .where({ openid, deleted: _.neq(true) })
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();
    return { list: res.data };
  } catch (e) {
    return { list: [], error: e.message };
  }
};
