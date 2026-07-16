// 云函数：getRoom
// 获取房间当前状态
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { code } = event;
  try {
    const res = await db.collection('rooms').where({ code }).get();
    if (!res.data || res.data.length === 0) {
      return { ok: false, error: '房间不存在' };
    }
    const room = res.data[0];
    return {
      ok: true,
      code: room.code,
      status: room.status,
      players: room.players,
      hostOpenid: room.hostOpenid
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
