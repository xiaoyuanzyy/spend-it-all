// 本地脚本：拉取 Forbes 前 100 富豪 → 写入 CloudBase 数据库
// 用途：云函数访问 Wikipedia 可能受限，本地网络不受限，用这个脚本直写数据库
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
    console.error('   获取密钥：https://console.cloud.tencent.com/cam/capi');
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
  console.error('   获取地址：https://console.cloud.tencent.com/cam/capi');
  process.exit(1);
}

// ==================== 初始化 CloudBase ====================
console.log(`🔗 连接 CloudBase 环境: ${ENV_ID}`);
const app = cloudbase.init({ env: ENV_ID, secretId: SECRET_ID, secretKey: SECRET_KEY });
const db = app.database();

// ==================== HTTP 工具 ====================
function httpGet(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'SpendItAllSync/1.0', 'Accept-Encoding': 'gzip, deflate' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('HTTP 请求超时')); });
  });
}

// ==================== matchTags 标签池（141个高差异度消费品类标签）====================
const ALL_MATCH_TAGS = [
  // —— 居住地产（4个）——
  { _id: '超级豪宅',   category: '居住地产', desc: '都市/郊区万平米级现代庄园' },
  { _id: '私人岛屿',   category: '居住地产', desc: '加勒比海/南太平洋整座岛屿产权' },
  { _id: '城堡庄园',   category: '居住地产', desc: '欧洲中世纪城堡、历史古堡与酒庄' },
  { _id: '云端公寓',   category: '居住地产', desc: '摩天大楼顶层复式与空中别墅' },
  // —— 交通工具（5个）——
  { _id: '超级跑车',   category: '交通工具', desc: '布加迪/柯尼塞格/帕加尼级别超跑' },
  { _id: '经典名车',   category: '交通工具', desc: '法拉利250GTO/奔驰300SL等古董车' },
  { _id: '私人飞机',   category: '交通工具', desc: '湾流/庞巴迪/达索公务机' },
  { _id: '超级游艇',   category: '交通工具', desc: '100米以上巨型私人游艇' },
  { _id: '深海潜器',   category: '交通工具', desc: '特里顿潜水器/个人潜艇' },
  // —— 艺术收藏（4个）——
  { _id: '西方油画',   category: '艺术收藏', desc: '莫奈/毕加索/梵高等西方大师作品' },
  { _id: '中国书画',   category: '艺术收藏', desc: '齐白石/张大千/古代名人手卷' },
  { _id: '当代艺术',   category: '艺术收藏', desc: '村上隆/KAWS/Banksy等当代先锋' },
  { _id: '古董珍玩',   category: '艺术收藏', desc: '青铜器/瓷器/古典家具/文玩' },
  // —— 珠宝腕表（2个）——
  { _id: '传世腕表',   category: '珠宝腕表', desc: '百达翡丽/江诗丹顿复杂功能腕表' },
  { _id: '稀世珠宝',   category: '珠宝腕表', desc: '顶级钻石/鸽血红/克什米尔蓝宝石' },
  // —— 时尚服饰（3个）——
  { _id: '高级定制',   category: '时尚服饰', desc: '香奈儿/迪奥高级定制礼服与配饰' },
  { _id: '奢侈包袋',   category: '时尚服饰', desc: '喜马拉雅铂金包/限量款手袋皮具' },
  { _id: '名流礼服',   category: '时尚服饰', desc: '红毯礼服/定制燕尾服/顶级西装' },
  // —— 美酒美食（4个）——
  { _id: '名庄红酒',   category: '美酒美食', desc: '罗曼尼康帝/柏图斯/拉菲等顶级名庄' },
  { _id: '珍稀烈酒',   category: '美酒美食', desc: '麦卡锡1926/轻井泽/路易十三' },
  { _id: '顶级食材',   category: '美酒美食', desc: '白松露/钻石鱼子酱/5A和牛' },
  { _id: '奢华雪茄',   category: '美酒美食', desc: '高希霸贝伊可/大卫杜夫/保湿房' },
  // —— 家居生活（3个）——
  { _id: '设计师家具', category: '家居生活', desc: '让纳雷特/海丝腾等设计师家具' },
  { _id: '私人影院',   category: '家居生活', desc: 'IMAX级银幕/杜比全景声放映厅' },
  { _id: '智能机器人', category: '家居生活', desc: '特斯拉Optimus/全屋AI管家' },
  // —— 运动休闲（4个）——
  { _id: '体育俱乐部', category: '运动休闲', desc: 'NBA球队/英超足球/F1车队所有权' },
  { _id: '赛马竞技',   category: '运动休闲', desc: '纯血赛马/马场/国际赛事' },
  { _id: '高尔夫会籍', category: '运动休闲', desc: '奥古斯塔/圆石滩终身会籍' },
  { _id: '极限装备',   category: '运动休闲', desc: '翼装/深潜/8000米登山装备' },
  // —— 旅行体验（3个）——
  { _id: '太空旅行',   category: '旅行体验', desc: '维珍银河亚轨道/空间站深度游' },
  { _id: '极地探险',   category: '旅行体验', desc: '南极90°/北极破冰/深海挑战' },
  { _id: '赛事包厢',   category: '旅行体验', desc: '超级碗/奥斯卡/温网皇家包厢' },
  // —— 另类收藏（8个）——
  { _id: '数字资产',   category: '另类收藏', desc: 'NFT/虚拟土地/BTC等加密资产' },
  { _id: '军事藏品',   category: '另类收藏', desc: '退役坦克/战斗机/二战军械' },
  { _id: '化石陨石',   category: '另类收藏', desc: '霸王龙骨架/月球陨石标本' },
  { _id: '稀有书籍',   category: '另类收藏', desc: '古腾堡圣经/初版莎士比亚真迹' },
  { _id: '乐器名琴',   category: '另类收藏', desc: '斯特拉迪瓦里/瓜奈里小提琴' },
  { _id: '电影道具',   category: '另类收藏', desc: '星战光剑/007座驾/经典戏服' },
  { _id: '猛禽异宠',   category: '另类收藏', desc: '猎隼/白狮/阿拉伯纯血马' },
  { _id: '改造奇物',   category: '另类收藏', desc: '波音747豪宅/导弹井别墅改造' },
  // —— 其他（7个）——
  { _id: '贵金属',     category: '其他',   desc: '金条/铂锭/铑等稀有贵金属' },
  { _id: '名流会所',   category: '其他',   desc: '摩纳哥游艇会/香港赛马会会员' },
  { _id: '私人博物馆', category: '其他',   desc: '私人美术馆/画廊/藏品空间' },
  { _id: '私人牧场',   category: '其他',   desc: '万英亩级牧场/狩猎庄园/农耕大地' },
  { _id: '私人酒庄',   category: '其他',   desc: '波尔多/纳帕谷/托斯卡纳自有酒庄' },
  { _id: '古董枪支',   category: '其他',   desc: '百年古董猎枪/工艺手枪藏品' },
  { _id: '顶奢帐篷',   category: '其他',   desc: '游牧风格奢华露营/野外行宫' },
  { _id: '量子计算机', category: '科技数码', desc: 'IBM量子系统/谷歌悬铃木/超导量子计算集群' },
  { _id: '卫星星座',   category: '科技数码', desc: '私人低轨卫星网络/星链级通信星座建造' },
  { _id: 'AI服务器群', category: '科技数码', desc: 'NVIDIA DGX集群/千卡GPU训练算力中心' },
  { _id: '超级计算机', category: '科技数码', desc: 'TOP500级别/百PFLOPS算力专属定制建设' },
  { _id: '数据中心',   category: '科技数码', desc: 'T4级绿色数据中心/液冷散热/碳中和机房' },
  { _id: '机器人军团', category: '科技数码', desc: '定制工业机器人/人形服务机器人编队' },
  { _id: '古籍修复',   category: '文化传承', desc: '宋版书修复/敦煌写经/纸质文物抢救性保护' },
  { _id: '非遗技艺',   category: '文化传承', desc: '缂丝/云锦/景泰蓝大师作品收藏及传承赞助' },
  { _id: '传统工艺',   category: '文化传承', desc: '漆器/螺钿/金银错等濒危工艺工坊与传习' },
  { _id: '书法收藏',   category: '文化传承', desc: '王羲之摹本/颜真卿碑拓/明清名家手札真迹' },
  { _id: '茶道研习',   category: '文化传承', desc: '点茶/煎茶/日本千家流派宗师私教与器具' },
  { _id: '慈善基金',   category: '社交影响', desc: '私人基金会设立/公益信托/家族办公室管理' },
  { _id: '媒体帝国',   category: '社交影响', desc: '全媒体矩阵/新闻出版/影视制作的控股集团' },
  { _id: '社交平台',   category: '社交影响', desc: '垂直社交网络/私域流量平台/名人经纪签约' },
  { _id: '影响力投资', category: '社交影响', desc: 'ESG投资基金/社会企业孵化/公益创投组合' },
  { _id: '海洋保护',   category: '环保公益', desc: '海洋保护区冠名/珊瑚礁修复基金/海洋科考船' },
  { _id: '雨林保护',   category: '环保公益', desc: '亚马逊/刚果盆地私人保护区/碳汇林投资' },
  { _id: '野生动物保护', category: '环保公益', desc: '反盗猎基金会/珍稀物种救助繁育中心冠名' },
  { _id: '森林树屋',   category: '居住地产', desc: '原始森林/红杉林中的悬空树屋群落' },
  { _id: '沙漠行宫',   category: '居住地产', desc: '中东沙漠绿洲/戈壁中的奢华行宫' },
  { _id: '水下别墅',   category: '居住地产', desc: '海底全景卧室/珊瑚礁环绕的沉浸式居所' },
  { _id: '雪山庄园',   category: '居住地产', desc: '阿尔卑斯山/落基山脉滑雪度假庄园' },
  { _id: '私人农场',   category: '居住地产', desc: '万英亩级有机农场/精准农业/田园综合体' },
  { _id: '生态庄园',   category: '居住地产', desc: '碳中和零能耗庄园/自循环生态系统智能住宅' },
  { _id: '文化遗产建筑', category: '居住地产', desc: '百年历史酒店/宫殿/教堂改造为私人居所' },
  { _id: '私人直升机', category: '交通工具', desc: '阿古斯特/西科斯基VIP直升机' },
  { _id: '复古摩托',   category: '交通工具', desc: '哈雷/印第安/文森特百年古董摩托' },
  { _id: '极地探险车', category: '交通工具', desc: '南极雪地车/冰原履带探险车' },
  { _id: '电动超跑',   category: '交通工具', desc: 'Rimac/路特斯/保时捷电动超跑' },
  { _id: '私人列车',   category: '交通工具', desc: '东方快车定制/豪华私人铁路专列' },
  { _id: '非洲艺术',   category: '艺术收藏', desc: '贝宁青铜/马孔德木雕/努比亚面具' },
  { _id: '伊斯兰艺术', category: '艺术收藏', desc: '波斯细密画/奥斯曼书法/大马士革刀' },
  { _id: '佛教艺术',   category: '艺术收藏', desc: '犍陀罗佛像/唐卡/铜鎏金度母像' },
  { _id: '摄影大师',   category: '艺术收藏', desc: '亚当斯/莱博维茨/杉本博司原作签名' },
  { _id: '翡翠玉器',   category: '珠宝腕表', desc: '缅甸老坑玻璃种/帝王绿/紫罗兰翡翠' },
  { _id: '珍珠珊瑚',   category: '珠宝腕表', desc: '南洋金珠/海螺珠/深海红珊瑚' },
  { _id: '独立制表',   category: '珠宝腕表', desc: 'Philippe Dufour/F.P.Journe/Roger Smith作品' },
  { _id: '彩色钻石',   category: '珠宝腕表', desc: '粉钻/蓝钻/绿钻/红钻等稀有IIa型天然彩钻' },
  { _id: '顶级鞋履',   category: '时尚服饰', desc: '伯尔鲁帝/约翰罗布/维利耶手工皮鞋' },
  { _id: '丝巾披肩',   category: '时尚服饰', desc: '爱马仕丝巾/喀什米尔羊绒披肩收藏' },
  { _id: '定制眼镜',   category: '时尚服饰', desc: 'Lotos/林德伯格铂金镜框/钻石镜片' },
  { _id: '帽饰收藏',   category: '时尚服饰', desc: '皇家赛马会礼帽/菲利普崔西定制/巴拿马草帽' },
  { _id: '名茶珍藏',   category: '美酒美食', desc: '武夷山大红袍母树/普洱金瓜贡茶/抹茶道' },
  { _id: '精品咖啡',   category: '美酒美食', desc: '巴拿马瑰夏/猫屎咖啡/蓝山一号庄园' },
  { _id: '巧克力大师', category: '美酒美食', desc: '阿梅代/皮尔马可里尼/图尔含金箔巧克力' },
  { _id: '私厨服务',   category: '美酒美食', desc: '米其林三星主厨驻场/名厨上门私宴' },
  { _id: '稀有蜂蜜',   category: '美酒美食', desc: '安第斯榛子蜜/毛利麦卢卡UMF28+/土耳其松蜜' },
  { _id: '奢华卫浴',   category: '家居生活', desc: '卡拉拉大理石浴缸/黄金水龙头/蒸汽SPA房' },
  { _id: '顶级床品',   category: '家居生活', desc: '海丝腾Vividus/冰岛雁鸭绒被/真丝寝具' },
  { _id: '艺术灯具',   category: '家居生活', desc: '穆拉诺水晶吊灯/英戈毛雷尔光雕/琉璃灯' },
  { _id: '室内泳池',   category: '家居生活', desc: '奥林匹克尺寸恒温泳池/星空天幕/水下音响' },
  { _id: '帆船竞技',   category: '运动休闲', desc: '美洲杯赛船/激光级奥运帆船/环球帆船' },
  { _id: '击剑马术',   category: '运动休闲', desc: '奥运级重剑/盛装舞步温血马/马球装备' },
  { _id: '武术格斗',   category: '运动休闲', desc: '柔术黑带私教/咏春木人桩/泰拳训练营' },
  { _id: '飞钓狩猎',   category: '运动休闲', desc: '苏格兰飞蝇钓/非洲游猎/新西兰猎鹿' },
  { _id: '风筝冲浪',   category: '运动休闲', desc: '专业竞速风筝/碳纤维水翼板/全球最佳浪点巡回' },
  { _id: '古城私旅',   category: '旅行体验', desc: '私人金字塔夜游/吴哥窟闭门/佩特拉之夜' },
  { _id: '火山探险',   category: '旅行体验', desc: '活火山口直升机/熔岩管徒步/地热温泉' },
  { _id: '水下酒店',   category: '旅行体验', desc: '马尔代夫康拉德海底套房/三亚亚特兰蒂斯' },
  { _id: '地心探险',   category: '旅行体验', desc: '冰岛火山内部/全球最深洞穴/废弃深矿井探底' },
  { _id: '钱币邮票',   category: '另类收藏', desc: '错版邮票/古罗马金币/稀有纸钞大全' },
  { _id: '矿物晶体',   category: '另类收藏', desc: '海蓝宝石晶簇/天河石/萤石夜光球' },
  { _id: '昆虫标本',   category: '另类收藏', desc: '亚历山大鸟翼蝶/彩虹锹甲/长戟大兜虫' },
  { _id: '烟斗收藏',   category: '另类收藏', desc: '登喜路死根/卡斯特罗/丹麦大师手工斗' },
  { _id: '地图手稿',   category: '另类收藏', desc: '16世纪航海图/羊皮纸星图/战地手绘' },
  { _id: '文房清玩',   category: '另类收藏', desc: '端砚老坑/田黄石章/明代宣德炉' },
  { _id: '瓷器修复',   category: '另类收藏', desc: '金缮修复/宋代建盏/龙泉青瓷残件重生' },
  { _id: '民族服饰',   category: '另类收藏', desc: '清代龙袍/印第安酋长羽冠/和服腰带' },
  { _id: '船舶模型',   category: '另类收藏', desc: '古董海事模型/海军部级精工比例舰模/瓶装船' },
  { _id: '古董相机',   category: '另类收藏', desc: '徕卡原型机/哈苏登月款/大画幅木机珍藏' },
  { _id: '标本收藏',   category: '另类收藏', desc: '玻璃工艺生物标本/19世纪植物图谱/骨骼标本' },
  { _id: '雕塑艺术',   category: '另类收藏', desc: '罗丹/贾科梅蒂/亨利·摩尔原作铜雕与石雕' },
  { _id: '数字版画',   category: '另类收藏', desc: 'Beeple/Hackatao/Fewocious等数字原作授权' },
  { _id: '大师私塾',   category: '知识教育', desc: '诺贝尔奖得主一对一/哲学大师讲座系列' },
  { _id: '语言精通',   category: '知识教育', desc: '母语级沉浸教学/濒危语言抢救学习' },
  { _id: '科研赞助',   category: '知识教育', desc: '冠名实验室/前沿课题资助/博士奖学金' },
  { _id: '私人智库',   category: '知识教育', desc: '全球政策分析/战略咨询/地缘政治简报' },
  { _id: '抗衰医美',   category: '健康养生', desc: '干细胞存储/基因编辑/长寿诊所年费' },
  { _id: '私人医疗',   category: '健康养生', desc: '24小时私人医生/家庭MRI/空中医疗转运' },
  { _id: '温泉疗养',   category: '健康养生', desc: '箱根温泉/蓝湖硅泥/冰岛地热疗养庄园' },
  { _id: '心灵修行',   category: '健康养生', desc: '喜马拉雅闭关/禅修导师/声音疗愈舱' },
  { _id: '私人花园',   category: '其他',   desc: '切尔西花展金牌花园/京都枯山水庭院' },
  { _id: '宠物乐园',   category: '其他',   desc: '宠物专属豪宅/赛级犬繁育/动物心理师' },
  { _id: '香氛定制',   category: '其他',   desc: '格拉斯调香师/专属香水实验室/沉香收藏' },
  { _id: '飞行汽车',   category: '其他',   desc: 'Aeromobil/Klein/PAL-V量产飞行汽车' },
  { _id: '电动摩托',   category: '其他',   desc: '零摩托/LiveWire/Energica高性能电动摩托' },
  { _id: '古董服装',   category: '其他',   desc: '维多利亚礼服/爵士时代Flapper裙装/古着和服' },
  { _id: '智能厨房',   category: '其他',   desc: 'Molteni全套智能厨电/分子料理站/自动配菜' },
  { _id: '家庭酒窖',   category: '其他',   desc: '岩壁开凿天然酒窖/指纹恒温玻璃展示墙/品酒沙龙' },
  { _id: '热气球',     category: '其他',   desc: '定制热气球编队/跨国气球节/VIP高空早午餐' },
  { _id: '深空观测',   category: '其他',   desc: '私人天文台/射电望远镜阵列/哈勃级别深空摄影' },
  { _id: '太阳能农场', category: '其他',   desc: '吉瓦级太阳能电站/光储一体化/新能源发电投资' },
  { _id: '风能投资',   category: '其他',   desc: '海上风电场/陆上风电/可再生能源基金组合' },
  { _id: '私人赛道',   category: '其他',   desc: 'FIA认证私人赛道/纽北风格测试场/驾驶学院' },
];

