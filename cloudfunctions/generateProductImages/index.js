// 云函数：generateProductImages
// 使用 AI 生成商品图片 → 上传微信云存储 → 更新数据库
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ==================== AI 提示词生成 ====================
// 将商品名 + 标签组合成英文提示词，提升 AI 出图质量
function buildPrompt(product) {
  const tagMap = {
    '宠物': 'luxury pet accessory',
    '奢华': 'luxurious, premium quality',
    '炫富': 'opulent, extravagant display',
    '日用品': 'premium daily essential',
    '地产': 'luxury real estate',
    '科技': 'high-tech, futuristic',
    '太空': 'space exploration',
    '珠宝': 'fine jewelry, precious gems',
    '汽车': 'luxury automobile',
    '旅行': 'exotic travel destination',
    '美食': 'gourmet cuisine, fine dining',
    '艺术': 'fine art masterpiece',
    '收藏': 'collectible, museum quality',
    '时尚': 'high fashion, designer',
    '家居': 'luxury home decor',
    '健康': 'wellness, premium health',
    '金融': 'wealth management, investment',
    '运动': 'premium sports equipment',
    '名酒': 'rare vintage collection',
    '影视': 'home cinema, entertainment',
    '音乐': 'luxury audio, concert hall',
    '教育': 'elite education',
    '游艇': 'luxury yacht',
  };

  const tagsEn = (product.tags || [])
    .map(t => tagMap[t] || t)
    .join(', ');

  return `A professional product photography shot of ${product.name}, ${tagsEn}, studio lighting, white background, 8K resolution, ultra detailed, commercial photography style`;
}

// ==================== AI 图片生成（Pollinations.ai） ====================
async function generateImage(prompt) {
  const https = require('https');
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true&model=flux&seed=${Math.floor(Math.random() * 10000)}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('AI 生成超时')), 25000);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        clearTimeout(timeout);
        reject(new Error(`AI API 返回 ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks));
      });
      res.on('error', (e) => {
        clearTimeout(timeout);
        reject(e);
      });
    }).on('error', (e) => {
      clearTimeout(timeout);
      reject(e);
    });
  });
}

// ==================== 上传至微信云存储 ====================
async function uploadToCloud(productId, imageBuffer) {
  const cloudPath = `product-images/${productId}.png`;
  const result = await cloud.uploadFile({
    cloudPath,
    fileContent: imageBuffer,
  });
  return result.fileID;
}

// ==================== 处理单个商品 ====================
async function processOne(product) {
  const pid = product._id;
  console.log(`[generateProductImages] 开始处理 ${pid} - ${product.name}`);

  // 1. 生成提示词 & AI 出图
  const prompt = buildPrompt(product);
  console.log(`  提示词: ${prompt.substring(0, 80)}...`);
  const imageBuffer = await generateImage(prompt);
  console.log(`  图片已生成, 大小: ${(imageBuffer.length / 1024).toFixed(1)} KB`);

  // 2. 上传云存储
  const fileID = await uploadToCloud(pid, imageBuffer);
  console.log(`  已上传云存储: ${fileID}`);

  // 3. 更新数据库
  await db.collection('products').doc(pid).update({
    data: { image: fileID },
  });
  console.log(`  数据库已更新`);

  return { productId: pid, name: product.name, fileID, success: true };
}

// ==================== 云函数入口 ====================
exports.main = async (event) => {
  const { productId, batch, limit = 3 } = event || {};

  try {
    let products = [];

    if (productId) {
      // 模式1：指定单个商品
      const res = await db.collection('products').doc(String(productId)).get();
      if (res.data) products = [res.data];
    } else if (batch) {
      // 模式2：批量处理无图片的商品
      const res = await db.collection('products')
        .where({ image: '' })
        .limit(Math.min(limit, 5))
        .get();
      products = res.data || [];
    } else {
      // 默认：处理第一个无图片的商品
      const res = await db.collection('products')
        .where({ image: '' })
        .limit(1)
        .get();
      products = res.data || [];
    }

    if (products.length === 0) {
      // 检查是否全部完成
      const total = await db.collection('products').count();
      const withImage = await db.collection('products')
        .where({ image: db.command.neq('') })
        .count();
      return {
        success: true,
        message: '所有商品已完成！',
        total: total.total,
        completed: withImage.total,
        remaining: 0,
        results: [],
      };
    }

    const results = [];
    for (const p of products) {
      try {
        const r = await processOne(p);
        results.push(r);
      } catch (e) {
        console.error(`[generateProductImages] ${p._id} 失败:`, e.message);
        results.push({
          productId: p._id,
          name: p.name,
          error: e.message,
          success: false,
        });
      }
    }

    // 统计剩余
    const withImage = await db.collection('products')
      .where({ image: db.command.neq('') })
      .count();
    const total = await db.collection('products').count();

    return {
      success: true,
      processed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      total: total.total,
      completed: withImage.total,
      remaining: total.total - withImage.total,
      results,
    };
  } catch (e) {
    console.error('[generateProductImages] 异常:', e);
    return { success: false, error: e.message };
  }
};
