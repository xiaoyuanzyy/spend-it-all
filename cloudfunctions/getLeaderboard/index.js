// 云函数：getLeaderboard
// 返回全量用户排行，按勋章数排序
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 根据勋章数计算等级（与前端 profile.js 保持一致）
function calcRole(badges) {
  if (badges >= 50) return '挥霍之神';
  if (badges >= 30) return '传奇挥霍官';
  if (badges >= 15) return '首席挥霍官';
  if (badges >= 7) return '资深挥霍官';
  if (badges >= 2) return '初级挥霍官';
  return '见习挥霍官';
}

// 更新/读取霸榜记录
async function syncReign(champion) {
  const reignsCol = db.collection('reigns');
  const { data: current } = await reignsCol.doc('current').get().catch(() => ({ data: null }));
  const now = new Date().toISOString();
  if (!current) {
    // 首次：创建霸榜记录
    await reignsCol.add({
      data: { _id: 'current', openid: champion.openid, nickname: champion.nickname, avatar: champion.avatar, startedAt: now }
    }).catch(() => {});
    return now;
  }
  if (current.openid !== champion.openid) {
    // 易主：更新记录
    await reignsCol.doc('current').update({
      data: { openid: champion.openid, nickname: champion.nickname, avatar: champion.avatar, startedAt: now }
    }).catch(() => {});
    return now;
  }
  // 未变：维持原时间
  return current.startedAt || now;
}

// 分页拉取全量（必须 orderBy 保证分页一致性）
async function fetchAll(collection, where = {}, limit = 100) {
  let all = [];
  let offset = 0;
  while (true) {
    const res = await collection.where(where).orderBy('_id', 'asc').skip(offset).limit(limit).get();
    all = all.concat(res.data);
    if (res.data.length < limit) break;
    offset += limit;
  }
  return all;
}

exports.main = async () => {
  try {
    // 拉取所有 profile 和 bills
    const profiles = await fetchAll(db.collection('profiles'));
    const bills = await fetchAll(db.collection('bills'), { deleted: _.neq(true) });

    // 按 openid 聚合账单
    const billMap = {};
    for (const b of bills) {
      if (!billMap[b.openid]) {
        billMap[b.openid] = { count: 0, conquered: 0, challengeWins: 0 };
      }
      billMap[b.openid].count++;
      if ((b.total || 0) >= (b.budget || 1)) billMap[b.openid].conquered++;
      if (b.mode === 'challenge' && b.success) billMap[b.openid].challengeWins++;
    }

    // 组合排行列表：profiles 为主，补上没有 profile 但有账单的用户
    const profileOpenids = new Set(profiles.map(p => p.openid));

    const list = profiles.map(p => {
      const stats = billMap[p.openid] || { count: 0, conquered: 0, challengeWins: 0 };
      const badges = stats.conquered + stats.challengeWins;
      return {
        openid: p.openid,
        nickname: p.nickname || '神秘富豪',
        avatar: p.avatar || '秘',
        role: p.role || '见习挥霍官',
        billCount: stats.count,
        conquered: stats.conquered,
        badges,
        score: badges
      };
    });

    // 补全：有账单但无 profile 的用户（兜底）
    for (const openid of Object.keys(billMap)) {
      if (!profileOpenids.has(openid)) {
        const stats = billMap[openid];
        const badges = stats.conquered + stats.challengeWins;
        list.push({
          openid,
          nickname: '神秘富豪',
          avatar: '秘',
          role: calcRole(badges),
          billCount: stats.count,
          conquered: stats.conquered,
          badges,
          score: badges
        });
      }
    }

    // 按 score 降序排列
    list.sort((a, b) => b.score - a.score);

    // 霸榜记录：同步第一名登顶时间
    let reignStart = null;
    if (list.length > 0) {
      reignStart = await syncReign(list[0]);
    }

    return { ok: true, list, reignStart };
  } catch (e) {
    return { ok: false, list: [], error: e.message };
  }
};
