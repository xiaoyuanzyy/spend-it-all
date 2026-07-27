// 云函数：saveProfile
// 保存/更新用户档案
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 只更新实际传入的字段，未传入的字段不覆盖（避免改名时重置等级等）
  const data = { updatedAt: Date.now() };
  if (event.nickname != null) data.nickname = event.nickname;
  if (event.avatar != null) data.avatar = event.avatar;
  if (event.vip != null) data.vip = event.vip;
  if (event.role != null) data.role = event.role;

  try {
    const exist = await db.collection('spendItAll_profiles').where({ openid }).get();
    if (exist.data && exist.data.length > 0) {
      await db.collection('spendItAll_profiles').doc(exist.data[0]._id).update({ data });
      return { ok: true, _id: exist.data[0]._id };
    } else {
      // 新建时补全必填默认值
      const createData = {
        openid,
        nickname: event.nickname || '神秘富豪',
        avatar: event.avatar || '秘',
        vip: event.vip || String(Math.floor(10000 + Math.random() * 90000)),
        role: event.role || '见习挥霍官',
        ...data,
        createdAt: Date.now()
      };
      const res = await db.collection('spendItAll_profiles').add({ data: createData });
      return { ok: true, _id: res._id };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
