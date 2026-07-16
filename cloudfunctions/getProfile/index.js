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
    // 兜底返回
    return {
      ok: true,
      profile: {
        openid,
        nickname: '富一代·布莱恩',
        avatar: '布',
        vip: '0000420',
        role: '首席挥霍官'
      }
    };
  } catch (e) {
    return {
      ok: true,
      profile: {
        openid,
        nickname: '富一代·布莱恩',
        avatar: '布',
        vip: '0000420',
        role: '首席挥霍官'
      }
    };
  }
};
