// 云函数：getBillionaire
// 从数据库读取富豪列表
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  try {
    const res = await db.collection('billionaires').limit(50).get();
    if (res.data && res.data.length > 0) {
      return { list: res.data };
    }
  } catch (e) {
    console.warn('billionaires 集合不可用', e.message);
  }
  return { list: [], error: '数据库未初始化，请先调用 initDatabase' };
};
