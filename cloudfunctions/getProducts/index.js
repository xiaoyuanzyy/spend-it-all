// 云函数：getProducts
// 根据富豪ID从数据库读取标签，匹配推荐商品
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { billionaireId } = event;
  let tags = [];

  // 从数据库读取富豪匹配标签（优先 matchTags，兼容旧数据回退 tags）
  try {
    const bRes = await db.collection('billionaires').doc(String(billionaireId)).get();
    if (bRes.data) {
      tags = bRes.data.matchTags || bRes.data.tags || [];
    }
  } catch (e) {
    console.warn('读取富豪标签失败', e.message);
  }

  // 从数据库读取全部商品并匹配排序
  try {
    const res = await db.collection('products').limit(100).get();
    if (res.data && res.data.length > 0) {
      const scored = res.data.map(p => ({
        ...p,
        // 精确匹配：matchTags 与商品标签同名
        score: (p.tags || []).filter(pt => tags.includes(pt)).length
      }));

      // 80% 匹配 + 20% 不匹配
      const matched = scored.filter(p => p.score > 0);
      const unmatched = scored.filter(p => p.score === 0);

      // 按匹配分降序排列匹配商品
      matched.sort((a, b) => b.score - a.score);
      // 随机打乱不匹配商品，保证每次不重复
      unmatched.sort(() => Math.random() - 0.5);

      let list;
      if (matched.length === 0) {
        // 没有匹配商品：全部返回（数据库可能尚未更新 matchTags）
        list = unmatched;
      } else {
        // 不匹配数量 = 匹配数量 / 4（即 20%:80%）
        const unmatchCount = Math.max(1, Math.round(matched.length * 0.25));
        const pickedUnmatched = unmatched.slice(0, unmatchCount);

        // 交替插入：每 4 个匹配商品后插入 1 个不匹配商品
        list = [];
        let mi = 0, ui = 0;
        while (mi < matched.length || ui < pickedUnmatched.length) {
          for (let i = 0; i < 4 && mi < matched.length; i++, mi++) {
            list.push(matched[mi]);
          }
          if (ui < pickedUnmatched.length) {
            list.push(pickedUnmatched[ui]);
            ui++;
          }
        }
      }

      return { list };
    }
  } catch (e) {
    console.warn('products 集合不可用', e.message);
  }

  return { list: [], error: '数据库未初始化，请先调用 initDatabase' };
};
