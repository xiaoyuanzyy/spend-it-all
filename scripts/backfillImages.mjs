// 独立工具：为商品数据库中没有图片的商品补上 AI 生成图片
// 用法：
//   node backfillImages.mjs                      → 扫描所有缺图片商品并补图
//   node backfillImages.mjs --name "至尊量子计算机" → 按名称补特定商品
//   node backfillImages.mjs --id "gen_科技创新_000" → 按 ID 补特定商品
//   node backfillImages.mjs --missing-only         → 只补 image 为空的商品（默认行为）
//   node backfillImages.mjs --force                → 强制重新生成已有图片的商品
//   node backfillImages.mjs --concurrency 5        → 设置并发数（默认 3）
import cloudbase from '@cloudbase/node-sdk';
import https from 'https';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ==================== 加载 .env ====================
function loadEnv() {
  const envPath = resolve(__dirname, '.env');
  if (!existsSync(envPath)) {
    console.error('❌ 缺少 scripts/.env 文件，请先创建：');
    console.error('   复制 scripts/.env.example → scripts/.env，填入你的 SecretId 和 SecretKey');
    process.exit(1);
  }
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx >= 0) {
      process.env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
  }
}
loadEnv();

const ENV_ID = process.env.CLOUDBASE_ENV || 'cloud1-d7gtho7lwbea60e4f';
const SECRET_ID = process.env.CLOUDBASE_SECRET_ID;
const SECRET_KEY = process.env.CLOUDBASE_SECRET_KEY;

if (!SECRET_ID || !SECRET_KEY || SECRET_ID.includes('你的')) {
  console.error('❌ 请先在 scripts/.env 中配置 CLOUDBASE_SECRET_ID 和 CLOUDBASE_SECRET_KEY');
  process.exit(1);
}

// ==================== 初始化 CloudBase ====================
console.log(`🔗 连接 CloudBase 环境: ${ENV_ID}`);
const app = cloudbase.init({ env: ENV_ID, secretId: SECRET_ID, secretKey: SECRET_KEY });
const db = app.database();

// ==================== 通用工具 ====================
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== 并发控制 ====================
async function concurrentMap(items, fn, concurrency) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