// ==================== 行业 → 消费品类标签映射 ====================
// 排序按"性格定义力"从强到弱：越能体现富豪独特个性的行业越靠前
const INDUSTRY_TAG_MAP = [
  // 航空航天 → 太空旅行, 深海潜器（性格定义力最强：冒险家、未来主义者）
  { keys: ['spacex','blue origin','space','rocket','satellite','boeing','virgin'], tags: ['太空旅行','深海潜器'] },
  // 加密/区块链 → 数字资产（加密布道者、反传统者）
  { keys: ['crypto','bitcoin','binance','blockchain','nft','web3'], tags: ['数字资产'] },
  // 军事/军工 → 军事藏品, 古董枪支（权力、硬核、强人性格）
  { keys: ['defense','military','weapon','arms','koch industries'], tags: ['军事藏品','古董枪支'] },
  // 体育球队 → 体育俱乐部, 赛马竞技, 高尔夫会籍（竞技精神、团队领导）
  { keys: ['nba','basketball','nfl','football club','soccer','club','ac milan','brooklyn nets'], tags: ['体育俱乐部','赛马竞技','高尔夫会籍'] },
  // 音乐/艺术品拍卖 → 乐器名琴, 西方油画, 当代艺术（艺术家气质、文化鉴赏家）
  { keys: ['spotify','apple music','universal music','warner music','sony music','art','auction','gallery','sotheby','christie'], tags: ['乐器名琴','西方油画','当代艺术'] },
  // 奢侈品/时尚 → 高级定制, 奢侈包袋, 稀世珠宝（核心三件套）
  { keys: ['lvmh','louis vuitton','dior','hermès','chanel','gucci','kering','cartier','tiffany','prada','rolex','richemont','bulgari','versace','burberry','fendi','armani','luxottica','bestseller','inditex','zara','nike','adidas','fashion','apparel','clothing'], tags: ['高级定制','奢侈包袋','稀世珠宝'] },
  // 酒类 → 名庄红酒, 珍稀烈酒, 私人酒庄（品鉴大师+自有酒庄）
  { keys: ['wine','champagne','whisky','vineyard','distillery','liquor','spirit','beer','beverage','diageo','heineken','ab inbev','cognac','brandy','moët','hennessy','thai beverage'], tags: ['名庄红酒','珍稀烈酒','私人酒庄'] },
  // 汽车 → 超级跑车, 经典名车, 私人飞机（机械狂热者、速度信徒）
  { keys: ['automotive','bmw','mercedes','ferrari','porsche','toyota','volkswagen','ford','gm','hyundai','honda','nio','byd','geely','volvo','racing','f1','motorsport'], tags: ['超级跑车','经典名车','私人飞机'] },
  // 媒体/娱乐 → 私人影院, 赛事包厢, 电影道具（内容创作者、娱乐大亨）
  { keys: ['movie','film','cinema','hollywood','disney','warner','paramount','universal','broadcasting','media','netease','thomson','reuters','news','publish','mediaset','astro'], tags: ['私人影院','赛事包厢','电影道具'] },
  // 游戏 → 数字资产, 私人影院（虚拟世界构建者）
  { keys: ['nintendo','tencent','riot','epic','activision','blizzard','gaming','esport'], tags: ['数字资产','私人影院'] },
  // 能源/矿产 → 贵金属, 超级游艇, 化石陨石（资源大亨、地球的征服者）
  { keys: ['oil','gas','petroleum','energy','mining','steel','coal','nickel','copper','chemical','refinery','shell','exxon','chevron','bp','total','aramco','glencore','bhp','rio tinto','vale','arcelormittal','norilsk','novatek','lukoil','severstal','sibur','hancock','fortescue','gold','diamond','de beers','arconic','alcoa','metals','resources','barito'], tags: ['贵金属','超级游艇','化石陨石'] },
  // 金融 → 名流会所, 传世腕表, 超级豪宅（资本操盘手、精英俱乐部成员）
  { keys: ['berkshire','blackstone','blackrock','goldman','morgan stanley','jpmorgan','citadel','bridgewater','fidelity','vanguard','apollo','kkr','carlyle','hedge fund','private equity','investment','bank','insurance','finance','asset management','bloomberg','interactive brokers','bluecrest'], tags: ['名流会所','传世腕表','超级豪宅'] },
  // 房地产 → 超级豪宅, 云端公寓, 私人岛屿（空间的缔造者）
  { keys: ['real estate','property','construction','wanda','henderson','vista land','ck asset','ck hutchison'], tags: ['超级豪宅','云端公寓','私人岛屿'] },
  // 食品 → 顶级食材, 名庄红酒（味觉的守护者）
  { keys: ['food','restaurant','coca-cola','pepsico','nestlé','mars','ferrero','mondelez','kraft','starbucks','mcdonald','red bull','nongfu','charoen','pokphand','kuok'], tags: ['顶级食材','名庄红酒'] },
  // 基础设施/港口 → 超级游艇, 私人飞机
  { keys: ['port','airport','railway','telecom','tower','infrastructure','terminal','container','maxis'], tags: ['超级游艇','私人飞机'] },
  // 物流 → 私人飞机, 超级游艇
  { keys: ['logistics','shipping','delivery','fedex','ups','dhl','sf express','maersk','cargo','freight','supply chain','kuehne'], tags: ['私人飞机','超级游艇'] },
  // 科技互联网 → 智能机器人, 私人飞机, 数字资产（最通用，排最后让更个性标签优先）
  { keys: ['tesla','spacex','nvidia','apple','microsoft','google','alphabet','oracle','meta','facebook','amazon','samsung','dell','cisco','intel','amd','ibm','paypal','palantir','salesforce','adobe','uber','airbnb','stripe','tencent','alibaba','baidu','byte','bytedance','softbank','sap','spotify','zoom','shopify','twitter','x corp','openai','xiaomi','huawei','netflix','kakao','keyence'], tags: ['智能机器人','私人飞机','数字资产'] },
  // 医药/生物科技 → 私人博物馆, 稀有书籍（科研型人格：知性收藏、对知识的好奇）
  { keys: ['pharma','biotech','healthcare','medical','pfizer','moderna','roche','novartis','johnson','merck','astrazeneca','gilead','eli lilly','abbvie','thermo fisher','danaher','celltrion','coloplast','wantai'], tags: ['私人博物馆','稀有书籍'] },
  // 零售/超市 → 超级豪宅, 云端公寓（大众零售霸主：更看重空间与规模）
  { keys: ['walmart','costco','ebay','shopee','retail','e-commerce','ecommerce','distribution','dmart','lidl','schwarz','jim pattison','mall','supermarket','uniqlo','fast retailing'], tags: ['超级豪宅','云端公寓'] },
  // 家居/玩具 → 设计师家具, 稀有书籍（创造趣味的工匠）
  { keys: ['lego','furniture','design','home','ikea','wuerth','wuerth'], tags: ['设计师家具','稀有书籍'] },
  // 化妆品/个护 → 高级定制, 奢侈包袋（美的产业：自然契合时尚）
  { keys: ['l\'oréal','cosmetic','beauty','skincare','perfume','fragrance'], tags: ['高级定制','奢侈包袋'] },
];

const NATIONALITY_EXTRA_TAGS = {
  '中国':      ['中国书画','古董珍玩','贵金属'],
  '中国香港':  ['中国书画','古董珍玩','名流会所'],
  '法国':      ['名庄红酒','高级定制','城堡庄园'],
  '意大利':    ['经典名车','名庄红酒','高级定制'],
  '英国':      ['赛马竞技','珍稀烈酒','城堡庄园'],
  '俄罗斯':    ['超级游艇','军事藏品','贵金属'],
  '印度':      ['稀世珠宝','超级豪宅','名流会所'],
  '日本':      ['珍稀烈酒','设计师家具','传世腕表'],
  '德国':      ['经典名车','设计师家具','私人影院'],
  '美国':      ['超级豪宅','私人飞机','体育俱乐部'],
  '沙特阿拉伯': ['私人岛屿','超级跑车','猛禽异宠'],
  '埃及':      ['超级豪宅','古董珍玩'],
  '尼日利亚':  ['贵金属','超级豪宅'],
  '南非':      ['稀世珠宝','贵金属'],
  '澳大利亚':  ['贵金属','极限装备'],
  '巴西':      ['体育俱乐部','顶级食材'],
  '韩国':      ['设计师家具','传世腕表'],
  '加拿大':    ['极地探险','私人飞机','顶奢帐篷'],
  '西班牙':    ['高级定制','名流礼服'],
  '丹麦':      ['设计师家具','稀有书籍'],
  '墨西哥':    ['超级豪宅','贵金属'],
  '印度尼西亚': ['贵金属','超级豪宅'],
  '泰国':      ['顶级食材','珍稀烈酒'],
  '马来西亚':  ['名流会所','顶级食材'],
  '菲律宾':    ['超级豪宅','云端公寓'],
};

// ==================== 性格覆盖标签（自动匹配不准时，人工校准）====================
const PERSONALITY_OVERRIDE_TAGS = {
  // —— 科技巨头：性格分化 ——
  '比尔·盖茨':        ['稀有书籍','私人博物馆','私人飞机'],    // 达芬奇手稿收藏家、慈善知识分子
  '拉里·埃里森':      ['私人岛屿','超级游艇','经典名车'],       // 拉奈岛主人、帆船赛冠军、日式庭院
  '马克·扎克伯格':    ['顶级食材','极限装备','数字资产'],       // 养和牛、练巴西柔术、元宇宙
  '史蒂夫·鲍尔默':    ['体育俱乐部','赛事包厢','私人飞机'],    // 洛杉矶快船队老板
  '黄仁勋':            ['超级跑车','智能机器人','数字资产'],    // 极客赛车手、AI教父
  '迈克尔·戴尔':      ['超级豪宅','传世腕表','私人飞机'],       // 传统富豪品味路线
  // —— 金融巨头：投资哲学映射消费 ——
  '沃伦·巴菲特':      ['传世腕表','经典名车','私人飞机'],       // 简朴务实、经典只买对的
  '迈克尔·布隆伯格':  ['稀有书籍','赛事包厢','私人飞机'],      // 慈善家、赛马、数据驱动
  '查尔斯·科赫':      ['军事藏品','古董枪支','私人牧场'],      // 自由意志主义、科赫牧场、军械收藏
  '茱莉亚·科赫':      ['西方油画','私人博物馆','名流会所'],    // 艺术慈善、纽约社交
  // —— 时尚/零售：低调节俭者的真实面貌 ——
  '阿曼西奥·奥特加':  ['超级豪宅','云端公寓','私人飞机'],      // 极度低调，不爱消费品
  '柳井正':            ['设计师家具','珍稀烈酒','私人博物馆'],  // 日式极简主义美学
  '迪特尔·施瓦茨':    ['经典名车','私人影院','超级豪宅'],      // 德式低调务实
  '伯纳德·阿尔诺':    ['城堡庄园','高级定制','奢侈包袋'],      // 白马酒庄、时尚帝国
  // —— 艺术收藏家 ——
  '爱丽丝·沃尔顿':    ['西方油画','当代艺术','私人博物馆'],   // 水晶桥艺术博物馆创始人
  '弗朗索瓦·皮诺':    ['西方油画','当代艺术','私人博物馆'],   // 佳士得老板、威尼斯双年展
  '弗朗索瓦丝·贝当古':['西方油画','当代艺术','高级定制'],     // 欧莱雅继承人、艺术赞助人
  // —— 体育产业 ——
  '蔡崇信':            ['体育俱乐部','赛马竞技','高尔夫会籍'], // 布鲁克林篮网老板
  '西尔维奥·贝卢斯科尼':['体育俱乐部','私人影院','经典名车'], // AC米兰、传媒大亨
  // —— 创新冒险家 ——
  '理查德·布兰森':    ['极限装备','太空旅行','私人岛屿'],      // 冒险家、内克岛
  '詹姆斯·戴森':      ['设计师家具','私人博物馆','改造奇物'],  // 发明狂人、Dyson农场主
  '赵长鹏':            ['数字资产','顶奢帐篷','极限装备'],      // 加密游牧者
  // —— 知识分子/工业家 ——
  '任正非':            ['稀有书籍','私人博物馆','私人飞机'],    // 前军人、技术知识分子
  '莱因霍尔德·伍尔特': ['设计师家具','私人博物馆','稀有书籍'],// 艺术收藏家、伍尔特博物馆
  '凯尔·柯克·克里斯蒂安森':['设计师家具','稀有书籍','私人博物馆'],// 乐高、丹麦设计世家
  '乔治·阿玛尼':      ['超级游艇','私人博物馆','名流礼服'],    // 游艇主、Armani/Silos
  // —— 资源大亨 ——
  '吉娜·莱因哈特':    ['贵金属','超级游艇','私人牧场'],        // 矿业女皇、澳洲最大牧场主
  '阿利舍尔·乌斯马诺夫':['超级游艇','私人博物馆','经典名车'], // 前俄罗斯首富、艺术藏家
  // —— 地产与多元 ——
  '何享健':            ['超级豪宅','私人博物馆','设计师家具'],  // 传统实业家、岭南园林
  '爱德华多·萨维林':  ['名流会所','高级定制','数字资产'],      // 新加坡社交圈、时尚投资人
  // —— 体育与户外 ——
  '菲尔·奈特':        ['体育俱乐部','赛事包厢','经典名车'],    // 跑步教父、俄勒冈鸭子队
  '詹姆斯·拉特克利夫':['体育俱乐部','极限装备','超级游艇'],    // 英力士自行车队、户外运动
  // —— 中东巨头 ——
  '穆罕默德·本·萨勒曼':['私人岛屿','超级跑车','猛禽异宠'],    // 王储、2030愿景
  // —— 日本匠心 ——
  '滝崎武光':          ['设计师家具','传世腕表','私人博物馆'],  // 极简主义、持续改善
  // —— 东南亚华商 ——
  '黄惠忠':            ['传世腕表','名流会所','中国书画'],      // 低调印尼华商、针记
  '黄惠祥':            ['传世腕表','名流会所','中国书画'],      // 兄弟企业家
  // —— 媒体与娱乐 ——
  '大卫·汤姆森':      ['稀有书籍','私人博物馆','私人飞机'],    // 汤森路透、信息贵族
  // —— 中国实业家 ——
  '曾毓群':            ['超级跑车','智能机器人','私人飞机'],    // CATL电池先驱、新能源
  '王卫':              ['私人飞机','极限装备','稀有书籍'],      // 顺丰、佛教徒、登山爱好者
  '丁磊':              ['乐器名琴','顶级食材','私人影院'],      // 网易云音乐、养猪、生活家
  '约翰·鲁伯特':      ['传世腕表','稀世珠宝','奢华雪茄'],      // 历峰掌门、登喜路雪茄
};

function mapIndustryToMatchTags(sourceText, nationality, name) {
  const lowerText = sourceText.toLowerCase();
  const lowerNationality = (nationality || '').toLowerCase();
  const industryTags = new Set();
  // 短关键词（≤3字符）容易误匹配子串（如 'art' 匹配 'walmart'），用词边界校验
  const shortKeys = new Set(['art', 'gm', 'bp', 'f1']);
  for (const entry of INDUSTRY_TAG_MAP) {
    for (const key of entry.keys) {
      let matched = false;
      if (shortKeys.has(key)) {
        // 短关键词：前后必须是边界（空格/逗号/开头/结尾）
        const idx = lowerText.indexOf(key);
        if (idx >= 0) {
          const before = idx === 0 || /[\s,]/.test(lowerText[idx - 1]);
          const after = idx + key.length >= lowerText.length || /[\s,]/.test(lowerText[idx + key.length]);
          matched = before && after;
        }
      } else {
        matched = lowerText.includes(key);
      }
      if (matched) { entry.tags.forEach(t => industryTags.add(t)); break; }
    }
  }
  const natTags = new Set();
  for (const [nat, tags] of Object.entries(NATIONALITY_EXTRA_TAGS)) {
    if (lowerNationality.includes(nat) || lowerNationality === nat.toLowerCase()) { tags.forEach(t => natTags.add(t)); }
  }
  // 第一步：合并行业标签和国籍标签
  let result = [...new Set([...industryTags, ...natTags])];
  // 第二步：性格覆盖标签（追加而非替换，体现个性化，行业和国籍标签依然保留）
  if (name && PERSONALITY_OVERRIDE_TAGS[name]) {
    result = [...new Set([...result, ...PERSONALITY_OVERRIDE_TAGS[name]])];
  }
  // 第三步：去重后取前9个
  result = result.slice(0, 9);
  // 第四步：不足9个时用通用标签补齐
  const DEFAULT_TAGS = ['超级豪宅','私人飞机','传世腕表','贵金属','名庄红酒','数字资产','超级跑车','私人博物馆','云端公寓'];
  for (let i = 0; result.length < 9 && i < DEFAULT_TAGS.length; i++) {
    if (!result.includes(DEFAULT_TAGS[i])) result.push(DEFAULT_TAGS[i]);
  }
  return result;
}

