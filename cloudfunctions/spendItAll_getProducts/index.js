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
    const bRes = await db.collection('spendItAll_billionaires').doc(billionaireId).get();
    if (bRes.data) {
      tags = (bRes.data.matchTags && bRes.data.matchTags.length) ? bRes.data.matchTags : (bRes.data.tags || []);
    }
    console.log('[getProducts] billionaireId:', billionaireId, 'tags:', JSON.stringify(tags));
  } catch (e) {
    console.warn('[getProducts] 读取富豪标签失败', billionaireId, e.message);
  }

  // 从数据库读取全部商品并匹配排序
  try {
    // 分页读取全部商品（商品池已扩展至数千件）
    const countRes = await db.collection('spendItAll_products').count();
    const total = countRes.total;
    let allProducts = [];
    const pageSize = 100;
    for (let offset = 0; offset < total; offset += pageSize) {
      const page = await db.collection('spendItAll_products').skip(offset).limit(pageSize).get();
      allProducts = allProducts.concat(page.data || []);
    }
    const res = { data: allProducts };
    if (res.data && res.data.length > 0) {
      const scored = res.data.map(p => ({
        ...p,
        // 精确匹配：matchTags 与商品标签同名
        score: (p.tags || []).filter(pt => tags.includes(pt)).length
      }));

      // 9:1 比例：匹配商品上限 90 件，不匹配 = 匹配 / 9
      const MAX_MATCHED = 90;

      const matched = scored.filter(p => p.score > 0);
      const unmatched = scored.filter(p => p.score === 0);

      console.log('[getProducts] 匹配池:', matched.length, '不匹配池:', unmatched.length);

      // Fisher-Yates 随机打乱
      const shuffle = (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      };

      shuffle(matched);
      shuffle(unmatched);

      // 从匹配商品中随机取，上限 90 件
      const pickCount = Math.min(MAX_MATCHED, matched.length);
      const pickedMatched = matched.slice(0, pickCount);

      let list;
      if (pickedMatched.length === 0) {
        // 无匹配商品时兜底
        list = unmatched.slice(0, Math.min(100, unmatched.length));
        console.log('[getProducts] 无匹配商品，兜底返回', list.length, '件不匹配商品');
      } else {
        // 按 9:1 比例取不匹配商品
        const unmatchCount = Math.round(pickedMatched.length / 9);
        const pickedUnmatched = unmatched.slice(0, unmatchCount);

        // 合并后随机打乱
        list = [...pickedMatched, ...pickedUnmatched];
        shuffle(list);
        console.log('[getProducts] 匹配:', pickedMatched.length, '不匹配:', pickedUnmatched.length, '总计:', list.length);
      }

      return { list };
    }
  } catch (e) {
    console.warn('spendItAll_products 集合不可用', e.message);
  }

  return { list: [], error: '数据库未初始化，请先调用 initDatabase' };
};
