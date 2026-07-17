// 云函数：feedback
// 留言提交 & 留言列表
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { action, nickname, content } = event;

  try {
    if (action === 'submit') {
      if (!content || !content.trim()) {
        return { ok: false, error: '留言内容不能为空' };
      }
      const data = {
        openid,
        nickname: (nickname || '匿名用户').slice(0, 20),
        content: content.trim().slice(0, 500),
        createdAt: Date.now()
      };
      console.log('[feedback] 准备写入留言:', JSON.stringify(data));
      const res = await db.collection('feedbacks').add({ data });
      console.log('[feedback] 写入成功, _id:', res._id);
      return { ok: true, _id: res._id };
    }

    if (action === 'list') {
      const res = await db.collection('feedbacks')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();
      return { ok: true, list: res.data || [] };
    }

    return { ok: false, error: '未知操作' };
  } catch (e) {
    console.error('[feedback] 云函数异常:', e);
    return { ok: false, error: e.message || '服务器错误' };
  }
};
