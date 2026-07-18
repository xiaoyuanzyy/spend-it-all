// 云函数：createRoom
// 创建对战房间
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function genCode() {
  return 'BTL-' + Math.floor(1000 + Math.random() * 9000);
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const code = genCode();
  const data = {
    code,
    status: 'waiting', // waiting | started | finished
    hostOpenid: openid,
    billionaire: event.billionaire || null, // 房主的富豪信息，所有玩家共享
    players: [
      {
        openid,
        nickname: (event.host && event.host.nickname) || '玩家',
        avatar: (event.host && event.host.avatar) || '',
        isHost: true,
        slot: 'P1'
        // amount 初始不设置，由 submitRoomResult 提交时填充
      }
    ],
    submittedCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  try {
    await db.collection('rooms').add({ data });
    return { code };
  } catch (e) {
    return { code, fallback: true, error: e.message };
  }
};