// ==================== 富豪真实口头禅 ====================
const CATCHPHRASES = {
  '埃隆·马斯克':      '当某事足够重要，即使胜算渺茫，你也要去尝试。',
  '杰夫·贝佐斯':      '你的利润就是我的机会。',
  '马克·扎克伯格':    '快速行动，打破陈规。',
  '拉里·埃里森':      '胜利唯一的办法就是永不放弃。',
  '沃伦·巴菲特':      '别人贪婪时我恐惧，别人恐惧时我贪婪。',
  '拉里·佩奇':        '始终做比必要更多的事。',
  '谢尔盖·布林':      '你应该做你真正热爱的事情。',
  '比尔·盖茨':        '成功是一个糟糕的老师。',
  '史蒂夫·鲍尔默':    '激情是成功之路上最重要的东西。',
  '迈克尔·戴尔':      '永远保持好奇心，把自己当成CEO。',
  '黄仁勋':            '要么跑起来，要么被吃掉。',
  '伯纳德·阿尔诺':    '奢侈品不仅是产品，更是一种文化。',
  '弗朗索瓦丝·贝当古':'美丽是一种力量。',
  '弗朗索瓦·皮诺':    '伟大的艺术值得终生等待。',
  '阿兰·韦特海默':    '最好的广告就是穿我们衣服的人。',
  '杰拉尔·韦特海默':  '香奈儿不需要解释。',
  '阿曼西奥·奥特加':  '在商业中，你必须知道自己在做什么。',
  '穆克什·安巴尼':    '数据是新的石油。',
  '高塔姆·阿达尼':    '基础设施是印度的脊柱。',
  '拉达基尚·达马尼':  '每天都给顾客最优惠的价格。',
  '希夫·纳达尔':      '教育是改变世界最有力的武器。',
  '阿齐姆·普莱姆基':  '商业的成功源自持续的小进步。',
  '吉姆·沃尔顿':      '把顾客放在第一位，一切就会随之而来。',
  '罗布·沃尔顿':      '最大的优势是永不自满。',
  '爱丽丝·沃尔顿':    '艺术让世界和你自己变得更好。',
  '菲尔·奈特':        'Just Do It. 放手去做。',
  '迈克尔·布隆伯格':  '如果你无法衡量它，就无法管理它。',
  '查尔斯·科赫':      '自由是繁荣的唯一真正源泉。',
  '茱莉亚·科赫':      '永远不要停止学习新事物。',
  '米丽娅姆·阿德尔森':'最好的投资是改善他人生活的投资。',
  '肯·格里芬':        '永远为最坏的情况做好准备。',
  '史蒂芬·施瓦茨曼':  '付钱让别人做他们擅长的事。',
  '阿比盖尔·约翰逊':  '长期投资是唯一真正有效的策略。',
  '托马斯·彼得菲':    '技术将重新定义金融世界的格局。',
  '钟睒睒':            '我们不生产水，我们只是大自然的搬运工。',
  '张一鸣':            '延迟满足感，不计较眼前的小利益。',
  '马化腾':            '模仿是最稳妥的创新。',
  '马云':              '今天很残酷，明天更残酷，后天很美好。',
  '黄峥':              '消费升级不是让上海人去过巴黎人的生活。',
  '曾毓群':            '把电池做到极致，就是核心竞争力。',
  '丁磊':              '赚钱只是一个顺便的事情。',
  '雷军':              '站在风口上，猪都能飞起来。',
  '刘强东':            '低成本、高效率是零售的本质。',
  '王健林':            '先定一个小目标，比如挣它一个亿。',
  '任正非':            '方向可以大致正确，组织必须充满活力。',
  '何享健':            '宁可慢一点，但步子一定要稳。',
  '王卫':              '服务的本质就是心与心的交换。',
  '李书福':            '汽车就是四个轮子加两个沙发。',
  '王传福':            '技术首先为战略服务，其次为产品服务。',
  '李嘉诚':            '不赚最后一个铜板。',
  '李兆基':            '有土斯有财。',
  '柳井正':            '我一生只失败过一次，就是我不想失败。',
  '孙正义':            '在每一个时代，都有一个改变世界的愿景。',
  '滝崎武光':          '改善是无止境的。',
  '迪特尔·施瓦茨':    '默默地把事情做好就是最大的成功。',
  '克劳斯·米夏埃尔·屈内': '物流是全球化时代的关键基础设施。',
  '莱因霍尔德·伍尔特': '每个员工都应被当作合作伙伴。',
  '苏珊娜·克拉滕':    '隐于市，却成于业。',
  '斯特凡·匡特':      '宝马代表着驾驶的纯粹乐趣。',
  '乔瓦尼·费列罗':    '让每一颗巧克力都能带来微笑。',
  '莱昂纳多·德尔·维奇奥': '做最好的眼镜，让人看不见眼镜。',
  '乔治·阿玛尼':      '优雅不是被注意到，而是被记住。',
  '帕特里齐奥·贝尔泰利': '普拉达代表智慧与时尚的结合。',
  '西尔维奥·贝卢斯科尼': '在意大利，没有什么是不可能的。',
  '卡洛斯·斯利姆':    '危机时的勇敢投资能带来巨大回报。',
  '赫尔曼·拉雷亚':    '财富源于对资源的深刻理解。',
  '豪尔赫·保罗·莱曼': '伟大的人才才能打造伟大的企业。',
  '爱德华多·萨维林':  '选择正确的合作伙伴比任何决定都重要。',
  '马塞尔·特莱斯':    '文化胜于战略，人胜于流程。',
  '卡洛斯·西库皮拉':  '永远不要低估一支好团队的力量。',
  '阿利舍尔·乌斯马诺夫': '科技是推动俄罗斯未来的引擎。',
  '弗拉基米尔·波塔宁': '在传统产业中拥抱创新。',
  '弗拉基米尔·利辛':  '钢铁是工业文明的基石。',
  '列昂尼德·米赫尔松': '天然气是通向能源未来的桥梁。',
  '阿列克谢·莫尔达绍夫': '品质是通往全球市场的唯一护照。',
  '瓦吉特·阿列克佩罗夫': '石油永远是现代经济的血液。',
  '根纳季·季姆琴科':  '要在正确的时间出现在正确的地方。',
  '穆罕默德·本·萨勒曼': '沙特2030：一个不再依赖石油的未来。',
  '纳塞夫·萨维里斯':  '伟大的建筑是写给未来的情书。',
  '穆罕默德·曼苏尔':  '家族企业的力量在于代代相传的价值观。',
  '纳吉布·萨维里斯':  '通信是连接世界的桥梁。',
  '阿里科·丹格特':    '非洲的未来掌握在非洲人自己手中。',
  '约翰·鲁伯特':      '真正的奢侈品从不妥协于细节。',
  '尼基·奥本海默':    '钻石的真正价值在于它承载的故事。',
  '吉娜·莱因哈特':    '澳大利亚真正的财富都埋在我们脚下。',
  '安德鲁·福雷斯特':  '绿色钢铁才是地球真正的未来。',
  '迈克·坎农-布鲁克斯': '用技术解决地球上最大的问题。',
  '斯科特·法夸尔':    '伟大的产品源自伟大的团队协作。',
  '詹姆斯·拉特克利夫': '制造业才是英国经济的真正脊梁。',
  '迈克尔·普拉特':    '我从不跟随市场，我只塑造市场。',
  '理查德·布兰森':    '如果你从不犯错，那说明你从未尝试过。',
  '詹姆斯·戴森':      '我失败了5126次才发明了第一台吸尘器。',
  '安德斯·波尔森':    '好的时尚让每个人都能展现最好的自己。',
  '尼尔斯·路易斯-汉森': '创新的核心是对品质永不妥协。',
  '凯尔·柯克·克里斯蒂安森': '最好的玩具能激发孩子无限的想象力。',
  '大卫·汤姆森':      '信息是这世界上最宝贵的资产。',
  '吉姆·帕蒂森':      '永远不要把鸡蛋放在一个篮子里。',
  '蔡崇信':            '投资就是投人，人对了事就对了。',
  '赵长鹏':            '加密货币是金钱的下一个进化形态。',
  '李健熙家族':        '除了老婆和孩子，一切都要变。',
  '徐廷珍':            '生物医药是改变人类命运的事业。',
  '李在镕':            '变化始于危机。',
  '金范洙':            '移动互联网将重塑人们的生活。',
  '彭云鹏':            '森林和能源是印尼的未来。',
  '刘德光':            '煤炭虽传统，但运营必须现代化。',
  '黄惠忠':            '低调做事，高调成事。',
  '黄惠祥':            '兄弟同心，其利断金。',
  '谢国民':            '利国、利民、利企业。',
  '苏旭明':            '每一瓶酒里装的都是匠心。',
  '郭鹤年':            '做生意最重要的是信用二字。',
  '阿南达·克里希南':  '相信自己的直觉和判断。',
  '曼努埃尔·维拉尔':  '房地产是穷人变富人的阶梯。',
  '恩里克·拉松':      '港口是国家的门户。',
};
// 通用回退，用于 Wikipedia 解析路径中无法匹配的富豪
const FALLBACK_PHRASES = ['改变世界', '创造价值', '永不放弃', '追求卓越', '放眼未来', '敢为人先'];

function generateCatchphrase(name) {
  return CATCHPHRASES[name] || FALLBACK_PHRASES[name.length % FALLBACK_PHRASES.length];
}

// ==================== Wikipedia 解析 ====================
function parseWikiBillionaireTable(wikitext) {
  const billionaires = [];
  const rowRegex = /\|\s*(\d{1,3})\s*\|\|\s*(.+?)\s*\|\|\s*\$\s*([\d.,]+)\s*(billion|million|trillion)\s*\|\|\s*(.+?)\s*\|\|\s*(.+?)\s*$/gm;
  let match;
  while ((match = rowRegex.exec(wikitext)) !== null) {
    const rank = parseInt(match[1]);
    if (rank > 100) break;

    let name = match[2].replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1').trim();
    name = name.replace(/<\/?[^>]+>/g, '').trim();

    let netWorth = parseFloat(match[3].replace(/,/g, ''));
    const unit = match[4].toLowerCase();
    if (unit === 'trillion') netWorth *= 1e12;
    else if (unit === 'billion') netWorth *= 1e9;
    else if (unit === 'million') netWorth *= 1e6;

    const sourceRaw = match[5];
    const companies = [];
    const companyRegex = /\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g;
    let cm;
    while ((cm = companyRegex.exec(sourceRaw)) !== null) {
      const c = cm[1].replace(/<\/?[^>]+>/g, '').trim();
      if (c && !/^\d/.test(c) && c.length < 50) companies.push(c);
    }
    const companyText = companies.join(', ');

    let nationality = match[6].replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1').trim();
    nationality = nationality.replace(/<\/?[^>]+>/g, '').trim();

    const matchTags = mapIndustryToMatchTags(companyText + ' ' + name, nationality, name);
    const catchphrase = generateCatchphrase(name);

    billionaires.push({
      _id: `g${billionaires.length}`,
      name,
      nationality: nationality || '未知',
      companies: companies.map(c => COMPANY_NAME_CN[c.trim()] || c).slice(0, 3),
      assets: Math.round(netWorth),
      catchphrase,
      matchTags,
    });
  }
  return billionaires;
}

// ==================== 公司名中英文映射（英文用于标签匹配，中文用于前端展示） ====================
const COMPANY_NAME_CN = {
  'Tesla': '特斯拉', 'SpaceX': '太空探索', 'xAI': 'xAI人工智能',
  'Amazon': '亚马逊', 'Blue Origin': '蓝色起源',
  'Meta': 'Meta', 'Facebook': '脸书', 'Instagram': '照片墙',
  'Oracle': '甲骨文',
  'Berkshire Hathaway': '伯克希尔·哈撒韦',
  'Google': '谷歌', 'Alphabet': 'Alphabet',
  'Microsoft': '微软',
  'Dell Technologies': '戴尔科技',
  'Nvidia': '英伟达',
  'LVMH': '路威酩轩', 'Louis Vuitton': '路易威登', 'Dior': '迪奥',
  "L'Oréal": '欧莱雅',
  'Kering': '开云集团', 'Gucci': '古驰',
  'Chanel': '香奈儿',
  'Inditex': '盈迪德', 'Zara': '飒拉',
  'Reliance Industries': '信实工业',
  'Adani Group': '阿达尼集团',
  'DMart': 'DMart超市', 'Avenue Supermarts': '大道超市',
  'HCL Technologies': 'HCL科技',
  'Wipro': '威普罗',
  'Walmart': '沃尔玛',
  'Nike': '耐克',
  'Bloomberg LP': '彭博社',
  'Koch Industries': '科氏工业',
  'Las Vegas Sands': '拉斯维加斯金沙',
  'Citadel': '城堡投资',
  'Blackstone': '黑石集团',
  'Fidelity Investments': '富达投资',
  'Interactive Brokers': '盈透证券',
  'Nongfu Spring': '农夫山泉', 'Wantai Biological': '万泰生物',
  'ByteDance': '字节跳动', 'TikTok': 'TikTok',
  'Tencent': '腾讯', 'Riot Games': '拳头游戏',
  'Alibaba': '阿里巴巴', 'Ant Group': '蚂蚁集团',
  'Pinduoduo': '拼多多',
  'CATL': '宁德时代',
  'NetEase': '网易',
  'Xiaomi': '小米',
  'JD.com': '京东', 'JD Logistics': '京东物流',
  'Wanda Group': '万达集团',
  'Huawei': '华为',
  'Midea Group': '美的集团',
  'SF Express': '顺丰速运',
  'Geely': '吉利', 'Volvo': '沃尔沃',
  'BYD': '比亚迪',
  'CK Hutchison': '长江和记', 'CK Asset': '长江实业',
  'Henderson Land': '恒基兆业',
  'Fast Retailing': '迅销集团', 'Uniqlo': '优衣库',
  'SoftBank': '软银',
  'Keyence': '基恩士',
  'Schwarz Group': '施瓦茨集团', 'Lidl': '利多超市',
  'Kuehne + Nagel': '德迅物流',
  'Wuerth Group': '伍尔特集团',
  'BMW': '宝马', 'Altana': '阿尔塔纳',
  'Ferrero': '费列罗', 'Nutella': '能多益',
  'Luxottica': '陆逊梯卡',
  'Armani': '阿玛尼',
  'Prada': '普拉达',
  'Mediaset': '梅迪亚塞特', 'AC Milan': 'AC米兰',
  'América Móvil': '美洲移动', 'Grupo Carso': '卡尔索集团',
  'Grupo México': '墨西哥集团',
  '3G Capital': '3G资本', 'AB InBev': '百威英博',
  'USM Holdings': 'USM控股', 'Metalloinvest': '金属投资',
  'Norilsk Nickel': '诺里尔斯克镍业',
  'NLMK Group': '新利佩茨克钢铁',
  'Novatek': '诺瓦泰克',
  'Severstal': '谢韦尔钢铁',
  'Lukoil': '卢克石油',
  'Sibur': '西布尔',
  'Public Investment Fund': '公共投资基金', 'Aramco': '沙特阿美',
  'OCI N.V.': 'OCI集团', 'Adidas': '阿迪达斯',
  'Mansour Group': '曼苏尔集团', 'GM Egypt': '通用埃及',
  'Orascom': '奥拉斯科姆', 'Wind Telecom': '风之电信',
  'Dangote Group': '丹格特集团',
  'Richemont': '历峰集团', 'Cartier': '卡地亚',
  'De Beers': '戴比尔斯', 'Anglo American': '英美资源集团',
  'Hancock Prospecting': '汉考克勘探',
  'Fortescue Metals': '福蒂斯丘金属',
  'Atlassian': '亚特兰蒂',
  'INEOS': '英力士',
  'BlueCrest Capital': '蓝冠资本',
  'Virgin Group': '维珍集团',
  'Dyson': '戴森',
  'Bestseller': '绫致时装', 'ASOS': 'ASOS时尚',
  'Coloplast': '康乐保',
  'LEGO': '乐高',
  'Thomson Reuters': '汤森路透',
  'Jim Pattison Group': '吉姆·帕蒂森集团',
  'Brooklyn Nets': '布鲁克林篮网',
  'Binance': '币安',
  'Samsung': '三星',
  'Celltrion': '赛尔群',
  'Samsung Electronics': '三星电子',
  'Kakao': 'Kakao',
  'Barito Pacific': '巴里多太平洋',
  'Bayan Resources': '巴彦资源',
  'Djarum': '针记集团', 'Bank Central Asia': '中亚银行',
  'Charoen Pokphand Group': '正大集团',
  'Thai Beverage': '泰国酿酒',
  'Kuok Group': '郭氏集团', 'Shangri-La': '香格里拉',
  'Maxis': '明讯', 'Astro': 'Astro卫视',
  'Vista Land': '维斯塔地产',
  'International Container Terminal': '国际集装箱码头',
};

