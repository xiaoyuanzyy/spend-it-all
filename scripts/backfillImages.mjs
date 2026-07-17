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

const ENV_ID = process.env.CLOUDBASE_ENV || 'cloud1-d2g5khfkv2a660d00';
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
const PHOTO_STYLES = [
  'studio lighting, white background, 8K ultra HD, high quality',
  'dramatic rim lighting, dark moody background, cinematic, 8K',
  'warm golden hour light, elegant display case, luxury boutique, 8K',
  'clean minimalist aesthetic, marble surface, natural daylight, 8K',
  'front angle closeup, shallow depth of field, product photography, 8K',
  'isometric 3/4 view, soft diffused lighting, premium catalog style, 8K',
  'hero shot composition, reflective surface, professional commercial, 8K',
  'editorial magazine style, creative angle, high contrast, 8K',
];

// 奢侈品前缀词池（与 syncBillionaires.mjs 中 LUXURY_PREFIX 一致）
const LUXURY_PREFIX = [
  '限量版', '定制款', '至尊', '皇家', '奢华', '私人',
  '大师级', '传世', '典藏', '御用', '传奇', '至臻',
  '非凡', '瑰丽', '绝世', '巅峰', '璀璨', '荣耀', '殿堂', '经典',
];

// 常见装饰性后缀（删除后不影响核心语义）
const DECORATIVE_SUFFIXES = [
  '套装', '全套', '年卡', '体验', '服务', '课程', '通票',
  '份额', '合约', '会员', '版权', '特权', '席位', '座位',
  '方案', '授权', '认证', '资格', '命名权', '冠名权',
];

// 去前缀 + 去后缀 = 纯核心名词
function extractCoreSubject(productName) {
  let core = productName;
  // 1. 去前缀（如"钛合金"→去掉）
  for (const prefix of LUXURY_PREFIX) {
    if (core.startsWith(prefix) && core.length > prefix.length) {
      core = core.slice(prefix.length);
      break;
    }
  }
  // 2. 去后缀（如"...套装"→去掉），只去一次，避免过度裁剪
  for (const suffix of DECORATIVE_SUFFIXES) {
    if (core.endsWith(suffix) && core.length > suffix.length) {
      core = core.slice(0, -suffix.length);
      break;
    }
  }
  return core;
}

function generateImageUrl(productName, productId) {
  const styleHash = Array.from(productId).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const style = PHOTO_STYLES[styleHash % PHOTO_STYLES.length];
  const core = extractCoreSubject(productName);
  // 不使用引号包裹，直接描述：这是某个商品的商业摄影
  const prompt = `${core}, commercial product photography, ${style}`;
  const encoded = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&nologo=true&seed=${styleHash}&model=flux`;
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
    node backfillImages.mjs                          # 扫描库中所有缺图商品并补图
    node backfillImages.mjs --name "至尊量子计算机"    # 只补指定商品
    node backfillImages.mjs --id "gen_科技创新_000"    # 按 ID 指定商品
    node backfillImages.mjs -f                        # 强制重新生成所有商品图片
    node backfillImages.mjs --dry-run                 # 预览哪些商品缺图
    node backfillImages.mjs -c 5 -m                   # 5 并发 + 只补缺图
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
