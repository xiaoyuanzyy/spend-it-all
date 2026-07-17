// 云函数：submitRoomResult
// 玩家完成消费后提交结果，检查是否全部完成，并判定胜负
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { code, amount } = event;

  try {
    const res = await db.collection('rooms').where({ code }).get();
    if (!res.data || res.data.length === 0) {
      return { ok: false, error: '房间不存在' };
    }

    const room = res.data[0];
    const players = room.players.map(p => {
      if (p.openid === openid) {
        return { ...p, amount: amount || 0 };
      }
      return p;
    });

    // 检查是否所有玩家都已提交（amount > 0）
    const allDone = players.every(p => p.amount > 0);
    const updateData = {
      players,
      updatedAt: Date.now()
    };
    if (allDone) {
      updateData.status = 'finished';

      // 判定胜负：花费最高者获胜，金额相同则都算成功
      const maxAmount = Math.max(...players.map(p => p.amount || 0));

      // 更新每个玩家的账单 success 字段
      for (const player of players) {
        const isWinner = (player.amount || 0) >= maxAmount;
        try {
          await db.collection('bills')
            .where({ openid: player.openid, mode: 'challenge' })
            .orderBy('createdAt', 'desc')
            .limit(1)
            .update({ data: { success: isWinner } });
        } catch (e) {
          console.warn('[submitRoomResult] 更新账单失败', player.openid, e.message);
        }
      }
    }

    await db.collection('rooms').doc(room._id).update({ data: updateData });

    return {
      ok: true,
      allDone,
      players: players.map(p => ({
        nickname: p.nickname,
        avatar: p.avatar,
        slot: p.slot,
        amount: p.amount,
        isHost: p.isHost,
        winner: allDone ? (p.amount || 0) >= Math.max(...players.map(x => x.amount || 0)) : undefined
      }))
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
