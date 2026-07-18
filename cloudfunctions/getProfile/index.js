// 云函数：getProfile
// 获取当前用户档案
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  try {
    const res = await db.collection('profiles').where({ openid }).get();
    if (res.data && res.data.length > 0) {
      return { ok: true, profile: res.data[0] };
    }
    // 新用户：返回 isNew 标记
    return { ok: true, profile: null, isNew: true };
  } catch (e) {
    return { ok: true, profile: null, isNew: true };
  }
};