// ==================== 100 位全球知名富豪离线数据 ====================
function buildHardcodedBillionaires() {
  const raw = [
    // [中文名, 中文国籍, companies(英文供标签匹配), assets_billions]
    ['埃隆·马斯克',      '美国',     ['Tesla', 'SpaceX', 'xAI'],                      405],
    ['杰夫·贝佐斯',      '美国',     ['Amazon', 'Blue Origin'],                       244],
    ['马克·扎克伯格',    '美国',     ['Meta', 'Facebook', 'Instagram'],               245],
    ['拉里·埃里森',      '美国',     ['Oracle'],                                      290],
    ['沃伦·巴菲特',      '美国',     ['Berkshire Hathaway'],                          160],
    ['拉里·佩奇',        '美国',     ['Google', 'Alphabet'],                          158],
    ['谢尔盖·布林',      '美国',     ['Google', 'Alphabet'],                          150],
    ['比尔·盖茨',        '美国',     ['Microsoft'],                                   148],
    ['史蒂夫·鲍尔默',    '美国',     ['Microsoft'],                                   135],
    ['迈克尔·戴尔',      '美国',     ['Dell Technologies'],                           105],
    ['黄仁勋',            '美国',     ['Nvidia'],                                      120],
    ['伯纳德·阿尔诺',    '法国',     ['LVMH', 'Louis Vuitton', 'Dior'],               220],
    ['弗朗索瓦丝·贝当古', '法国',    ['L\'Oréal'],                                      90],
    ['弗朗索瓦·皮诺',    '法国',     ['Kering', 'Gucci'],                              40],
    ['阿兰·韦特海默',    '法国',     ['Chanel'],                                       42],
    ['杰拉尔·韦特海默',  '法国',     ['Chanel'],                                       42],
    ['阿曼西奥·奥特加',  '西班牙',   ['Inditex', 'Zara'],                             130],
    ['穆克什·安巴尼',    '印度',     ['Reliance Industries'],                         100],
    ['高塔姆·阿达尼',    '印度',     ['Adani Group'],                                  85],
    ['拉达基尚·达马尼',  '印度',     ['DMart', 'Avenue Supermarts'],                   25],
    ['希夫·纳达尔',      '印度',     ['HCL Technologies'],                             35],
    ['阿齐姆·普莱姆基',  '印度',     ['Wipro'],                                        12],
    ['吉姆·沃尔顿',      '美国',     ['Walmart'],                                      95],
    ['罗布·沃尔顿',      '美国',     ['Walmart'],                                      93],
    ['爱丽丝·沃尔顿',    '美国',     ['Walmart'],                                      90],
    ['菲尔·奈特',        '美国',     ['Nike'],                                         55],
    ['迈克尔·布隆伯格',  '美国',     ['Bloomberg LP'],                                 96],
    ['查尔斯·科赫',      '美国',     ['Koch Industries'],                              65],
    ['茱莉亚·科赫',      '美国',     ['Koch Industries'],                              64],
    ['米丽娅姆·阿德尔森', '美国',    ['Las Vegas Sands'],                              32],
    ['肯·格里芬',        '美国',     ['Citadel'],                                      42],
    ['史蒂芬·施瓦茨曼',  '美国',     ['Blackstone'],                                   38],
    ['阿比盖尔·约翰逊',  '美国',     ['Fidelity Investments'],                         32],
    ['托马斯·彼得菲',    '美国',     ['Interactive Brokers'],                          40],
    ['钟睒睒',            '中国',     ['Nongfu Spring', 'Wantai Biological'],           60],
    ['张一鸣',            '中国',     ['ByteDance', 'TikTok'],                          65],
    ['马化腾',            '中国',     ['Tencent', 'Riot Games'],                        50],
    ['马云',              '中国',     ['Alibaba', 'Ant Group'],                         35],
    ['黄峥',              '中国',     ['Pinduoduo'],                                    45],
    ['曾毓群',            '中国',     ['CATL'],                                         35],
    ['丁磊',              '中国',     ['NetEase'],                                      30],
    ['雷军',              '中国',     ['Xiaomi'],                                       15],
    ['刘强东',            '中国',     ['JD.com', 'JD Logistics'],                       12],
    ['王健林',            '中国',     ['Wanda Group'],                                  15],
    ['任正非',            '中国',     ['Huawei'],                                        5],
    ['何享健',            '中国',     ['Midea Group'],                                  30],
    ['王卫',              '中国',     ['SF Express'],                                   20],
    ['李书福',            '中国',     ['Geely', 'Volvo'],                               15],
    ['王传福',            '中国',     ['BYD'],                                          22],
    ['李嘉诚',            '中国香港', ['CK Hutchison', 'CK Asset'],                     36],
    ['李兆基',            '中国香港', ['Henderson Land'],                               28],
    ['柳井正',            '日本',     ['Fast Retailing', 'Uniqlo'],                     48],
    ['孙正义',            '日本',     ['SoftBank'],                                     25],
    ['滝崎武光',          '日本',     ['Keyence'],                                      22],
    ['迪特尔·施瓦茨',    '德国',     ['Schwarz Group', 'Lidl'],                        48],
    ['克劳斯·米夏埃尔·屈内', '德国', ['Kuehne + Nagel'],                               38],
    ['莱因霍尔德·伍尔特', '德国',    ['Wuerth Group'],                                 34],
    ['苏珊娜·克拉滕',    '德国',     ['BMW', 'Altana'],                                28],
    ['斯特凡·匡特',      '德国',     ['BMW'],                                          26],
    ['乔瓦尼·费列罗',    '意大利',   ['Ferrero', 'Nutella'],                           40],
    ['莱昂纳多·德尔·维奇奥', '意大利', ['Luxottica'],                                  28],
    ['乔治·阿玛尼',      '意大利',   ['Armani'],                                       13],
    ['帕特里齐奥·贝尔泰利', '意大利', ['Prada'],                                       16],
    ['西尔维奥·贝卢斯科尼', '意大利', ['Mediaset', 'AC Milan'],                         7],
    ['卡洛斯·斯利姆',    '墨西哥',   ['América Móvil', 'Grupo Carso'],                 85],
    ['赫尔曼·拉雷亚',    '墨西哥',   ['Grupo México'],                                 30],
    ['豪尔赫·保罗·莱曼', '巴西',    ['3G Capital', 'AB InBev'],                        18],
    ['爱德华多·萨维林',  '巴西',     ['Meta', 'Facebook'],                             32],
    ['马塞尔·特莱斯',    '巴西',     ['3G Capital', 'AB InBev'],                       12],
    ['卡洛斯·西库皮拉',  '巴西',     ['3G Capital', 'AB InBev'],                       12],
    ['阿利舍尔·乌斯马诺夫', '俄罗斯', ['USM Holdings', 'Metalloinvest'],               18],
    ['弗拉基米尔·波塔宁', '俄罗斯',  ['Norilsk Nickel'],                               28],
    ['弗拉基米尔·利辛',  '俄罗斯',   ['NLMK Group'],                                   26],
    ['列昂尼德·米赫尔松', '俄罗斯',  ['Novatek'],                                      27],
    ['阿列克谢·莫尔达绍夫', '俄罗斯', ['Severstal'],                                   22],
    ['瓦吉特·阿列克佩罗夫', '俄罗斯', ['Lukoil'],                                      23],
    ['根纳季·季姆琴科',  '俄罗斯',   ['Novatek', 'Sibur'],                             15],
    ['穆罕默德·本·萨勒曼', '沙特阿拉伯', ['Public Investment Fund', 'Aramco'],         900],
    ['纳塞夫·萨维里斯',  '埃及',     ['OCI N.V.', 'Adidas'],                            9],
    ['穆罕默德·曼苏尔',  '埃及',     ['Mansour Group', 'GM Egypt'],                    10],
    ['纳吉布·萨维里斯',  '埃及',     ['Orascom', 'Wind Telecom'],                       7],
    ['阿里科·丹格特',    '尼日利亚', ['Dangote Group'],                                15],
    ['约翰·鲁伯特',      '南非',     ['Richemont', 'Cartier'],                         13],
    ['尼基·奥本海默',    '南非',     ['De Beers', 'Anglo American'],                   10],
    ['吉娜·莱因哈特',    '澳大利亚', ['Hancock Prospecting'],                          30],
    ['安德鲁·福雷斯特',  '澳大利亚', ['Fortescue Metals'],                             18],
    ['迈克·坎农-布鲁克斯', '澳大利亚', ['Atlassian'],                                  18],
    ['斯科特·法夸尔',    '澳大利亚', ['Atlassian'],                                    17],
    ['詹姆斯·拉特克利夫', '英国',    ['INEOS'],                                        20],
    ['迈克尔·普拉特',    '英国',     ['BlueCrest Capital'],                            14],
    ['理查德·布兰森',    '英国',     ['Virgin Group'],                                  5],
    ['詹姆斯·戴森',      '英国',     ['Dyson'],                                        21],
    ['安德斯·波尔森',    '丹麦',     ['Bestseller', 'ASOS'],                           12],
    ['尼尔斯·路易斯-汉森', '丹麦',   ['Coloplast'],                                     7],
    ['凯尔·柯克·克里斯蒂安森', '丹麦', ['LEGO'],                                      12],
    ['大卫·汤姆森',      '加拿大',   ['Thomson Reuters'],                              55],
    ['吉姆·帕蒂森',      '加拿大',   ['Jim Pattison Group'],                           15],
    ['蔡崇信',            '加拿大',   ['Alibaba', 'Brooklyn Nets'],                     12],
    ['赵长鹏',            '加拿大',   ['Binance'],                                      30],
    ['李健熙家族',        '韩国',     ['Samsung'],                                      20],
    ['徐廷珍',            '韩国',     ['Celltrion'],                                    11],
    ['李在镕',            '韩国',     ['Samsung Electronics'],                          11],
    ['金范洙',            '韩国',     ['Kakao'],                                         6],
    ['彭云鹏',            '印度尼西亚', ['Barito Pacific'],                             50],
    ['刘德光',            '印度尼西亚', ['Bayan Resources'],                            28],
    ['黄惠忠',            '印度尼西亚', ['Djarum', 'Bank Central Asia'],                26],
    ['黄惠祥',            '印度尼西亚', ['Djarum', 'Bank Central Asia'],                25],
    ['谢国民',            '泰国',     ['Charoen Pokphand Group'],                       29],
    ['苏旭明',            '泰国',     ['Thai Beverage'],                                15],
    ['郭鹤年',            '马来西亚', ['Kuok Group', 'Shangri-La'],                     14],
    ['阿南达·克里希南',  '马来西亚', ['Maxis', 'Astro'],                                7],
    ['曼努埃尔·维拉尔',  '菲律宾',   ['Vista Land'],                                   10],
    ['恩里克·拉松',      '菲律宾',   ['International Container Terminal'],             12],
  ];

  return raw.map(([name, nationality, companies, assetsB], i) => {
    const companyText = companies.join(', ');
    const matchTags = mapIndustryToMatchTags(companyText + ' ' + name, nationality, name);
    const catchphrase = generateCatchphrase(name);
    // 公司名转中文便于前端展示，匹配仍用原始英文名
    const cnCompanies = companies.map(c => COMPANY_NAME_CN[c.trim()] || c).slice(0, 3);
    return {
      _id: `g${i}`,
      name,
      nationality,
      companies: cnCompanies,
      assets: assetsB * 1e9, // 转换为美元
      catchphrase,
      matchTags,
    };
  });
}

async function fetchBillionaireList() {
  console.log('🌐 正在从 Wikipedia 拉取 Forbes 富豪榜...');
  let wikitext;

  // 方案一：action=raw（最轻量）
  try {
    console.log('  尝试 action=raw ...');
    wikitext = await httpGet('https://en.wikipedia.org/w/index.php?title=The_World%27s_Billionaires&action=raw');
    console.log(`  ✅ raw 返回 ${wikitext.length.toLocaleString()} 字节`);
  } catch (e) {
    console.warn('  ⚠️ raw 失败:', e.message);
  }

  // 方案二：action=query
  if (!wikitext) {
    try {
      console.log('  尝试 action=query ...');
      const queryJson = await httpGet('https://en.wikipedia.org/w/api.php?action=query&titles=The_World%27s_Billionaires&prop=revisions&rvprop=content&format=json&origin=*');
      const queryData = JSON.parse(queryJson);
      const pages = queryData.query.pages;
      const pageId = Object.keys(pages)[0];
      if (pages[pageId].revisions?.[0]) {
        wikitext = pages[pageId].revisions[0]['*'];
        console.log(`  ✅ query 返回 ${wikitext.length.toLocaleString()} 字节`);
      }
    } catch (e) {
      console.warn('  ⚠️ query 失败:', e.message);
    }
  }

  // 方案三：action=parse（兜底）
  if (!wikitext) {
    try {
      console.log('  尝试 action=parse ...');
      const parseJson = await httpGet('https://en.wikipedia.org/w/api.php?action=parse&page=The_World%27s_Billionaires&prop=wikitext&format=json&origin=*');
      const parsed = JSON.parse(parseJson);
      if (parsed.parse?.wikitext) {
        wikitext = parsed.parse.wikitext['*'];
        console.log(`  ✅ parse 返回 ${wikitext.length.toLocaleString()} 字节`);
      }
    } catch (e) {
      console.warn('  ⚠️ parse 失败:', e.message);
    }
  }

  let billionaires;
  if (wikitext) {
    billionaires = parseWikiBillionaireTable(wikitext);
    console.log(`📊 成功解析 ${billionaires.length} 位富豪\n`);
    if (billionaires.length > 0) return billionaires;
  }

  // 离线兜底：使用内置的 100 位全球知名富豪数据
  console.log('📦 Wikipedia 不可用，切换到离线模式（内置 100 位知名富豪数据）');
  billionaires = buildHardcodedBillionaires();
  console.log(`📊 已加载 ${billionaires.length} 位富豪\n`);
  return billionaires;
}

