// 云函数：saveBill
// 保存单次账单，同时确保用户 profile 存在（被邀请新用户兜底）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 计数所有账单（含已删除），确保期数永远递增不重复
  const countRes = await db.collection('spendItAll_bills')
    .where({ openid })
    .count();
  const period = countRes.total + 1;

  const data = {
    openid,
    period,
    deleted: false,
    billionaireId: event.billionaireId || 0,
    billionaireName: event.billionaireName || '富豪',
    products: event.products || [],
    total: event.total || 0,
    budget: event.budget || 0,
    over: event.over || 0,
    // success: null = 非挑战模式不适用, true/false = 挑战胜负
    success: event.success != null ? event.success : null,
    mode: event.mode || 'normal',
    createdAt: event.createdAt || Date.now()
  };
  try {
    const res = await db.collection('spendItAll_bills').add({ data });

    // 确保 profile 存在（被邀请新用户 etc. 可能因网络原因未成功创建）
    await ensureProfile(db, openid, event.nickname);

    return { ok: true, _id: res._id, period };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

// 确保用户有 profile 记录，避免排行榜缺失该用户
async function ensureProfile(db, openid, nickname) {
  try {
    const exist = await db.collection('spendItAll_profiles').where({ openid }).get();
    if (exist.data && exist.data.length > 0) return; // 已有，不覆盖

    const name = nickname || '神秘富豪';
    const avatar = getAvatarChar(name);
    await db.collection('spendItAll_profiles').add({
      data: {
        openid,
        nickname: name,
        avatar,
        vip: String(Math.floor(10000 + Math.random() * 90000)),
        role: '见习挥霍官',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    });
  } catch (e) {
    // 非关键操作，静默忽略
  }
}

// 取名字中第一个中文字符做头像，没有中文字则取第一个字符
function getAvatarChar(name) {
  if (!name) return '?';
  for (const ch of [...name]) {
    if (/[\u4e00-\u9fff]/.test(ch)) return ch;
  }
  return name[0];
}
