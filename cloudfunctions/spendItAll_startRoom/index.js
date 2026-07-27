// 云函数：startRoom
// 房主发起开始挑战
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { code } = event;
  try {
    const res = await db.collection('spendItAll_rooms').where({ code }).get();
    if (!res.data || res.data.length === 0) {
      return { ok: false, error: '房间不存在' };
    }
    const room = res.data[0];
    if (room.hostOpenid !== openid) {
      return { ok: false, error: '非房主' };
    }
    await db.collection('spendItAll_rooms').doc(room._id).update({
      data: { status: 'started', updatedAt: Date.now() }
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