// ==================== 商品生成引擎 ====================
const TAG_PRODUCT_TYPES = {
  // —— 居住地产 ——
    '超级豪宅':   ['比弗利山庄现代庄园', '汉普顿海滨别墅', '伦敦梅菲尔联排别墅', '迪拜棕榈岛海滨府邸', '迈阿密星岛水岸别墅', '圣特罗佩悬崖别墅', '阿斯彭滑雪度假屋', '马里布海滩玻璃别墅', '纽约第五大道顶层复式', '日内瓦湖畔别墅'],
    '私人岛屿':   ['巴哈马群岛私人岛屿', '马尔代夫环礁私人岛', '塞舌尔花岗岩私人岛', '斐济心形私人岛', '希腊爱琴海无人岛', '伯利兹灯塔珊瑚礁岛', '巴拿马珍珠群岛岛屿', '泰国普吉离岸小岛', '加拿大乔治亚湾木屋岛', '巴西安格拉杜斯雷斯岛'],
    '城堡庄园':   ['法国卢瓦尔河谷城堡', '苏格兰高地中世纪城堡', '德国巴伐利亚天鹅堡式城堡', '托斯卡纳橄榄庄园', '爱尔兰莱伊什郡古堡', '奥地利萨尔茨堡山顶城堡', '葡萄牙杜罗河谷酒庄', '英格兰科茨沃尔德庄园', '瑞士格劳宾登山谷牧场', '匈牙利巴拉顿湖城堡'],
    '云端公寓':   ['纽约432公园大道顶层', '伦敦海德公园一号顶层', '香港天玺顶层复式', '迪拜哈利法塔云端公寓', '东京六本木之丘顶层', '上海汤臣一品顶层', '新加坡滨海湾金沙顶层', '墨尔本尤里卡塔顶层', '迈阿密保时捷设计大厦顶层', '莫斯科联邦大厦顶层'],
  // —— 交通工具 ——
    '超级跑车':   ['布加迪赤龙超跑旗舰版', '柯尼塞格杰斯科绝对者', '帕加尼风神BC敞篷版', '法拉利赛道Evo混动版', '兰博基尼毒液敞篷限量', '迈凯伦速尾三座超跑', '阿斯顿马丁女武神赛道版', '保时捷918威萨赫套件版', '里马克绝电纯电超跑', '奔驰AMG一号F1引擎跑车'],
    '经典名车':   ['法拉利250GTO六二年荣誉版', '奔驰300SL鸥翼门五四年版', '捷豹E型初代老爷车', '阿尔法罗密欧8C千九B', '阿斯顿马丁DB5邦德座驾', '布加迪57型大西洋版', '保时捷550间谍小跑车', '谢尔比眼镜蛇427大排量', '玛莎拉蒂A6GCS双座赛车', '法拉利250红头赛车版'],
    '私人飞机':   ['湾流G700超远程公务机', '庞巴迪环球八千洲际机', '达索猎鹰10X旗舰', '波音公务机梦想宽体版', '空客公务机350尊享版', '赛斯纳经度号远航公务机', '本田公务机精英二代', '巴航工业执政官600', '湾流G650增程版', '皮拉图斯PC-24多功能'],
    '超级游艇':   ['乐顺127米超豪华游艇', '斐帝星破冰探险号', '海洋号107米环球探险艇', '达门53米支援保障艇', '希腊88米极简美学游艇', '日蚀号超级游艇复刻版', '圣劳伦佐73米钢铁游艇', '阿兹慕大三体甲板艇', '博纳多远洋拖网艇62', '公主游艇X95长程型'],
    '深海潜器':   ['特里顿三万六全海深潜器', '深水研究DSV-4探索者号', '幽艇工坊C-探索者5型', '海幻影极光六号潜水器', '海幻影深海探索者号', '幽艇工坊超级潜龙号', '特里顿6600耐压深潜器', '眩晕三座深潜观光球', '海洋探索NAUI深海探路者', '特里顿1700透明潜水器'],
  // —— 艺术收藏 ——
    '西方油画':   ['莫奈睡莲系列原作', '梵高向日葵静物油画', '毕加索蓝色时期肖像', '雷诺阿游艇午餐会', '莫迪利亚尼侧卧裸女', '塞尚圣维克多山系列', '德加芭蕾舞女粉彩画', '高更大溪地女人', '伦勃朗自画像蚀刻版', '维米尔戴珍珠耳环的少女'],
    '中国书画':   ['齐白石虾蟹图真迹', '张大千泼墨山水长卷', '徐悲鸿奔马图真迹', '傅抱石丽人行', '黄宾虹山水册页', '潘天寿鹰石图', '林风眠仕女图', '吴冠中江南水乡油画', '李可染万山红遍', '启功行书精品'],
    '当代艺术':   ['村上隆微笑太阳花大版画', '凯斯同伴巨型雕塑', '班克斯捣蛋鬼丝网版画', '达米恩赫斯特钻石骷髅', '奈良美智背后藏刀女孩', '草间弥生无限镜屋装置', '艾未未葵花籽装置', '安尼施卡普尔云门微缩', '大卫霍克尼平板绘画限量版', '杰夫昆斯气球狗大件'],
    '古董珍玩':   ['明成化斗彩鸡缸杯', '清乾隆粉彩转心瓶', '商晚期青铜饕餮纹鼎', '战国错金银带钩', '唐三彩骆驼载乐俑', '北宋天青釉汝窑盘', '元青花鬼谷子下山罐', '明永乐铜鎏金大威德金刚', '紫檀木嵌百宝花卉屏风', '明式黄花梨圈椅一对'],
  // —— 珠宝腕表 ——
    '传世腕表':   ['百达翡丽大师弦音6300A', '百达翡丽1518不锈钢万年历', '劳力士保罗纽曼迪通拿6263', '江诗丹顿阁楼工匠57260', '朗格1815追针万年历腕表', '爱彼皇家橡树万年历中国限定', '沛纳海埃及军团潜水腕表', '积家翻转三问报时腕表', '宝玑玛丽皇后怀表复刻版', '理查德米勒RM56-02蓝宝石'],
    '稀世珠宝':   ['格拉夫152克拉蓝钻戒指', '缅甸鸽血红5克拉无烧戒指', '克什米尔皇家蓝宝石铂金项链', '海瑞温斯顿钻石簇群耳坠', '卡地亚猎豹全钻满镶手镯', '蒂芙尼传奇黄钻缎带项链', '宝格丽灵蛇全钻腕表', '梵克雅宝拉链满钻长项链', '御木本南洋金珠典藏套装', '肖邦高级珠宝动物王国系列'],
  // —— 时尚服饰 ——
    '高级定制':   ['香奈儿刺绣工坊高定礼服', '迪奥蒙田大道高级定制长裙', '华伦天奴高定红绸晚礼裙', '范思哲高定水晶镶嵌礼服', '阿玛尼私享系列丝绸长袍', '丝黛拉麦卡特尼环保高定', '纪梵希高定褶皱雪纺礼服', '巴尔曼高定金属链甲裙', '艾莉萨博高定水晶串珠礼服', '高缇耶高定人鱼尾晚礼裙'],
    '奢侈包袋':   ['爱马仕喜马拉雅尼罗鳄铂金包', '爱马仕喜马拉雅凯莉包25号', '香奈儿钻石永恒经典口盖包', '迪奥戴妃包鳄鱼皮限定版', '路易威登城市指南行李箱套装', '戈雅西贡迷你稀有皮手袋', '德尔沃闪耀喜马拉雅限量版', '普拉达杀手包鳄鱼皮限定', '葆蝶家编织晚宴包经典款', '芬迪躲猫猫貂毛装饰手袋'],
    '名流礼服':   ['汤姆福特燕尾服全手工定制', '阿玛尼黑色西服套装', '萨维尔街亨斯曼定制晨礼服', '布里奥尼最高级别定制西装', '基顿K-50极致轻薄西装', '杰尼亚典藏系列西服套装', '安德森与谢泼德定制晚宴西装', '萨维利亚诺斯图尔特单排扣', '鲁宾纳奇红色晚礼长裙', '埃德亚多赫雷拉鸡尾酒裙'],
  // —— 美酒美食 ——
    '名庄红酒':   ['罗曼尼康帝特级园1945年份', '柏图斯酒庄1982年1.5升装', '勒桦酒庄慕西尼特级园', '拉菲古堡1787年杰斐逊签名版', '拉图尔酒庄1961年原木箱', '木桐酒庄1945年胜利年份', '玛歌酒庄1900年珍藏', '奥比昂酒庄1989年满分酒', '里鹏酒庄2005年双瓶装', '白马酒庄1947年传世佳酿'],
    '珍稀烈酒':   ['麦卡伦1926年60年单一麦芽', '轻井泽1960年雪莉桶', '山崎55年水楢桶', '大摩62年单一麦芽', '波摩1957年54年陈酿', '格兰菲迪50年珍稀典藏', '麦卡伦红标50年', '波特艾伦1978年稀有版', '布朗拉1972年珍藏版', '羽生扑克牌全套54瓶'],
    '顶级食材':   ['意大利阿尔巴白松露五百克', '伊朗钻石级鱼子酱', '日本5A级神户和牛整头', '蓝鳍金枪鱼大腹十公斤', '西班牙橡果饲养伊比利亚火腿', '法国贝隆空心铜蚝', '法国布雷斯蓝脚鸡', '日本静冈皇冠蜜瓜', '意大利布法拉水牛奶酪', '摩洛哥阿甘油野生坚果油'],
    '奢华雪茄':   ['高希霸贝伊可56周年限量', '特立尼达创建50周年陶瓷罐', '罗密欧与朱丽叶丘吉尔珍藏', '蒙特克里斯托1935系列', '帕特加斯雷蒙阿隆陈年', '大卫杜夫香槟王联名限量', '多米尼加富恩特禁果20年', '奥利瓦V系列梅拉尼奥', '德鲁庄园利加普利瓦达黑标', '古巴好友双皇冠1990'],
  // —— 家居生活 ——
    '设计师家具': ['让纳雷特昌迪加尔办公椅', '艾洛阿尼奥泡泡椅经典款', '汉斯韦格纳圆椅之王', '弗拉基米尔卡根蛇形沙发', '密斯凡德罗巴塞罗那椅', '勒柯布西耶LC4躺椅', '夏洛特佩里昂书架系统', '野口勇玻璃面咖啡桌', '芬恩尤尔酋长椅限量版', '保尔汉宁森松果吊灯'],
    '私人影院':   ['巨幕私人放映厅全套设备', '杜比全景声128声道系统', '克里斯坦森4K激光投影机', '斯图尔特16米画框透声巨幕', '巴可家用定制激光投影', '创诺顶级音频处理器', 'JBL极品定制音箱阵列', '智慧之声线声源入墙音箱', '普罗塞拉专业影院喇叭', '斯图尔特顶级定制透声幕'],
    '智能机器人': ['特斯拉擎天柱人形机器人', '波士顿动力斑点机器狗', '索菲亚表情交互机器人', '优必选行者S人形机器人', '小布家庭管家机器人', '大疆机甲大师教育机器人', '索尼爱宝机器狗第七代', '安基维克托桌面机器人', '莫克西儿童情感教育机器人', '菲戈工业送餐服务机器人'],
  // —— 运动休闲 ——
    '体育俱乐部': ['NBA球队多数股权', '英超足球俱乐部控股权', 'F1赛车队所有权', '美职棒大联盟球队股份', '美式足球球队限量股份', '西甲足球俱乐部股份', '法甲足球俱乐部有限合伙权', '印度板球超级联赛球队', '北美冰球俱乐部少数股权', '高尔夫莱德杯主队包厢'],
    '赛马竞技':   ['纯血阿拉伯马冠军血统', '纯血赛马种公马配种权', '肯塔基德比冠军马驹', '英国国家大赛参赛马匹', '迪拜世界杯马主冠名权', '皇家阿斯科特金杯包厢', '凯旋门赛马终身包厢', '墨尔本杯赛马马主资格', '香港杯国际赛马参赛权', '美丹世界杯赛马提名'],
    '高尔夫会籍': ['奥古斯塔国家俱乐部终身会籍', '圆石滩高尔夫球场终身会员', '圣安德鲁斯老球场终身全权', '辛尼克山高尔夫俱乐部会籍', '皇家墨尔本终身会员', '穆菲尔德终身会籍', '松树谷高尔夫终身会员', '北贝里克海岸林克斯会员', '柏树点俱乐部海洋球场会籍', '温特沃斯高尔夫俱乐部会员'],
    '极限装备':   ['翼装飞行服专业竞赛款', '8000米级连体高山羽绒服', '自由潜水碳纤维脚蹼', '钛合金冰镐技术冰攀套装', '速降山地碳纤维全避震车', '超高空跳伞翼伞装备', '直升机滑雪安全气囊背包', '冲浪大鱼板枪式长板', '深海技术潜水呼吸器套装', '雪崩三件套搜救器'],
  // —— 旅行体验 ——
    '太空旅行':   ['维珍银河亚轨道90分钟体验', '蓝色起源新谢泼德号11分钟飞行', '太空探索载人龙飞船7天轨道游', '公理空间国际空间站10天游', '俄罗斯联盟号轨道飞行体验', '太空视角平流层气球之旅', '零重力抛物线飞行体验', '火星模拟基地7天封闭式训练', 'NASA中性浮力实验室水下训练', '陨石坑探索直升机包机之旅'],
    '极地探险':   ['南极90°极点徒步探险', '北极点核动力破冰船之旅', '格陵兰冰盖七日穿越', '斯瓦尔巴北极熊追踪摄影', '挪威斯瓦尔巴种子库参观', '南极帝企鹅栖息地直升机游', '俄罗斯北极群岛七日探险', '加拿大巴芬岛冰川徒步', '阿拉斯加迪纳利峰登顶', '冰岛瓦特纳冰洞探险'],
    '赛事包厢':   ['超级碗五十码线总裁包厢', '奥斯卡杜比剧院前排包厢', '温布尔登皇家包厢终身权', 'F1摩纳哥大奖赛游艇包厢', '戛纳电影节红毯终身资格', '美国网球公开赛阿瑟阿什包厢', '肯塔基德比百万富翁大道', '欧冠决赛主席包厢席位', 'NBA总决赛场边前排季票', '劳力士大师赛VIP贵宾包厢'],
  // —— 另类收藏 ——
    '数字资产':   ['加密朋克外星人头像3100号', '无聊猿猴游艇俱乐部7090号', '菲登扎313号算法生成艺术', '指环者879号鹅之神作', '自绘文字128号原创生成', '彩色波浪完整色系套装', 'XCOPY右键保存我数字动图', '比普尔前五千天NFT授权', '去中心乐园黄金地块', '沙盒史努比狗狗邻地'],
    '军事藏品':   ['二战野马P-51战斗机修复实物', '退役M4谢尔曼坦克展品', '米格-21战斗机退役实机', '拿破仑时期燧发手枪实物', '奥斯卡二世级战列舰主炮', '二战虎式坦克履带实物断面', '英国喷火战斗机仪表盘', '美国M1加兰德步枪1942原品', '二战英菲尔德步枪四号马克一型', '战舰主炮弹壳黄铜工艺品'],
    '化石陨石':   ['霸王龙完整骨架化石', '三角龙头骨化石标本', '剑龙背板鳞甲化石', '沧龙完整脊椎化石', '猛犸象完整象牙化石', '始祖鸟柏林标本级化石', '雷克斯暴龙牙齿化石', '三叶虫群体化石标本板', '海百合化石大型标本', '鹦鹉螺化石抛光横截面'],
    '稀有书籍':   ['古腾堡圣经单页1454年', '莎士比亚第一对开本1623年', '牛顿自然哲学的数学原理初版', '达尔文物种起源初版1859年', '奥杜邦美洲鸟类双象本', '哥白尼天体运行论1543年初版', '亚当斯密国富论1776年初版', '霍布斯利维坦1651年初版', '洛克人类理解论1689年', '笛卡尔方法论1637年初版'],
    '乐器名琴':   ['斯特拉迪瓦里1715年克雷莫纳小提琴', '瓜奈里耶稣1742年大炮小提琴', '斯坦威D274象牙键音乐会三角钢琴', '法齐奥利F308印尼黑檀三角钢琴', '贝希斯坦D282总统系列钢琴', '瓜达尼尼1784年小提琴', '阿玛蒂家族1650年大提琴', '塞尔莫巴黎马克六次中音萨克斯', '吉布森1959年日落色电吉他', '芬达1954年元年款电吉他'],
    '电影道具':   ['星球大战达斯维达原版头盔', '回到未来时光车原道具复制品', '007阿斯顿马丁DB5道具车', '夺宝奇兵印第安纳琼斯原版鞭子', '哈利波特光轮2000扫帚原版', '指环王至尊魔戒拍摄原道具', '肖申克监狱蒂姆罗宾斯囚服', '罗马假日黄蜂牌踏板摩托车', '泰坦尼克号海洋之心项链道具', '黑客帝国尼奥黑色风衣'],
    '猛禽异宠':   ['阿拉伯纯血耐力赛马', '雪白孟加拉虎幼崽', '蒙古猎隼训练成熟个体', '黑豹幼年合法驯养', '白色非洲狮幼崽', '金雕哈萨克猎鹰训练个体', '亚马逊金刚鹦鹉彩虹配色', '白色帝企鹅特殊个体', '阿拉斯加雪橇犬赛级血统', '安哥拉巨兔巨型种'],
    '改造奇物':   ['波音747机身改造私人别墅', '退役核导弹发射井改建豪宅', '退役灯塔改豪华旋转套房', '双层巴士改移动总统套房', '二战碉堡改地下天堂别墅', '退役直升机改造胶囊旅馆', '火车车厢连接式度假屋', '集装箱架空玻璃别墅', '退役消防船改造水上民宿', '退役十字转门天文台'],
  // —— 其他 ——
    '贵金属':     ['四百盎司伦敦标准交割金条', '铂金锭一公斤收藏证书', '铑金属一盎司铸块', '瑞士精铸千足金条', '澳大利亚珀斯铸币厂金币', '加拿大皇家铸币厂纪念银币', '英国皇家铸币局不列颠金币', '中国熊猫金币全套', '南非克鲁格兰金币', '奥地利维也纳爱乐乐团金币'],
    '名流会所':   ['摩纳哥游艇俱乐部终身会籍', '香港赛马会全权会员', '伦敦安娜贝尔夜总会终身', '纽约苏富比理事会席位', '达沃斯世界经济论坛固定邀请', '太阳谷年度峰会终身资格', '波希米亚俱乐部永久会员', '纽约大都会艺术博物馆捐赠委员会', '温莎城堡嘉德勋章骑士', '法兰西学会荣军院院士席位'],
    '私人博物馆': ['弗兰克盖里设计私人美术馆', '安藤忠雄混凝土艺术馆', '扎哈哈迪德流体雕塑画廊', '伦佐皮亚诺玻璃穹顶收藏馆', '让努维尔光影雕塑展览馆', '大卫奇珀菲尔德极简博物馆', '隈研吾负建筑理念收藏空间', '妹岛和世通透玻璃画廊', '赫尔佐格与德梅隆改造工业空间', '彼得卒姆托温泉冥想展览馆'],
    '私人牧场':   ['蒙大拿黄石河万英亩牧场', '德克萨斯国王牧场育牛庄园', '新西兰南岛高地羊群牧场', '阿根廷巴塔哥尼亚安格斯牧场', '怀俄明落基山麋鹿狩猎牧场', '昆士兰内陆牛栏站牧场', '肯塔基蓝草纯血马育马场', '科罗拉多洛基山狩猎度假牧场', '苏格兰高地红鹿狩猎庄园', '乌拉圭大草原高乔牧区'],
    '私人酒庄':   ['波尔多左岸列级一等酒庄', '纳帕谷膜拜酒庄独立园', '托斯卡纳布鲁奈罗特级酒庄', '勃艮第特级园独占田酒庄', '巴罗萨谷百年老藤西拉酒庄', '香槟区白丘特级村酒庄', '杜罗河谷年份波特酒庄', '摩泽尔陡坡雷司令独占园', '里奥哈百年家族传承酒庄', '马尔堡长相思全景酒庄'],
    '古董枪支':   ['柯尔特1851海军型左轮原品', '史密斯威森44马格南六号', '温彻斯特1873连发步枪', '柯尔特和平缔造者1873型', '雷明顿1858新军型左轮', '毛瑟C96盒子炮原品', '鲁格P08炮兵型1917年', '柯尔特1911政府型1913年', '威伯利马克六型一战军官版', '斯普林菲尔德M1903狙击版'],
    '顶奢帐篷':   ['路易威登游牧帐篷套房', '丽思卡尔顿私人岛屿帐篷', '安缦度假村野奢帐篷', '辛吉塔石头城星空帐篷', '鹰岛营地奥卡万戈三角洲', '巴厘岛灵气竹帐篷', '马尔代夫索尼瓦水上帐篷', '非洲动物大迁徙移动营地', '蒙古可汗汗帐豪华版', '北极帆布极光泡泡帐篷'],
  '量子计算机': ['IBM量子系统One整机部署', '谷歌悬铃木超导量子处理器', '离子阱量子计算实验室', '量子纠错码研发套件', '超低温稀释制冷机', '量子比特测控电子学系统', '量子网络中继节点', '量子随机数发生器阵列', '量子机器学习算法授权', '量子计算云平台十年订阅'],
  '卫星星座': ['低轨宽带通信星座首批百星', '合成孔径雷达卫星星座', '高光谱地球观测卫星星座', '卫星激光星间链路组网', '地面站全球布网建设', '卫星测控中心专属建造', '星载AI边缘计算载荷', '卫星星座频率轨道权竞拍', '在轨加注延寿服务合同', '星座寿命末期离轨处理'],
  'AI服务器群': ['NVIDIA DGX H100八卡集群', '液冷GPU千卡训练集群', '定制AI推理专用服务器群', 'InfiniBand高速互联网络', '分布式存储PB级并行文件系统', 'AI训练集群能效优化运维', 'GPU集群弹性扩容服务', '模型并行训练框架定制', '集群安全隔离专用机房', 'AI算力调度平台开发'],
  '超级计算机': ['TOP500百PFLOPS定制超算', '液冷刀片计算节点千台', '高速互联网络InfiniBand全配', '并行文件系统百PB存储', '超算机房液冷基础设施', 'Linpack性能调优年度合约', '科学计算软件栈全套授权', '超算能效比优化咨询', '量子-经典混合计算节点', '超算数字孪生仿真平台'],
  '数据中心': ['T4级绿色数据中心建造', '模块化预制数据中心部署', '液冷散热系统全楼集成', '2N冗余电力保障架构', '园区级光伏储能微电网', '智能运维DCIM平台', '碳中和认证咨询全程', '物理安全多因素准入系统', '热回收区域供暖工程', '边缘计算节点全国布点'],
  '机器人军团': ['Optimus人形机器人编队', '库卡工业机械臂产线', '波士顿动力Spot巡检组', '自主移动机器人AMR车队', '机器人中央调度AI中台', '协作机器人柔性工位', '机器人远程运维数字孪生', '多机器人协同SLAM导航', '机器人视觉质检系统', '外骨骼助力装备批量采购'],
  '古籍修复': ['宋版书纸浆补洞修复', '敦煌遗书卷轴展开复原', '明代家谱虫蛀修复全套', '古籍脱酸处理批量工程', '古纸纤维分析扫描电镜', '拓片清洗展平装裱', '古籍数字孪生高精度扫描', '虫蛀修复纳米纤维素填充', '古籍函套金丝楠木定制', '修复师驻场合约年度'],
  '非遗技艺': ['缂丝龙袍织造复原项目', '南京云锦大花楼木织机', '景泰蓝掐丝珐琅百件套', '苏绣双面异色绣屏风定制', '龙泉青瓷冰裂纹大师窑', '扬州漆器点螺工艺台屏', '东阳木雕万工花轿复制', '南通蓝印花布印染工坊', '非遗大师研培计划赞助', '非遗数字化保护影像档案'],
  '传统工艺': ['大漆犀皮工艺茶则套装', '螺钿镶嵌紫檀木屏风', '金银错工艺玉壶春瓶', '剔红雕漆大捧盒定制', '铁画锻制山水四条屏', '斑铜工艺生斑花瓶', '银花丝掐丝珐琅首饰盒', '花丝镶嵌点翠凤冠复刻', '传统工艺传习所建设', '濒危工艺纪录片拍摄赞助'],
  '书法收藏': ['王羲之快雪时晴帖唐摹本', '颜真卿祭侄文稿宋拓本', '怀素自叙帖高清复制卷', '苏轼黄州寒食帖精印手卷', '赵孟頫洛神赋真迹', '董其昌行书长卷十米', '八大山人行草立轴', '于右任标准草书千字文', '明清状元翰林手札册页', '书法藏家俱乐部终身会员'],
  '茶道研习': ['宋代点茶全套金银茶具', '日本千家流茶道宗师私课', '建窑曜变天目盏收藏', '老铁壶龙文堂安之介', '备前烧宝瓶急须一套', '茶室数寄屋建筑定制', '煎茶道小川流皆传课程', '抹茶石臼手工挽茶体验', '武夷岩茶手工摇青制茶', '云南古树茶山参访特权'],
  '慈善基金': ['私人慈善基金会注册设立', 'DAF捐赠人建议基金设立', '家族公益信托法律架构', '慈善项目尽职调查年约', '基金会品牌战略咨询', '影响力评估SROI测算', '慈善晚宴年度策划执行', '公益创投组合管理', '家族二代慈善领导力培训', '国际慈善峰会理事席位'],
  '媒体帝国': ['全国性报纸控股权收购', '商业财经杂志全资并购', '数字媒体平台控股投资', '调查新闻编辑室专项资助', '纪录片制作公司收购', '播客网络全资运营', '媒体智库政策研究年费', '国际通讯社独家供稿协议', '新媒体内容分发算法平台', '媒体品牌整合营销全年'],
  '社交平台': ['垂直领域社交App全资收购', '私域流量SaaS平台开发', '名人经纪全约签约组合', '内容创作者MCN机构控股', '直播电商基地全套建造', '社群运营AI引擎定制', '短视频IP矩阵孵化', '社交电商小程序生态投资', 'KOL影响力数据中台', '粉丝经济变现策略咨询'],
  '影响力投资': ['ESG主题私募基金LP出资', '社会影响力债券认购', 'B型企业认证加速器投资', '清洁技术VC基金LP份额', '发展中国家小额信贷基金', '可持续农业供应链投资', '普惠金融科技平台投资', '可负担住房开发基金', '蓝色经济海洋保护投资', '影响力投资组合年度审计'],
  '海洋保护': ['海洋保护区百万平方公里冠名', '珊瑚礁修复五年计划', '深海科考船专属建造', '海洋塑料回收闭环系统', '蓝碳生态系统碳汇认证', '海草床生态修复工程', '鲸豚类声学监测网络', '海洋保护科研基金冠名', '可持续渔业MSC认证推进', '海洋环境DNA监测站网'],
  '雨林保护': ['亚马逊雨林私人保护区购置', '刚果盆地生物多样性保护', '碳汇林百万亩种植投资', '热带雨林冠层步道科研站', '原住民社区共管保护协议', '雨林物种DNA条形码建档', '非法砍伐卫星监控系统', '林下经济可持续采收认证', '雨林生态旅游精品营地', '雨林保护信托基金永续运营'],
  '野生动物保护': ['非洲反盗猎基金会冠名', '犀牛物种基因库冷冻保存', '雪豹栖息地保护社区共建', '穿山甲救助康复中心建造', '候鸟迁飞通道保护地购置', '大象走廊生态连通工程', '珍稀物种AI识别监控网', '野生动物法医实验室设备', '保护地生态补偿机制设计', '野生动物摄影纪录基金'],
  '非洲艺术': ['贝宁王国青铜头像19世纪', '马孔德乌木家族树雕', '努比亚彩绘葬礼面具', '非洲部落酋长权杖真品', '非洲艺术恒温干燥储藏柜', '非洲部落纹饰鉴定专家', '木雕防虫防裂处理', '部落面具矿物颜料分析', '非洲织锦挂毯装裱', '部落仪式鼓修复调音'],
  '伊斯兰艺术': ['波斯萨法维时期细密画', '奥斯曼帝国苏丹书法手卷', '大马士革乌兹钢刀18世纪', '阿拉伯鎏金古兰经手抄本', '伊斯兰艺术恒温低光展柜', '波斯地毯真伪纤维鉴定', '大马士革刀剑研磨修复', '阿拉伯书法大师认证', '伊斯兰几何图案数字化', '伊兹尼克瓷砖修复拼接'],
  '佛教艺术': ['犍陀罗风格佛陀立像3世纪', '西藏勉唐画派彩绘唐卡', '明代铜鎏金度母坐像', '泰国素可泰行走佛铜像', '恒温恒湿佛龛定制', '唐卡矿物颜料光谱检测', '佛像金箔贴金修复', '佛教艺术文物来源认证', '寺庙古建木雕修复', '敦煌壁画数字化复原'],
  '摄影大师': ['安塞尔亚当斯月升签名原作', '安妮莱博维茨列侬最后肖像', '杉本博司海景系列铂金印相', '赫尔穆特纽顿大裸体系列', '博物馆级无酸摄影盒', '照片银盐冲洗暗房全套', '摄影作品紫外线过滤框', '铂金印相工艺大师课程', '限量摄影作品编号认证', '摄影集手工装订皮面'],
  '翡翠玉器': ['缅甸老坑玻璃种帝王绿手镯', '紫罗兰翡翠佛公吊坠', '冰种飘花翡翠平安扣', '翡翠红外光谱真伪检测', '翡翠恒温保湿储藏柜', '翡翠雕刻大师年度合约', '缅甸公盘原石竞标代理', '翡翠断裂金缮修复', '冰种起胶荧光评级', '翡翠珠链重新打孔穿绳'],
  '珍珠珊瑚': ['南洋金珠16毫米完美正圆项链', '海螺珠火焰纹单颗戒指', '日本Akoya天女珍珠套装', '深海红珊瑚阿卡级雕刻摆件', '珍珠打孔穿线年度保养', '珍珠层厚度X光检测', '珊瑚合法来源CITES认证', '珍珠恒温恒湿首饰盒', '大溪地黑珍珠孔雀绿评级', '海螺珠火焰纹密度分析'],
  '独立制表': ['Philippe Dufour Simplicity腕表', 'F.P.Journe Chronometre Bleu', 'Roger Smith Series 2手工表', 'Kari Voutilainen Vingt-8腕表', '独立制表师驻场定制年约', '制表工坊全套工具设备', '瑞士汝拉山谷制表学徒赞助', '独立制表拍卖专场代拍', '珐琅盘微型绘画定制', '独立制表师协会AHCI会员'],
  '彩色钻石': ['Argyle阿盖尔粉钻珍藏套', '慕佐绿钻天然彩钻裸石', '蓝月亮蓝钻IIb型单颗', '格拉夫红钻幻彩系列', '彩钻GIA分级证书全套送检', '彩钻色彩增强激光处理', '彩钻收藏恒温低光展示柜', '彩钻产地溯源激光铭刻', '彩钻投资组合年度精算', '彩钻私人预览拍卖会VIP'],
  '顶级鞋履': ['伯尔鲁帝牛津鞋全手工缝制', '约翰罗布定制皮鞋', '维利耶鳄鱼皮乐福鞋', '固特异沿条换底大修', '鞋楦3D脚型扫描定制', '皮鞋手工擦色渐变护理', '鞋撑雪松木定制雕刻', '鳄鱼皮鞋面补水养护', '鞋底真皮前掌加贴', '定制鞋盒恒温恒湿'],
  '丝巾披肩': ['爱马仕王者之马90方巾限定', '喀什米尔沙图什羊绒披肩', '西藏山羊绒手工织造披肩', '丝巾恒温无酸平铺保存柜', '丝巾手工卷边修复', '羊绒防虫防蛀气相处理', '丝巾装裱无酸画框', '喀什米尔绒毛细度检测', '爱马仕丝巾年份图鉴大全', '羊绒披肩恒温雪松木盒'],
  '定制眼镜': ['Lotos铂金钻石镜框', '林德伯格钛丝无螺丝镜框', '卡地亚猎豹系列18K金镜', '蔡司个性化i.Scription镜片', '验光大师全息眼底扫描', '镜框3D面部扫描定制', '铂金镜框手工抛光', '镜片防蓝光纳米镀膜', '眼镜恒温恒湿收藏盒', '钻石镜片切割定制'],
  '帽饰收藏': ['皇家赛马会定制Sinamay礼帽', '菲利普崔西蝶恋花帽饰', 'Montecristi巴拿马草帽极品', 'Borsalino古董兔毛Fedora', '帽饰恒温恒湿展示帽箱', '礼仪帽饰佩戴顾问年聘', '古董帽子羽毛装饰修复', '帽饰展览策展赞助', '泰国皇冠级茉莉香米草帽', '帽子设计师私人定制年约'],
  '名茶珍藏': ['武夷山母树大红袍20克', '普洱百年金瓜贡茶', '福鼎老白茶50年陈韵', '西湖龙井御前十八棵', '专业茶仓恒温恒湿建造', '国家茶艺技师年聘', '紫砂壶大师手工定制', '宋代建盏修复收藏', '武夷岩茶手工摇青制茶', '云南古树茶山参访特权'],
  '精品咖啡': ['巴拿马翡翠庄园瑰夏生豆', '印尼猫屎咖啡野生精选', '牙买加蓝山一号瓦伦福德庄园', '专业咖啡烘焙机Probat', 'Q-Grader品鉴师年聘', '咖啡庄园产地直采旅行', '手冲咖啡金滤杯套装', '咖啡生豆恒温恒湿仓储', '意式浓缩咖啡机Slayer', '拉花大师私教课程'],
  '巧克力大师': ['阿梅代Porcelana单源黑巧', '皮尔马可里尼心形宝石系列', '图尔黛堡嘉雅单一年份', '可可豆庄园私人定制采收', '巧克力恒温熟成柜', '巧克力雕塑艺术大师定制', '松露巧克力手工滚制课程', '可可脂含量精密检测', '金箔食用级巧克力包装', '比利时巧克力工坊包场'],
  '私厨服务': ['米其林三星主厨驻场一年', '寿司之神小野二郎私宴', '法国蓝带主厨上门定制', '私人厨房全套Molteni设备', '侍酒师随餐搭配服务', '名厨料理培训私教课', '食材溯源全球采购服务', '定制餐具Bernardaud套装', '主题晚宴策划全包', '餐后雪茄威士忌搭配'],
  '稀有蜂蜜': ['安第斯山榛子蜜限量采收', '新西兰麦卢卡UMF28+野生蜜', '土耳其松蜜安纳托利亚高原', '也门锡德蜜瓦迪多安峡谷', '喀尔巴阡山脉菩提花蜜', '蜂蜜核磁共振溯源鉴定', '蜂蜜恒温结晶控制储藏柜', '蜂王浆活性酶保持冷链', '稀有蜂蜜品鉴大师课程', '全球蜜源植物园建设'],
  '奢华卫浴': ['卡拉拉大理石双人浴缸', 'THG定制黄金水龙头套装', '蒸汽SPA湿蒸房全套', '智能马桶TOTO诺锐斯特', '地暖恒温大理石地面', '汉斯格雅雨水瀑布花洒', '浴室B&O防水音响', '桑拿房芬兰云杉木建造', '恒温毛巾架电热烘干', '浴室天然香薰雾化系统'],
  '顶级床品': ['海丝腾Vividus手工床垫', '冰岛雁鸭绒被限量版', '意大利真丝床品四件套', '定制睡眠姿势人体工学枕', '床垫恒温通风干燥系统', '卧室全遮光电动窗帘', '床上用品紫外线杀菌柜', '埃及长绒棉1000支床单', '羽绒被蓬松度专业检测', '睡眠教练年度顾问'],
  '艺术灯具': ['穆拉诺岛手工水晶吊灯', '英戈毛雷尔飞鸟光雕吊灯', '蒂芙尼玻璃彩绘台灯', '智能全屋灯光场景编程', '古董水晶灯清洗重组', '灯光设计师年度顾问', '熔融玻璃艺术壁灯', '博物馆级LED无紫外射灯', '金箔灯罩手工锤纹', '光纤星空天花板系统'],
  '室内泳池': ['奥林匹克标准50米恒温泳池', '星空光纤天幕照明系统', '水下Bose环绕音响', '泳池逆流训练造浪器', '恒温除湿泳池空气处理', '池底自动清洁机器人', '泳池边下沉式吧台', '水下观景玻璃幕墙', '盐水电解氯发生器系统', '泳池水疗按摩喷头阵列'],
  '帆船竞技': ['美洲杯AC75水翼单体帆船', '激光级奥运标准竞赛帆船', '沃尔沃环球帆船赛赛船', '帆船碳纤维桅杆更换', '航海导航电子海图订阅', '专业帆船教练年度合约', '帆船帆布3Di碳纤维定制', '防海水腐蚀船体涂层', '国际帆联比赛注册费', '帆船冬季干仓存放'],
  '击剑马术': ['奥运级重剑定制平衡款', '盛装舞步荷兰温血马', '马球专用阿根廷矮马', '击剑电子裁判记分系统', '马术场地纤维沙地铺设', '击剑面罩FIE认证款', '马匹盛装舞步音乐编排', '击剑私人教练年度合约', '马术障碍赛全套障碍栏', '马术皮靴手工量脚定制'],
  '武术格斗': ['巴西柔术黑带大师私教年课', '咏春木人桩金丝楠木定制', '泰拳曼谷训练营一月全包', '八角笼MMA全套训练设备', '格雷西家族柔术道服', '太极拳陈氏宗师传承课', '空手道极真派黑带考试', '拳击沙袋真皮手工缝制', '综合格斗营养定制餐', '武术器械龙泉古法刀剑'],
  '飞钓狩猎': ['苏格兰斯佩河飞蝇钓季票', '非洲博茨瓦纳游猎Safari', '新西兰南岛红鹿狩猎', '飞蝇钓手工绑制毛钩套装', '定制猎枪Blaser R8', '飞钓向导苏格兰双河年约', '猎犬训练师年度合约', '狩猎庄园专属木屋建造', '飞钓溪流生态保育基金', '野生动物标本博物馆级制作'],
  '风筝冲浪': ['竞速风筝Ozone R1 V4全套', '碳纤维水翼板Moses定制', '全球最佳浪点巡回年卡', '风筝冲浪IKO教练私教', '干衣潜水保暖风筝冲浪服', 'GoPro风冲360°摄影套装', '水上救援摩托艇保障', '风冲装备恒温干燥存储柜', '风冲运动损伤防护课程', '风冲洲际锦标赛报名费'],
  '古城私旅': ['吉萨金字塔闭门夜游', '吴哥窟日出私人导览', '佩特拉之夜烛光专属', '马丘比丘日出直升机到达', '古城专属考古学家讲解', '私人飞机古城间接驳', '古城遗址酒店包场', '古迹3D扫描VR预演', '法老墓室闭门摄影许可', '古城私厨废墟晚宴'],
  '火山探险': ['夏威夷基拉韦厄火山口直升机', '冰岛瑟利赫努卡休眠火山内部', '埃特纳火山夜间熔岩徒步', '活火山热成像无人机探测', '火山学家私人讲解日费', '火山探险耐高温防护服', '火山口边缘露营许可', '熔岩管洞穴探照灯套装', '地热温泉私人泡池建造', '火山灰土壤矿物分析'],
  '水下酒店': ['马尔代夫康拉德海底套房', '三亚亚特兰蒂斯海底套房', '迪拜亚特兰蒂斯波塞冬套房', '水下酒店专属快艇接驳', '海底卧室全景灯光调节', '水下管家24小时服务', '私人潜水教练一对一', '海底餐厅烛光晚餐', '水下Spa按摩疗程', '海洋生物学家讲解导览'],
  '地心探险': ['冰岛Thrihnukagigur火山内部', '全球最深Krubera洞穴探底', '废弃深矿井垂直下降探险', '地心探险SRT单绳技术培训', '探洞装备Petzl专业全套', '洞穴生物荧光摄影器材', '洞穴3D激光扫描建模', '洞穴救援专项保险年缴', '洞穴探险卫星通讯套装', '全球洞穴深度排行榜挑战'],
  '钱币邮票': ['1840年黑便士错版四方连', '中国大龙邮票全套', '古罗马奥雷乌斯金币凯撒时期', '钱币NGC权威评级送检', '恒温恒湿钱币收藏柜', '稀有纸钞PMG封装评级', '钱币拍卖行VIP代拍', '邮票齿孔显微检测', '错版币X光金属成分分析', '贵金属纪念币首发认购'],
  '矿物晶体': ['海蓝宝石与云母共生晶簇', '巴西紫水晶巨型晶洞', '哥伦比亚祖母绿晶体原石', '矿物晶体定制LED展示柜', '矿物硬度莫氏计精密检测', '晶体X射线衍射成分分析', '矿物产地直升机勘探', '晶洞切割抛光大师服务', '荧光矿物紫外灯箱展示', '图森矿物展VIP参展'],
  '昆虫标本': ['亚历山大女王鸟翼蝶完整标本', '彩虹锹甲荧光色型标本', '长戟大兜虫巨型个体标本', '博物馆级防虫恒温标本柜', '昆虫学家鉴定分类合约', '蝴蝶标本展翅整形', '甲虫标本软化解剖', '昆虫标本防褪色UV喷涂', '巴黎昆虫博览会VIP', '昆虫微距摄影设备全套'],
  '烟斗收藏': ['登喜路死根Bruyere老斗', '卡斯特罗收藏级雕刻烟斗', '丹麦大师SixtenIvarsson手工斗', '烟斗恒温恒湿陈化柜', '海泡石烟斗发色养护', '烟斗专业翻新大师年约', '石楠木烟斗碳层重建', '烟斗银饰箍圈手工抛光', '国际烟斗慢抽比赛报名', '烟斗烟草窖藏罐陈化'],
  '地图手稿': ['墨卡托1569年世界地图', '大明混一图洪武年彩绘', '波特兰航海图羊皮纸手稿', '地图恒温恒湿平铺储藏柜', '古地图修复大师年聘', '羊皮纸脱酸加固处理', '地图墨水光谱成分分析', '古地图数字化高精度扫描', '地图手稿收藏防伪鉴定', '16世纪星图镀金装裱'],
  '文房清玩': ['端砚老坑鱼脑冻随形砚', '田黄石薄意雕山水印章', '明代宣德炉蚰耳铜炉', '文房恒温恒湿储藏多宝阁', '文房器物鉴定专家年聘', '田黄石萝卜丝纹鉴定', '端砚石品石眼分级评估', '印泥朱砂手工炼制', '宣德炉皮壳包浆养护', '文人篆刻定制闲章'],
  '瓷器修复': ['宋代建窑油滴天目盏金缮', '元代青花缠枝牡丹纹梅瓶', '南宋龙泉窑粉青釉凤耳瓶', '金缮修复大漆艺术家年约', '瓷器断层X光探伤检测', '碎瓷片拼合三维建模', '日本莳绘金继修复课程', '古陶瓷热释光年代测定', '破损瓷器无痕黏合', '宋代窑址考察旅行'],
  '民族服饰': ['清代乾隆龙袍刺绣真品', '印第安酋长羽毛战冠', '日本江户时代打卦振袖', '民族服饰恒温防虫展示柜', '纺织品碳14年代测定', '民族刺绣矿物染料分析', '龙袍缂丝织造工艺复原', '服饰防紫外线无酸保存', '民族服饰鉴定专家年聘', '苗族银饰全套头冠'],
  '船舶模型': ['皇家海军胜利号博物馆级模型', '泰坦尼克号全木手工复原', '清代福船帆船精细模型', '瓶装船工艺大师定制', '模型船坞场景微缩景观', '船模桅杆索具精密编织', '模型船体铜皮覆盖工艺', '古董船模拍卖会VIP', '船模工作室恒温恒湿陈列', '国际船模锦标赛参赛'],
  '古董相机': ['徕卡0系列原型机编号112', '哈苏500EL登月纪念款', '大画幅Deardorff木机8x10', '禄来双反2.8F白脸版', '镜头光学MTF曲线检测', '相机快门精度校准年检', '古董相机恒温防霉干燥柜', '银盐胶片冷存储零下20度', '古董相机拍卖专场VIP', '大画幅湿版摄影全套药水'],
  '标本收藏': ['Blaschka玻璃海洋生物模型', '19世纪植物解剖图谱原册', '维多利亚时期鸟类骨骼标本', '琥珀内含昆虫化石精品', '标本恒温防虫博物馆级盒', '标本修复大师年度合约', '蝴蝶标本UV防护展示框', '显微切片标本全套器材', '标本产地溯源DNA鉴定', '自然史博物馆标本交换VIP'],
  '雕塑艺术': ['罗丹思想者原作青铜铸造', '贾科梅蒂行走的人系列', '亨利摩尔斜倚人体石雕', '布朗库西空中之鸟抛光铜', '室外雕塑防锈蚀处理年约', '雕塑基座防震基础工程', '博物馆级雕塑恒温展示厅', '大型雕塑运输吊装工程', '雕塑3D扫描版权认证', '国际雕塑双年展参展费'],
  '数字版画': ['Beeple Everydays精选十件', 'Hackatao数字绘画原作授权', 'Fewocious青春肖像系列', '4K微发光显示数字画框', '数字版权NFT铸造链上确权', '数字艺术收藏室恒温LED墙', '加密艺术策展年度顾问', '数字版画画廊虚拟展厅搭建', 'AR增强现实数字艺术叠加', '数字艺术品保险冷存储'],
  '大师私塾': ['诺贝尔物理学奖得主一对一讲座', '哈佛大学哲学大师研讨课', '硅谷传奇CEO导师私教年课', '私人定制跨学科课程体系', '大师手稿亲笔批注收藏', '学术研讨会赞助冠名', '常春藤名校访学通道', '哲学经典精读一对一', '大师联名推荐信撰写', '全球顶级智库闭门研讨会'],
  '语言精通': ['母语级沉浸式语言环境定制', '濒危语言田野调查抢救学习', '联合国同声传译大师私教', '多语种脑科学记忆训练', '语言学习神经反馈设备', '外语环境全真模拟舱', '古典拉丁语希腊语精研', '书法与汉字文化深度课', '方言田野录音档案收藏', '多语言图书馆建造'],
  '科研赞助': ['冠名大学前沿科学实验室', '诺奖级课题定向研究资助', '博士全额奖学金冠名计划', '科研设备电镜超算捐赠', '科学期刊封面论文赞助', '青年科学家创新基金', '国际学术会议冠名主办', '科研卫星数据购买共享', '基因测序项目定向资助', '深海科考航次冠名'],
  '私人智库': ['全球地缘政治每日简报', '家族财富传承战略规划', '行业竞争情报分析年报', '诺贝尔经济学奖得主顾问年约', '宏观经济模型定制预测', '全球政策风险评估周报', '家族办公室合规风控', '跨境税务优化策略', '慈善基金会战略规划', '危机公关24小时响应'],
  '抗衰医美': ['脐带间充质干细胞存储20年', '基因编辑长寿干预套餐', '个性化抗衰老药物定制', '长寿诊所年度综合体检', '端粒长度检测追踪服务', 'NAD+静脉输注年度疗程', '高压氧舱家用版安装', '冷冻治疗全身康复舱', 'DNA甲基化年龄时钟检测', '生物黑客实验室全套设备'],
  '私人医疗': ['24小时私人全科医生团队', '家庭MRI磁共振设备安装', '空中医疗转运国际SOS年约', '全基因组测序及解读', '私人手术室全套建造', '全球顶级专家远程会诊', '定制疫苗研发优先权', '医疗档案区块链安全存储', '私人牙科诊所全套设备', '年度全身PET-CT早癌筛查'],
  '温泉疗养': ['日本箱根温泉旅馆私有化', '冰岛蓝湖地热疗养庄园', '瑞士洛伊克巴德温泉酒店', '私人温泉池矿物质配比', '火山泥浆身体护理疗程', '温泉水中运动康复理疗', '日式露天风吕庭院建造', '温泉度假村专属管家', '地热水源钻探工程', '温泉Spa香薰精油定制'],
  '心灵修行': ['喜马拉雅山闭关禅修营', '内观冥想十日课程VIP', '喜马拉雅瑜伽大师年聘', '声音疗愈水晶颂钵全套', '森林浴自然疗愈指导', '心灵导师一对一私教', '芳香疗法精油实验室', '呼吸法大师进阶工作坊', '静修中心建筑设计', '寺院短期剃度体验'],
  '私人花园': ['切尔西花展金牌花园复刻', '京都龙安寺枯山水庭院', '莫奈花园吉维尼风格复刻', '皇家园林设计师年聘', '珍稀植物温室恒温建造', '盆景大师松柏修剪年约', '玫瑰园千品种种植', '日式禅园砂纹耙制', '私家园林水景瀑布工程', '兰花温室恒温恒湿'],
  '宠物乐园': ['赛级犬专用恒温犬舍建造', '纯血赛级猫繁育中心', '宠物专属恒温游泳池', '宠物心理学行为训练师', '犬类敏捷竞技赛训练', '宠物美容SPA全套设备', '宠物专属营养师饲料定制', '宠物DNA基因检测建档', '宠物医疗MRI专属设备', '宠物托管豪华酒店年卡'],
  '香氛定制': ['格拉斯调香大师专属配方', '沉香奇楠沉水级收藏', '鸢尾花净油顶级香材', '私人香水实验室全套建造', '调香大师年度合作合约', '香精天然原料全球采集', '古董香水瓶巴卡拉水晶', '沉香GC-MS成分鉴定', '香水陈化恒温恒湿窖藏', '香氛蜡烛手工浇制定制'],
  '飞行汽车': ['Aeromobil 5.0飞行汽车', 'PAL-V Liberty先锋版', 'Klein Vision空中超跑', '飞行汽车垂直起降机库建造', '飞行驾照SPL双证培训', '城市低空航线年度申请', '飞行汽车航电升级套件', '有机玻璃全透座舱改装', '地面空中双模保险年缴', '飞行汽车专属维护技师年聘'],
  '电动摩托': ['Zero SR/F全电动街车', 'LiveWire ONE哈雷电摩', 'Energica Ego+电动超跑', '家用直流快充桩安装', '电动摩托赛道体验日年卡', '电池管理系统BMS升级', '碳纤维车身套件定制', '电动摩托专属保险年缴', '电机磁钢升级性能套件', 'MotoE赛事VIP围场通行'],
  '古董服装': ['维多利亚时期宫廷舞会礼服', '1920年代Flapper流苏裙装', '爱德华时期白色茶会礼裙', '拿破仑时期帝国高腰长裙', '古董服装恒温无酸保存柜', '纺织品碳14年代测定', '古董蕾丝手工修补织造', '历史服饰博物馆级展示', '古董婚纱收藏系列', '维多利亚与阿尔伯特博物馆私访'],
  '智能厨房': ['Molteni全智能厨电套装', '分子料理设备Rotaval蒸发仪', '自动配菜机器人Moley系统', '厨房AI菜谱创作引擎', '恒温恒湿食材储藏墙', '水培香草种植墙集成', '智能厨房语音助手定制', '低温慢煮循环水浴系统', '真空包装急速冷冻干燥机', '厨房中岛大理石台面定制'],
  '家庭酒窖': ['岩壁开凿天然恒温酒窖', '指纹识别恒温玻璃展示墙', '私人品酒沙龙全橡木装修', '酒窖恒温恒湿空调冗余', '紫外线过滤LED窖藏照明', '定制酒架法国橡木手工', '雪茄保湿与烈酒品鉴区', '防震防光藏酒运输保险', '老酒窖藏投资顾问年聘', '酒窖智能库存RFID管理'],
  '热气球': ['Cameron定制热气球编队', '跨国气球节VIP专属营地', '高空香槟早午餐体验包年', '热气球私人飞行员年聘', '热气球吊篮真皮奢华改装', 'GPS气象追踪领航系统', '热气球夜航灯火秀设备', '喜马拉雅山脉热气球探险', '热气球包球广告定制', '热气球节冠名赞助'],
  '深空观测': ['私人天文台圆顶全自动建造', '一米级RC反射望远镜', '射电望远镜阵列校园级', '制冷CCD深空摄影系统', '光谱仪恒星成分分析套件', '天文台圆顶自动气象站', '自适应光学大气补偿', '远程天文台观测时租赁', '小行星搜寻公民科学项目', 'IAU天文命名权申请'],
  '太阳能农场': ['吉瓦级单晶硅光伏电站', '农光互补智能跟踪支架', '钙钛矿叠层电池示范阵列', '光伏电站智能运维机器人', '光储一体化液流电池储能', '电站SCADA监控系统', '绿电直购PPA十年合约', '光伏组件回收循环生产线', '太阳能热发电熔盐储热塔', '新能源发电碳积分交易'],
  '风能投资': ['海上风电场12MW机组阵列', '陆上风电低风速区智慧风场', '漂浮式海上风电基础平台', '风电叶片碳纤维工艺升级', '风电场鸟类雷达监测保护', '风力发电机状态监测CMS', '风电输出功率预测AI模型', '风电运维服务船专属建造', '可再生能源绿证批量认购', '海外风电资产组合并购'],
  '森林树屋': ['哥斯达黎加雨林树冠别墅', '瑞典哈拉斯树屋酒店复刻', '加拿大红杉林悬空树屋群', '树屋结构碳纤维加固', '树冠之间索道交通系统', '全生态雨水收集净化', '林间温泉泡池建造', '树屋专用防火涂层喷涂', '鸟类观察隐藏式摄影棚', '树屋太阳能微电网'],
  '沙漠行宫': ['阿布扎比安纳塔拉沙漠行宫', '摩洛哥撒哈拉沙丘城堡', '迪拜沙漠绿洲庄园', '沙漠地下水井钻探工程', '沙暴防御自动幕墙', '绿洲棕榈园林景观', '沙漠星空玻璃穹顶卧室', '骆驼马厩及训练场', '沙漠越野车库全配', '传统土耳其浴室建造'],
  '水下别墅': ['马尔代夫康莱德海底套房', '迪拜棕榈岛水下别墅', '大堡礁水下观景居所', '全景亚克力海底卧房', '水下气压调节系统', '珊瑚养殖专属礁区', '水下灯光生态系统', '海洋生物声呐监测', '潜艇停靠气闸舱', '海底光纤通讯铺设'],
  '雪山庄园': ['阿尔卑斯山滑雪进出庄园', '落基山脉阿斯彭滑雪别墅', '北海道二世谷温泉庄园', '室内外恒温滑雪通道', '雪崩预警气象雷达站', '直升机滑雪专属停机坪', '地热融雪车道系统', '壁炉原木恒温储藏室', '雪山温泉露天浴池', '缆车直达私人站台'],
  '私人农场': ['蒙大拿黄石河万英亩有机农场', '新西兰南岛高地牧场私有化', '意大利托斯卡纳橄榄庄园', '精准农业卫星导航播种系统', '有机认证转换三年计划', '农场风光互补微电网', '冷链仓储物流中心建造', '农业物联网传感器全覆盖', '和牛繁育胚胎移植项目', '农场到餐桌品牌直营餐厅'],
  '生态庄园': ['零能耗被动式生态别墅', '灰水黑水循环湿地处理', '垂直农场温室供全年食材', '地源热泵中央能源系统', '生物多样性庭院景观设计', '太阳能制氢储能系统', '雨水收集千吨地下蓄水池', '生态庄园BREEAM卓越认证', '碳中和年度核查与碳抵消', '自循环鱼菜共生养殖系统'],
  '文化遗产建筑': ['巴黎左岸18世纪公馆改造', '威尼斯大运河宫殿产权收购', '苏格兰高地古堡现代化翻新', '北京四合院文物级修缮', '京都町屋文化遗产保留改造', '博斯普鲁斯海峡雅丽别墅', '拉贾斯坦哈维利壁画修复', '文化遗产建筑抗震加固', '文物级建筑BIM数字建模', '古建木结构白蚁防治工程'],
  '私人直升机': ['阿古斯特AW609倾转旋翼机', '西科斯基S-76D钻石版', '空客ACH145梅赛德斯联名款', '直升机停机坪建造审批', 'VIP直升机飞行员年聘', '空中出租车服务年约', '直升机定期涡轴大修', '机舱降噪内饰升级', '航电系统触摸屏改装', '城市低空航线申请'],
  '复古摩托': ['文森特黑影系列百年典藏', '印第安酋长1939年复刻版', '哈雷戴维森1915年静音版', '古董摩托引擎全拆大修', '镀铬件手工抛光修复', '真皮马鞍座手工缝制', '钢丝辐条轮毂翻新', '老式化油器精密校准', '古董摩托车牌注册', '恒温低湿摩托收藏柜'],
  '极地探险车': ['北极猫雪地履带探险车', '夏尔巴南极科研越野车', '冰原ATV极地全地形车', '极地车低温引擎改装', '雪地履带防冻更换', 'GPS极地卫星导航', '极地车舱独立供暖系统', '冰裂缝探测雷达', '极地车燃油预热装置', '紧急极地救援信标'],
  '电动超跑': ['Rimac Nevera全电动旗舰', '路特斯Evija电动猛兽', '保时捷Taycan Turbo GT', '家用超快充800V充电桩', '电池包赛道级冷却系统', '电动超跑赛道数据遥测', '碳纤维单体壳检修', '电池健康度年度检测', '家用储能V2G系统', '电机磁钢升级套件'],
  '私人列车': ['东方快车皇家苏格兰号包厢', '日本七星号九州套房车厢', '威尼斯辛普伦东方快车包车', '列车专属轨道通行权', '私人站台建造工程', '车载米其林厨房改装', '列车古董车厢翻新', '奢华卧铺车厢定制', '列车专属司机年聘', '铁路调度优先通行权'],
  '私人赛道': ['FIA认证国际二级赛道', '纽博格林北环风格复刻', '赛道安全护栏TechPro全配', '赛道计时系统MyLaps安装', '赛道Pit房恒温维修车间', '赛道医疗救援中心建造', '私人驾驶学院年度运营', '赛道日会员专属俱乐部', '赛道沥青摩擦系数定期检测', '赛车模拟器全动平台体验'],
};