// ==================== 图片下载 ====================
function downloadImage(url, maxRedirects = 3, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('图片下载重定向次数过多'));
    const req = https.get(url, {
      headers: { 'User-Agent': 'SpendItAllBackfill/1.0' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location, maxRedirects - 1, timeoutMs).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`图片下载失败 HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error(`图片下载超时（${timeoutMs / 1000}s）`)); });
  });
}

async function downloadImageWithRetry(pollinationsUrl, maxRetries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const waitMs = Math.min(5000 * Math.pow(2, attempt - 1), 20000);
        process.stdout.write(`[重试${attempt}] `);
        await delay(waitMs);
      }
      return await downloadImage(pollinationsUrl);
    } catch (e) {
      lastError = e;
      if (attempt < maxRetries) {
        process.stdout.write(`${e.message}, `);
      }
    }
  }
  throw lastError;
}

// ==================== 云存储上传 ====================
async function uploadProductImage(buffer, cloudPath) {
  const result = await app.uploadFile({ cloudPath, fileContent: buffer });
  return result.fileID;
}

// ==================== AI 图片生成 ====================
// 通用负向提示词：排除文字、水印、扭曲、低质量等干扰元素
const NEGATIVE_PROMPT = 'text, watermark, logo, words, letters, signature, label, brand name, deformed, blurry, low quality, bad anatomy, extra limbs, cropped, frame, border, collage, multiple views, abstract, illustration, painting, sketch';

// 品类视角英文提示：为 Flux 提供品类级别的视觉上下文，告诉模型"这是什么类型的东西"
// productId 格式为 gen_标签_序号，从中提取标签后匹配品类提示
const TAG_CATEGORY_HINTS = {
  '超级豪宅':   'luxury mansion exterior, architectural photography',
  '私人岛屿':   'private tropical island, aerial view, turquoise ocean',
  '城堡庄园':   'historic European castle, grand estate, vineyard chateau',
  '云端公寓':   'luxury penthouse apartment interior, skyscraper city view',
  '超级跑车':   'hypercar, luxury sports car, automotive photography',
  '经典名车':   'vintage classic car, collector automobile, retro',
  '私人飞机':   'luxury private jet, business aircraft exterior',
  '超级游艇':   'luxury mega yacht, superyacht on ocean water',
  '深海潜器':   'deep-sea submersible, personal submarine underwater',
  '西方油画':   'famous oil painting on canvas, ornate gold frame',
  '中国书画':   'Chinese calligraphy ink painting scroll, silk mounting',
  '当代艺术':   'contemporary art sculpture or installation, modern gallery',
  '古董珍玩':   'antique Chinese porcelain, bronze, jade collectible artifact',
  '传世腕表':   'luxury mechanical wristwatch, detailed dial and strap',
  '稀世珠宝':   'diamond jewelry, precious gemstone necklace or ring',
  '高级定制':   'haute couture fashion dress, runway garment on mannequin',
  '奢侈包袋':   'luxury designer handbag, leather bag purse, product shot',
  '名流礼服':   'elegant bespoke tuxedo suit, formal menswear clothing',
  '名庄红酒':   'premium red wine bottle with label, fine vintage',
  '珍稀烈酒':   'rare whiskey bottle, aged single malt scotch with glass',
  '顶级食材':   'luxury gourmet food ingredient, fine dining delicacy',
  '奢华雪茄':   'premium cigar in wooden humidor box, tobacco',
  '设计师家具': 'iconic designer furniture, chair or table, interior design',
  '私人影院':   'luxury home theater room interior, cinema screen',
  '智能机器人': 'advanced humanoid robot, AI robot on display',
  '体育俱乐部': 'professional sports team jersey, stadium, trophy',
  '赛马竞技':   'thoroughbred racehorse galloping, equestrian sport',
  '高尔夫会籍': 'premium golf course landscape, green fairway',
  '极限装备':   'extreme sports equipment gear, outdoor adventure',
  '太空旅行':   'spaceship spacecraft, space tourism, zero gravity',
  '极地探险':   'polar expedition scene, arctic ice landscape',
  '赛事包厢':   'VIP stadium luxury suite interior, premium seating',
  '数字资产':   'digital NFT art displayed on screen, crypto collectible',
  '军事藏品':   'military vehicle, vintage warplane, collectible memorabilia',
  '化石陨石':   'dinosaur fossil skeleton, meteorite rock specimen',
  '稀有书籍':   'rare antique book, leather-bound first edition',
  '乐器名琴':   'Stradivarius violin or grand piano, musical instrument',
  '电影道具':   'iconic movie prop replica, film memorabilia collectible',
  '猛禽异宠':   'exotic rare animal pet, wildlife close-up',
  '改造奇物':   'converted unique architecture, repurposed industrial structure',
  '贵金属':     'precious metal gold bullion bar, silver ingot on white',
  '名流会所':   'exclusive private members club interior, elegant lounge',
  '私人博物馆': 'modern private art museum gallery, architectural exterior',
  '私人牧场':   'luxury ranch estate landscape, vast grassland and mountains',
  '私人酒庄':   'vineyard estate, wine chateau, rolling hills with grapes',
  '古董枪支':   'antique vintage firearm, collectible engraved gun',
  '顶奢帐篷':   'luxury safari glamping tent, wilderness accommodation',
};

// 产品摄影风格：每种风格强调 isolated product shot，确保画面主体即为商品本身
const PHOTO_STYLES = [
  'isolated product shot, studio lighting, pure white background, ultra HD, sharp focus, commercial catalog',
  'isolated product shot, dramatic rim lighting, pure black background, cinematic, sharp focus, luxury showcase',
  'isolated product shot, warm golden hour light, elegant display pedestal, luxury boutique style, sharp focus',
  'isolated product shot, clean minimalist aesthetic, white marble surface, natural daylight, sharp focus',
  'isolated product shot, front angle closeup, shallow depth of field, professional product photography, sharp focus',
  'isolated product shot, 3/4 angle view, soft diffused studio lighting, premium catalog style, sharp focus',
  'isolated product shot, hero composition, reflective glass surface, professional commercial photography, sharp focus',
  'isolated product shot, centered composition, gradient studio background, e-commerce white background, sharp focus',
];

function generateImageUrl(productName, productId) {
  const styleHash = Array.from(productId).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const style = PHOTO_STYLES[styleHash % PHOTO_STYLES.length];

  // 从 productId 解析标签 → 注入品类级英文视觉上下文，让 Flux 精准理解商品类型
  // productId 格式：gen_标签名_序号（如 gen_超级跑车_000）
  const tagMatch = productId.match(/^gen_(.+)_\d{3}$/);
  const tag = tagMatch ? tagMatch[1] : '';
  const categoryHint = TAG_CATEGORY_HINTS[tag] || 'luxury product';

  // 品类上下文 → 具体商品名 → 摄影指令，三层渐进让模型严格对齐商品
  const prompt = `a photo of ${categoryHint}, specifically ${productName}, ${style}`;
  const encoded = encodeURIComponent(prompt);
  const negEncoded = encodeURIComponent(NEGATIVE_PROMPT);

  return `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&nologo=true&seed=${styleHash}&model=flux&negative=${negEncoded}&enhance=true`;
}

// ==================== 请求限流 ====================
let lastImageRequestTime = 0;
async function rateLimitDelay() {
  const now = Date.now();
  const minGap = 500;
  const wait = Math.max(0, lastImageRequestTime + minGap - now);
  if (wait > 0) await delay(wait);
  lastImageRequestTime = Date.now();
}

async function fetchAndUploadImage(productId, productName) {
  const pollinationsUrl = generateImageUrl(productName, productId);
  await rateLimitDelay();
  try {
    const imageBuffer = await downloadImageWithRetry(pollinationsUrl);
    const cloudPath = `product-images/${productName}.png`;
    return await uploadProductImage(imageBuffer, cloudPath);
  } catch (e) {
    console.warn(`\n    ⚠️ 图片生成/上传失败 [${productId}]: ${e.message}`);
    return null;
  }
}

// ==================== 数据库操作 ====================
async function readAllProducts() {
  let all = [];
  try {
    const countRes = await db.collection('products').count();
    const total = countRes.total;
    for (let offset = 0; offset < total; offset += 100) {
      const res = await db.collection('products').skip(offset).limit(100).get();
      all = all.concat(res.data || []);
    }
  } catch (e) {
    console.warn('  读取 products 失败:', e.message);
  }
  return all;
}

async function findProductsByIds(ids) {
  const idSet = new Set(ids);
  const all = await readAllProducts();
  return all.filter(p => idSet.has(p._id));
}

async function findProductsByNames(names) {
  const nameSet = new Set(names);
  const all = await readAllProducts();
  return all.filter(p => nameSet.has(p.name));
}

// ==================== 主流程 ====================
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    concurrency: 3,
    missingOnly: true,   // 默认只补缺图商品
    force: false,
    ids: [],
    names: [],
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--concurrency':
      case '-c':
        opts.concurrency = parseInt(args[++i], 10) || 3;
        break;
      case '--force':
      case '-f':
        opts.force = true;
        opts.missingOnly = false;
        break;
      case '--missing-only':
      case '-m':
        opts.missingOnly = true;
        break;
      case '--id':
        opts.ids.push(args[++i]);
        break;
      case '--name':
      case '-n':
        opts.names.push(args[++i]);
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        console.error(`未知参数: ${args[i]}`);
        printHelp();
        process.exit(1);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
  💰 Spend It All - 商品图片补全工具

  用法:
    node backfillImages.mjs [选项]

  选项:
    --name, -n <名称>    按商品名称补图（可多次使用）
    --id <ID>            按商品 _id 补图（可多次使用）
    --force, -f          强制重新生成，覆盖已有图片（默认跳过已有图片的商品）
    --missing-only, -m   仅补 image 为空的商品（默认行为）
    --concurrency, -c N  并发数（默认 3）
    --dry-run            仅列出待处理商品，不实际生成
    --help, -h           显示帮助

  示例:
    node backfillImages.mjs                              # 扫描库中所有缺图商品并补图
    node backfillImages.mjs --name "布加迪赤龙超跑旗舰版"  # 按商品名补图（直接传原名）
    node backfillImages.mjs --id "gen_超级跑车_000"       # 按 ID 指定商品
    node backfillImages.mjs -f                            # 强制重新生成所有商品图片
    node backfillImages.mjs --dry-run                     # 预览哪些商品缺图
    node backfillImages.mjs -c 5 -m                       # 5 并发 + 只补缺图
  `);
}

