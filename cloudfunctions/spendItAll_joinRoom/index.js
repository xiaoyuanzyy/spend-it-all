// 云函数：joinRoom
// 加入对战房间
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { code, player } = event;
  try {
    const res = await db.collection('spendItAll_rooms').where({ code }).get();
    if (!res.data || res.data.length === 0) {
      return { ok: false, error: '房间不存在' };
    }
    const room = res.data[0];
    if (room.status !== 'waiting') {
      return { ok: false, error: '房间已开始' };
    }
    if (room.players.length >= 4) {
      return { ok: false, error: '房间已满' };
    }
    if (room.players.some(p => p.openid === openid)) {
      return { ok: true, already: true };
    }
    const slot = 'P' + (room.players.length + 1);
    const newPlayer = {
      openid,
      nickname: (player && player.nickname) || '玩家',
      avatar: (player && player.avatar) || '',
      isHost: false,
      slot
      // amount 初始不设置，由 submitRoomResult 提交时填充
    };
    const players = room.players.concat([newPlayer]);
    await db.collection('spendItAll_rooms').doc(room._id).update({
      data: { players, updatedAt: Date.now() }
    });
    return { ok: true, code, slot };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