// ================ 基于市场价值的价格体系 =================
// 每个品类的真实市场价格区间（单位：元 RMB，按 2025 年估值）
const TAG_PRICE_RANGES = {
  // 居住地产 —— 顶级资产
  '超级豪宅':   [150_000_000, 2_000_000_000],
  '私人岛屿':   [300_000_000, 4_000_000_000],
  '城堡庄园':   [80_000_000,  1_200_000_000],
  '云端公寓':   [80_000_000,  800_000_000],
  '私人牧场':   [80_000_000,  1_500_000_000],
  '私人酒庄':   [40_000_000,  800_000_000],
  // 交通工具 —— 移动资产
  '超级跑车':   [12_000_000,  100_000_000],
  '经典名车':   [8_000_000,   550_000_000],  // 250 GTO ≈ $70M
  '私人飞机':   [200_000_000, 3_200_000_000],
  '超级游艇':   [240_000_000, 4_800_000_000],
  '深海潜器':   [16_000_000,  320_000_000],
  // 艺术收藏
  '西方油画':   [40_000_000,  1_600_000_000],
  '中国书画':   [8_000_000,   400_000_000],
  '当代艺术':   [4_000_000,   400_000_000],
  '古董珍玩':   [8_000_000,   400_000_000],   // 鸡缸杯 ≈ $36M
  // 珠宝腕表
  '传世腕表':   [400_000,     250_000_000],    // 大师弦音 ≈ $31M
  '稀世珠宝':   [800_000,     400_000_000],
  // 时尚服饰
  '高级定制':   [400_000,     4_000_000],
  '奢侈包袋':   [80_000,      4_000_000],      // 喜马拉雅铂金包 ≈ $500K
  '名流礼服':   [40_000,      400_000],
  // 美酒美食
  '名庄红酒':   [40_000,      4_400_000],      // DRC 1945 ≈ $550K
  '珍稀烈酒':   [40_000,      16_000_000],     // Macallan 1926 ≈ $1.9M
  '顶级食材':   [8_000,       1_600_000],
  '奢华雪茄':   [4_000,       400_000],
  // 家居生活
  '设计师家具': [80_000,      4_000_000],
  '私人影院':   [400_000,     8_000_000],
  '智能机器人': [80_000,      1_600_000],
  // 运动休闲
  '体育俱乐部': [4_000_000_000, 40_000_000_000], // NBA 球队少数股权
  '赛马竞技':   [400_000,     80_000_000],
  '高尔夫会籍': [800_000,     16_000_000],
  '极限装备':   [8_000,       800_000],
  // 旅行体验
  '太空旅行':   [2_000_000,   440_000_000],     // 轨道游 ≈ $55M
  '极地探险':   [160_000,     4_000_000],
  '赛事包厢':   [4_000_000,   40_000_000],
  // 另类收藏
  '数字资产':   [400_000,     80_000_000],
  '军事藏品':   [800_000,     80_000_000],
  '化石陨石':   [400_000,     120_000_000],
  '稀有书籍':   [4_000_000,   240_000_000],
  '乐器名琴':   [400_000,     160_000_000],
  '电影道具':   [400_000,     40_000_000],
  '猛禽异宠':   [40_000,      4_000_000],
  '改造奇物':   [4_000_000,   160_000_000],
  // 其他
  '贵金属':     [16_000,      4_000_000],
  '名流会所':   [800_000,     40_000_000],
  '私人博物馆': [80_000_000,  1_200_000_000],
  '古董枪支':   [80_000,      4_000_000],
  '顶奢帐篷':   [40_000,      800_000],
  '量子计算机': [40_000_000, 800_000_000],
  '卫星星座':   [200_000_000, 4_000_000_000],
  'AI服务器群': [8_000_000, 160_000_000],
  '超级计算机': [80_000_000, 1_600_000_000],
  '数据中心':   [160_000_000, 3_200_000_000],
  '机器人军团': [4_000_000, 80_000_000],
  '古籍修复':   [40_000, 4_000_000],
  '非遗技艺':   [80_000, 8_000_000],
  '传统工艺':   [16_000, 1_600_000],
  '书法收藏':   [80_000, 40_000_000],
  '茶道研习':   [16_000, 800_000],
  '慈善基金':   [8_000_000, 400_000_000],
  '媒体帝国':   [40_000_000, 4_000_000_000],
  '社交平台':   [8_000_000, 160_000_000],
  '影响力投资': [4_000_000, 200_000_000],
  '海洋保护':   [8_000_000, 160_000_000],
  '雨林保护':   [4_000_000, 80_000_000],
  '野生动物保护': [1_600_000, 40_000_000],
  '非洲艺术':   [400_000, 40_000_000],
  '伊斯兰艺术': [800_000, 80_000_000],
  '佛教艺术':   [400_000, 160_000_000],
  '摄影大师':   [80_000, 8_000_000],
  '翡翠玉器':   [400_000, 160_000_000],
  '珍珠珊瑚':   [40_000, 8_000_000],
  '独立制表':   [800_000, 8_000_000],
  '彩色钻石':   [400_000, 160_000_000],
  '顶级鞋履':   [16_000, 200_000],
  '丝巾披肩':   [4_000, 80_000],
  '定制眼镜':   [8_000, 160_000],
  '帽饰收藏':   [8_000, 400_000],
  '名茶珍藏':   [8_000, 4_000_000],
  '精品咖啡':   [4_000, 80_000],
  '巧克力大师': [800, 40_000],
  '私厨服务':   [40_000, 800_000],
  '稀有蜂蜜':   [4_000, 160_000],
  '奢华卫浴':   [80_000, 4_000_000],
  '顶级床品':   [40_000, 1_200_000],
  '艺术灯具':   [16_000, 800_000],
  '室内泳池':   [800_000, 16_000_000],
  '帆船竞技':   [4_000_000, 160_000_000],
  '击剑马术':   [80_000, 4_000_000],
  '武术格斗':   [8_000, 400_000],
  '飞钓狩猎':   [40_000, 1_600_000],
  '风筝冲浪':   [16_000, 400_000],
  '古城私旅':   [80_000, 2_000_000],
  '火山探险':   [40_000, 1_200_000],
  '水下酒店':   [8_000, 160_000],
  '地心探险':   [80_000, 2_000_000],
  '钱币邮票':   [40_000, 40_000_000],
  '矿物晶体':   [8_000, 4_000_000],
  '昆虫标本':   [4_000, 400_000],
  '烟斗收藏':   [4_000, 160_000],
  '地图手稿':   [80_000, 16_000_000],
  '文房清玩':   [40_000, 40_000_000],
  '瓷器修复':   [8_000, 800_000],
  '民族服饰':   [16_000, 1_600_000],
  '船舶模型':   [8_000, 800_000],
  '古董相机':   [40_000, 4_000_000],
  '标本收藏':   [16_000, 1_600_000],
  '雕塑艺术':   [4_000_000, 160_000_000],
  '数字版画':   [40_000, 8_000_000],
  '大师私塾':   [80_000, 4_000_000],
  '语言精通':   [40_000, 800_000],
  '科研赞助':   [4_000_000, 200_000_000],
  '私人智库':   [400_000, 16_000_000],
  '抗衰医美':   [80_000, 8_000_000],
  '私人医疗':   [400_000, 40_000_000],
  '温泉疗养':   [16_000, 800_000],
  '心灵修行':   [8_000, 400_000],
  '私人花园':   [4_000_000, 80_000_000],
  '宠物乐园':   [400_000, 16_000_000],
  '香氛定制':   [8_000, 400_000],
  '飞行汽车':   [4_000_000, 16_000_000],
  '电动摩托':   [160_000, 1_200_000],
  '古董服装':   [40_000, 4_000_000],
  '智能厨房':   [400_000, 8_000_000],
  '家庭酒窖':   [400_000, 8_000_000],
  '热气球':     [160_000, 4_000_000],
  '深空观测':   [4_000_000, 80_000_000],
  '太阳能农场': [40_000_000, 400_000_000],
  '风能投资':   [40_000_000, 800_000_000],
  '森林树屋':   [8_000_000, 160_000_000],
  '沙漠行宫':   [120_000_000, 1_600_000_000],
  '水下别墅':   [60_000_000, 400_000_000],
  '雪山庄园':   [40_000_000, 600_000_000],
  '私人农场':   [40_000_000, 800_000_000],
  '生态庄园':   [80_000_000, 1_200_000_000],
  '文化遗产建筑': [40_000_000, 600_000_000],
  '私人直升机': [24_000_000, 200_000_000],
  '复古摩托':   [400_000, 16_000_000],
  '极地探险车': [4_000_000, 40_000_000],
  '电动超跑':   [8_000_000, 40_000_000],
  '私人列车':   [80_000_000, 800_000_000],
  '私人赛道':   [16_000_000, 320_000_000],
};