async function main() {
  const opts = parseArgs();

  console.log('═══════════════════════════════════════');
  console.log('  🖼️  Spend It All - 商品图片补全工具');
  console.log('═══════════════════════════════════════\n');

  // 确定目标商品列表
  let candidates;

  if (opts.ids.length > 0) {
    console.log(`🔍 按 ID 查找 ${opts.ids.length} 个商品...`);
    candidates = await findProductsByIds(opts.ids);
  } else if (opts.names.length > 0) {
    console.log(`🔍 按名称查找 ${opts.names.length} 个商品...`);
    candidates = await findProductsByNames(opts.names);
  } else {
    console.log('🔍 扫描数据库中所有商品...');
    candidates = await readAllProducts();
  }

  console.log(`  📦 数据库中共 ${candidates.length} 个候选商品`);

  // 过滤：根据模式决定处理哪些
  const needsImage = [];
  const alreadyHasImage = [];
  for (const p of candidates) {
    if (!p._id) continue;
    if (!p.image || p.image === '') {
      needsImage.push(p);
    } else {
      alreadyHasImage.push(p);
    }
  }

  console.log(`  🟢 已有图片: ${alreadyHasImage.length} 件`);
  console.log(`  🔴 缺少图片: ${needsImage.length} 件`);

  let tasks;
  if (opts.force) {
    tasks = candidates.filter(p => p._id);
    console.log(`  ⚡ --force：将重新生成全部 ${tasks.length} 件商品图片\n`);
  } else if (opts.ids.length > 0 || opts.names.length > 0) {
    // 指定商品：处理所有匹配到的（包括已有图片的也补，因为用户明确指定了）
    tasks = candidates.filter(p => p._id);
    console.log(`  🎯 指定商品模式：处理 ${tasks.length} 件（含已有图片）\n`);
  } else {
    tasks = needsImage;
    if (tasks.length === 0) {
      console.log('\n  ✨ 所有商品已有图片，无需补全！');
      return;
    }
    console.log(`  📋 将补全 ${tasks.length} 件缺图商品\n`);
  }

  if (opts.dryRun) {
    console.log('  📝 --dry-run 模式，仅列出待处理商品：');
    for (const p of tasks) {
      console.log(`     [${p._id}] ${p.name}  ${p.image ? '✅已有图' : '❌缺图'}`);
    }
    console.log(`\n  共 ${tasks.length} 件，运行时不带 --dry-run 即可执行补图。`);
    return;
  }

  // 并发生成图片 + 更新数据库
  const BATCH_SIZE = 10;
  console.log(`  🖼️  并发生成图片，并发数: ${opts.concurrency}，共 ${tasks.length} 件\n`);
  let imgDone = 0, imgSuccess = 0, imgFail = 0;

  await concurrentMap(tasks, async (p) => {
    const fileID = await fetchAndUploadImage(p._id, p.name);
    imgDone++;
    if (fileID) {
      imgSuccess++;
      try {
        await db.collection('products').doc(p._id).update({ image: fileID });
      } catch (e) {
        console.warn(`\n  ⚠️ 更新图片失败 [${p._id}]: ${e.message}`);
      }
    } else {
      imgFail++;
    }
    process.stdout.write(`\r  🖼️  进度: ${imgDone}/${tasks.length} 成功${imgSuccess} 失败${imgFail}`);
  }, opts.concurrency);
  console.log('');

  console.log('\n═══════════════════════════════════════');
  console.log('  📊 补图完成');
  console.log('═══════════════════════════════════════');
  console.log(`  处理总数:    ${tasks.length}`);
  console.log(`  图片成功:    ${imgSuccess}`);
  console.log(`  图片失败:    ${imgFail}`);
  console.log('');
}

main().catch(e => {
  console.error('❌ 运行失败:', e.message);
  console.error(e.stack);
  process.exit(1);
});
