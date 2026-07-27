// 云函数：checkName
// 检查花名是否已被占用
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const nickname = event.nickname;
  if (!nickname) return { ok: false, error: '缺少 nickname 参数' };
  try {
    const res = await db.collection('spendItAll_profiles').where({ nickname }).get();
    return { ok: true, exists: res.data && res.data.length > 0 };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