// 确定性哈希 → 同一 tag+index 永远返回相同价格
function productPrice(tag, index) {
  const [lo, hi] = TAG_PRICE_RANGES[tag] || [400_000, 4_000_000];
  // FNV-1a 风格简单哈希，确保确定性
  const key = `${tag}_${index}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // 将 hash 映射到 [0, 1)
  const ratio = ((hash >>> 0) % 10000) / 10000;
  // 价格按对数刻度分布（品类内高端商品占少、低端占多，更符合真实市场）
  const logScale = Math.pow(hi / lo, ratio);
  return Math.round(lo * logScale);
}

// 拆分版：纯计算商品元数据（零网络开销），供并发生成使用
function createProductMeta(tag, index) {
  const types = TAG_PRODUCT_TYPES[tag];
  if (!types) throw new Error(`未知标签: ${tag}`);
  const baseType = types[index % types.length];
  // 直接使用商品名，不再拼接前缀
  const name = baseType;
  const productId = `gen_${tag}_${String(index).padStart(3, '0')}`;
  return { name, price: productPrice(tag, index), tags: [tag], productId, tag, index, baseType };
}

// ==================== 数据库操作封装 ====================
async function readAllProducts() {
  let all = [];
  try {
    const countRes = await db.collection('spendItAll_products').count();
    const total = countRes.total;
    for (let offset = 0; offset < total; offset += 100) {
      const res = await db.collection('spendItAll_products').skip(offset).limit(100).get();
      all = all.concat(res.data || []);
    }
  } catch (e) {
    console.warn('  读取 products 失败:', e.message);
  }
  return all;
}

// ==================== 主流程 ====================
const MIN_PER_TAG = 10;
const MIN_MATCH_PRODUCTS = 90; // 每位富豪 9 个标签，每个标签 ≥10 件，达标线 90

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  💰 Spend It All - 富豪数据同步工具');
  console.log('═══════════════════════════════════════\n');

  // ===== 第 1 步：拉取 Wikipedia =====
  console.log('【第 1 步】拉取 Forbes 富豪榜\n');
  let billionaires;
  try {
    billionaires = await fetchBillionaireList();
  } catch (e) {
    console.error('❌ 拉取失败:', e.message);
    process.exit(1);
  }

  // ===== 第 2 步：并发同步 matchTags =====
  console.log(`【第 2 步】并发同步 ${ALL_MATCH_TAGS.length} 个标签到数据库\n`);
  const tagResults = await Promise.allSettled(
    ALL_MATCH_TAGS.map(tag => db.collection('spendItAll_matchTags').doc(tag._id).set({ category: tag.category, desc: tag.desc }))
  );
  const tagSynced = tagResults.filter(r => r.status === 'fulfilled').length;
  const tagFailed = tagResults.filter(r => r.status === 'rejected');
  if (tagFailed.length > 0) {
    console.error(`  ❌ 标签写入失败 ${tagFailed.length} 个，首个错误: ${tagFailed[0].reason?.message || tagFailed[0].reason}`);
  }
  console.log(`  ✅ 已同步 ${tagSynced}/${ALL_MATCH_TAGS.length} 个标签\n`);

  // ===== 第 3 步：读取现有商品池（唯一一次全量扫描）=====
  console.log('【第 3 步】读取现有商品池\n');
  const allProducts = await readAllProducts();
  console.log(`  📦 现有商品: ${allProducts.length} 件\n`);

  const tagProducts = {};
  ALL_MATCH_TAGS.forEach(t => { tagProducts[t._id] = 0; });
  const existingBaseTypes = new Set(); // 已入库商品的完整名称，用于去重
  for (const p of allProducts) {
    if (p.name) existingBaseTypes.add(p.name);
    (p.tags || []).forEach(tag => {
      if (tagProducts.hasOwnProperty(tag)) tagProducts[tag]++;
    });
  }

  // ===== 第 4 步：并发写入富豪 + 补齐商品 =====
  console.log(`【第 4 步】写入 ${billionaires.length} 位富豪 + 商品补齐\n`);

  // 4a: 并发批量写入富豪
  const BATCH_SIZE = 10;
  console.log('  📝 正在写入富豪...');
  let billionairesWritten = 0, billionairesFailed = 0;
  let firstBillionaireError = null;
  for (let i = 0; i < billionaires.length; i += BATCH_SIZE) {
    const batch = billionaires.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(b => {
        const { _id, ...dataWithoutId } = b;
        return db.collection('spendItAll_billionaires').doc(_id).set(dataWithoutId);
      })
    );
    for (const r of results) {
      if (r.status === 'rejected') {
        billionairesFailed++;
        if (!firstBillionaireError) firstBillionaireError = r.reason?.message || r.reason;
      }
    }
    billionairesWritten += batch.length;
    process.stdout.write(`\r  📝 已写入 ${billionairesWritten}/${billionaires.length} 位富豪`);
  }
  console.log('');
  if (billionairesFailed > 0) {
    console.error(`  ❌ 富豪写入失败 ${billionairesFailed} 个，首个错误: ${firstBillionaireError}`);
  }

  // 4b: 计算每个标签还需多少商品（MIN_PER_TAG 保底 + 平衡）
  const countValues = Object.values(tagProducts);
  const maxCount = Math.max(...countValues);
  const minCount = Math.min(...countValues);
  const avgCount = Math.ceil(countValues.reduce((a, b) => a + b, 0) / countValues.length);
  const targetCount = Math.max(MIN_PER_TAG, Math.min(avgCount, Math.ceil(maxCount * 1.5)));

  console.log(`  当前: 最多${maxCount}件, 最少${minCount}件, 平均${avgCount}件`);
  console.log(`  目标: 每标签 ≥ ${targetCount} 件\n`);

  // 4c: 准备所有待生成商品定义（含缓冲应对失败和重名）
  const NEEDED_PER_TAG = {};
  const productDefs = [];
  for (const tag of ALL_MATCH_TAGS.map(t => t._id)) {
    const current = tagProducts[tag] || 0;
    const need = Math.max(0, targetCount - current);
    NEEDED_PER_TAG[tag] = need;
    if (need > 0) {
      for (let j = 0; j < Math.min(need * 2, 50); j++) {
        const meta = createProductMeta(tag, current + j);
        if (!existingBaseTypes.has(meta.baseType)) {
          productDefs.push(meta);
          existingBaseTypes.add(meta.baseType); // 即时登记，避免同一批次内重复
        }
      }
    }
  }

  // ===== 4d: 先入库商品元数据（image 留空）=====
  const totalNeeded = Object.values(NEEDED_PER_TAG).reduce((a, b) => a + b, 0);
  console.log(`  共 ${productDefs.length} 个候选商品，需成功 ${totalNeeded} 件\n`);

  const productsToWrite = [];
  const TAG_FILLED = {};
  for (const t of Object.keys(NEEDED_PER_TAG)) TAG_FILLED[t] = 0;

  for (const def of productDefs) {
    const { name, price, tags, productId, tag: defTag } = def;
    if (TAG_FILLED[defTag] >= NEEDED_PER_TAG[defTag]) continue;
    TAG_FILLED[defTag]++;
    productsToWrite.push({ productId, name, price, image: '', tags });
    tagProducts[defTag]++;
  }

  // 截取到恰好满足需求的商品数量
  const newProducts = productsToWrite.slice(0, totalNeeded);
  const totalNew = newProducts.length;

  if (totalNew > 0) {
    console.log(`  💾 写入 ${totalNew} 件商品（暂无图片）...`);
    let productsFailed = 0;
    let firstProductError = null;
    for (let i = 0; i < newProducts.length; i += BATCH_SIZE) {
      const batch = newProducts.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(p => {
        const { productId, ...data } = p;
        return db.collection('spendItAll_products').doc(productId).set(data);
      }));
      for (const r of results) {
        if (r.status === 'rejected') {
          productsFailed++;
          if (!firstProductError) firstProductError = r.reason?.message || r.reason;
        }
      }
      process.stdout.write(`\r  📦 已写入 ${Math.min(i + BATCH_SIZE, totalNew)}/${totalNew}`);
    }
    console.log('');
    if (productsFailed > 0) {
      console.error(`  ❌ 商品写入失败 ${productsFailed} 个，首个错误: ${firstProductError}`);
    }
  }

  // 商品元数据已入库，图片由 backfillImages.mjs 独立补充
  if (totalNew > 0) {
    console.log(`\n  💡 新增 ${totalNew} 件商品暂无图片，运行以下命令补图：`);
    console.log(`     node scripts/backfillImages.mjs`);
  }

  // ===== 第 5 步：覆盖率报告（从内存计算，不再查库）=====
  console.log(`\n【第 5 步】覆盖率报告\n`);

  // 每件商品只有一个标签 → 富豪匹配数 = 其 matchTags 标签商品数之和
  const coverage = billionaires.map(b => {
    const bTags = b.matchTags || [];
    const matchCount = bTags.reduce((sum, tag) => sum + (tagProducts[tag] || 0), 0);
    return { id: b._id, name: b.name, matchCount, pass: matchCount >= MIN_MATCH_PRODUCTS };
  });

  const passCount = coverage.filter(b => b.pass).length;
  const failCount = coverage.filter(b => !b.pass).length;

  console.log('═══════════════════════════════════════');
  console.log('  📊 同步完成');
  console.log('═══════════════════════════════════════');
  console.log(`  富豪总数:    ${billionaires.length}`);
  console.log(`  商品总数:    ${allProducts.length + totalNew}`);
  console.log(`  新增商品:    ${totalNew}`);
  console.log(`  通过覆盖:    ${passCount} 位`);
  console.log(`  未通过:      ${failCount} 位`);
  console.log('');

  if (failCount > 0) {
    console.log('  未通过富豪:');
    coverage.filter(b => !b.pass).forEach(b => {
      console.log(`    - ${b.name} (${b.matchCount}件, 需≥${MIN_MATCH_PRODUCTS}件)`);
    });
    console.log('');
  }

  // 标签覆盖详情
  console.log('  标签商品统计:');
  const tagEntries = Object.entries(tagProducts).sort((a, b) => b[1] - a[1]);
  tagEntries.forEach(([tag, count]) => {
    const status = count >= MIN_PER_TAG ? '✅' : '❌';
    console.log(`    ${status} ${tag}: ${count}件`);
  });

  console.log('\n🎉 全部完成！可在小程序中查看数据。');
}

main().catch(e => {
  console.error('❌ 执行失败:', e);
  process.exit(1);
});
