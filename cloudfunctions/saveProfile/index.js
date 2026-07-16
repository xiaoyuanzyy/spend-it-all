// 云函数：saveProfile
// 保存/更新用户档案
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const data = {
    openid,
    nickname: event.nickname || '富一代·布莱恩',
    avatar: event.avatar || '',
    vip: event.vip || String(Math.floor(10000 + Math.random() * 90000)),
    role: event.role || '首席挥霍官',
    updatedAt: Date.now()
  };
  try {
    const exist = await db.collection('profiles').where({ openid }).get();
    if (exist.data && exist.data.length > 0) {
      await db.collection('profiles').doc(exist.data[0]._id).update({ data });
      return { ok: true, _id: exist.data[0]._id };
    } else {
      const res = await db.collection('profiles').add({ data: { ...data, createdAt: Date.now() } });
      return { ok: true, _id: res._id };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
