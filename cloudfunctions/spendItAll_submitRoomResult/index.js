// 云函数：submitRoomResult
// 玩家完成消费后提交结果。使用 submittedCount 原子递增避免竞态。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { code, amount, nickname } = event;

  try {
    const res = await db.collection('spendItAll_rooms').where({ code }).get();
    if (!res.data || res.data.length === 0) {
      return { ok: false, error: '房间不存在' };
    }

    const room = res.data[0];
    const playerIndex = room.players.findIndex(p => p.openid === openid);
    if (playerIndex === -1) {
      return { ok: false, error: '你不在房间中' };
    }

    // 幂等：已提交过则直接返回当前状态
    if (room.players[playerIndex].amount != null) {
      const resolved = room.status === 'finished';
      const maxAmount = resolved ? Math.max(...room.players.map(p => p.amount || 0)) : 0;
      return {
        ok: true,
        allDone: resolved,
        players: room.players.map(p => ({
          openid: p.openid,
          nickname: p.nickname,
          avatar: p.avatar,
          slot: p.slot,
          amount: p.amount,
          isHost: p.isHost,
          winner: resolved ? (p.amount || 0) >= maxAmount : undefined
        }))
      };
    }

    // 原子更新：只更新当前玩家的字段 + 递增 submittedCount（防止并行覆写）
    const updateData = {
      [`players.${playerIndex}.amount`]: amount || 0,
      submittedCount: _.inc(1),
      updatedAt: Date.now()
    };
    // 同步最新花名
    if (nickname) {
      updateData[`players.${playerIndex}.nickname`] = nickname;
    }

    await db.collection('spendItAll_rooms').doc(room._id).update({ data: updateData });

    // 重新读取最新数据（避免并行写入时读到旧快照）
    const refreshed = await db.collection('spendItAll_rooms').doc(room._id).get();
    const finalRoom = refreshed.data;
    const finalPlayers = finalRoom.players;
    const submittedCount = finalRoom.submittedCount || 0;
    const allDone = submittedCount >= finalPlayers.length;

    // 全部提交且尚未标记完成 → 判定胜负
    if (allDone && finalRoom.status !== 'finished') {
      const allAmounts = finalPlayers.map(p => p.amount || 0);
      const maxAmount = Math.max(...allAmounts);

      await db.collection('spendItAll_rooms').doc(room._id).update({
        data: { status: 'finished', updatedAt: Date.now() }
      });

      // 更新每个玩家账单的 success 字段
      for (const player of finalPlayers) {
        const isWinner = (player.amount || 0) >= maxAmount;
        try {
          await db.collection('spendItAll_bills')
            .where({ openid: player.openid, mode: 'challenge' })
            .orderBy('createdAt', 'desc')
            .limit(1)
            .update({ data: { success: isWinner } });
        } catch (e) {
          console.warn('[submitRoomResult] 更新账单失败', player.openid, e.message);
        }
      }
    }

    const resolved = allDone || finalRoom.status === 'finished';
    const maxAmount = resolved ? Math.max(...finalPlayers.map(p => p.amount || 0)) : 0;

    return {
      ok: true,
      allDone: resolved,
      players: finalPlayers.map(p => ({
        openid: p.openid,
        nickname: p.nickname,
        avatar: p.avatar,
        slot: p.slot,
        amount: p.amount,
        isHost: p.isHost,
        winner: resolved ? (p.amount || 0) >= maxAmount : undefined
      }))
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
