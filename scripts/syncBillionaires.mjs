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

// ==================== matchTags 标签池（47个高差异度消费品类标签）====================
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
  // 优先检查性格覆盖
  if (name && PERSONALITY_OVERRIDE_TAGS[name]) {
    return PERSONALITY_OVERRIDE_TAGS[name];
  }
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
  // 去重后按性格优先级排序：行业标签最能体现富豪特质，国籍标签作补充
  const result = [...new Set([...industryTags, ...natTags])].slice(0, 3);
  const DEFAULT_TAGS = ['超级豪宅','私人飞机','传世腕表','贵金属'];
  for (let i = 0; result.length < 3 && i < DEFAULT_TAGS.length; i++) {
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
  '超级豪宅':   ['比弗利山庄现代庄园','汉普顿海滨别墅','伦敦梅菲尔联排别墅','迪拜棕榈岛海滨府邸','迈阿密星岛水岸别墅','圣特罗佩悬崖别墅','阿斯彭滑雪度假屋','马里布海滩玻璃别墅','纽约第五大道顶层复式','日内瓦湖畔别墅','马略卡岛悬崖别墅','科莫湖文艺复兴别墅','圣迭戈海景庄园','奥斯汀湖畔牧场','蒙特卡洛顶层公寓','巴巴多斯珊瑚别墅','陶尔米纳古宅','摩纳哥顶楼王宫','巴厘岛雨林别墅','圣莫尼卡环保别墅','阿尔加维黄金三角别墅','惠斯勒山腰木屋','桑给巴尔石头城别墅','索诺玛葡萄园别墅','波尔多城堡式庄园','香港深水湾大宅','苏黎世湖景别墅'],
  '私人岛屿':   ['巴哈马群岛私人岛屿','马尔代夫环礁私人岛','塞舌尔花岗岩私人岛','斐济心形私人岛','希腊爱琴海无人岛','伯利兹灯塔珊瑚礁岛','巴拿马珍珠群岛岛屿','泰国普吉离岸小岛','加拿大乔治亚湾木屋岛','巴西安格拉杜斯雷斯岛','英属维尔京群岛庄园岛','菲律宾巴拉望私人岛','澳大利亚降灵群岛岛屿','印度尼西亚摩鹿加群岛岛','意大利拉马达莱娜岛','新西兰北岛海湾岛','库克群岛礁石岛','坦桑尼亚奔巴岛别墅','特克斯和凯科斯群岛岛','柬埔寨颂萨私人岛','苏格兰赫布里底群岛岛','法属玻利尼西亚环礁岛','莫桑比克基林巴群岛岛','爱尔兰海岸灯塔岛','尼加拉瓜翡翠海岸岛','萨摩亚环礁椰子岛','帕劳洛克群岛私人岛'],
  '城堡庄园':   ['法国卢瓦尔河谷城堡','苏格兰高地中世纪城堡','德国巴伐利亚天鹅堡式城堡','托斯卡纳橄榄庄园','爱尔兰莱伊什郡古堡','奥地利萨尔茨堡山顶城堡','葡萄牙杜罗河谷酒庄','英格兰科茨沃尔德庄园','瑞士格劳宾登山谷牧场','匈牙利巴拉顿湖城堡','比利时阿尔登森林庄园','威尔士康威河畔古堡','西班牙安达卢西亚橄榄庄园','捷克波希米亚猎宫','荷兰费吕沃森林庄园','瑞典斯科讷沼泽城堡','摩洛哥马拉喀什沙漠古堡','克罗地亚伊斯特拉石堡','斯洛伐克喀尔巴阡山猎庄','卢森堡阿登森林城堡','立陶宛特拉凯岛城堡','拉脱维亚希谷达庄园','爱沙尼亚萨雷马岛庄园','斯洛文尼亚布莱德城堡','马耳他圣安东花园宫殿','罗马尼亚特兰西瓦尼亚城堡','丹麦菲英岛铜顶城堡'],
  '云端公寓':   ['纽约432公园大道顶层','伦敦海德公园一号顶层','香港天玺顶层复式','迪拜哈利法塔云端公寓','东京六本木之丘顶层','上海汤臣一品顶层','新加坡滨海湾金沙顶层','墨尔本尤里卡塔顶层','迈阿密保时捷设计大厦顶层','莫斯科联邦大厦顶层','悉尼皇冠公寓顶层','曼谷丽思卡尔顿顶层','北京中国尊顶层','芝加哥特朗普大厦顶层','旧金山千禧大厦顶层','多伦多一号公馆顶层','孟买世界一号顶层','吉隆坡双子塔顶层','巴黎蒙帕纳斯顶层','柏林埃斯特雷尔塔顶层','首尔乐天世界大厦顶层','伊斯坦布尔蓝宝石大厦顶层','温哥华香格里拉顶层','圣保罗全景大厦顶层','阿布扎比国家塔顶层','洛杉矶日落大道顶层','米兰城市生活大厦顶层'],
  // —— 交通工具 ——
  '超级跑车':   ['布加迪赤龙超跑旗舰版','柯尼塞格杰斯科绝对者','帕加尼风神BC敞篷版','法拉利赛道Evo混动版','兰博基尼毒液敞篷限量','迈凯伦速尾三座超跑','阿斯顿马丁女武神赛道版','保时捷918威萨赫套件版','里马克绝电纯电超跑','奔驰AMG一号F1引擎跑车','轩尼诗毒液F5极速版','戈登穆雷T50手动超跑','阿波罗烈焰黄金版','丹麦祖尼沃TSR-S翼龙','帕加尼乌托邦旗舰','兰博基尼闪电混动超跑','法拉利代托纳SP3敞篷','布加迪火流星赛道猛兽','帕加尼风神革命终极版','柯尼塞格阿吉拉RS1','迈凯伦塞纳GTR赛道版','阿斯顿马丁胜利者限量','法拉利蒙扎SP2极简跑车','纳兰宝马V12双门超跑','德托马索P72复古超跑','西尔贝大蜥蜴超级跑车','泽沃ST1纯电超跑'],
  '经典名车':   ['法拉利250GTO六二年荣誉版','奔驰300SL鸥翼门五四年版','捷豹E型初代老爷车','阿尔法罗密欧8C千九B','阿斯顿马丁DB5邦德座驾','布加迪57型大西洋版','保时捷550间谍小跑车','谢尔比眼镜蛇427大排量','玛莎拉蒂A6GCS双座赛车','法拉利250红头赛车版','兰博基尼缪拉SV终极版','劳斯莱斯银魅幻影二代','杜森伯格J型皇家座驾','帕卡德十二缸敞篷轿车','凯迪拉克黄金国比亚里茨','塔克48号未来之车','福特GT40马克一型','迈凯伦F1 LM街车王者','保时捷959四驱经典','蓝旗亚平流层HF拉力王','宝马507双座敞篷','塔尔博特泪滴流线轿跑','意达仕芙拉西尼蒂波8A','西班牙瑞士H6B豪华轿车','宾利大陆R型经典轿跑','梅赛德斯奔驰540K蓝爵','霍希853运动敞篷版'],
  '私人飞机':   ['湾流G700超远程公务机','庞巴迪环球八千洲际机','达索猎鹰10X旗舰','波音公务机梦想宽体版','空客公务机350尊享版','赛斯纳经度号远航公务机','本田公务机精英二代','巴航工业执政官600','湾流G650增程版','皮拉图斯PC-24多功能','达索猎鹰900长程型','西锐愿景喷气机','奈斯安特400大修升级','壹航空日蚀550轻喷','赛斯纳奖状CJ4二代','湾流G280超中型','庞巴迪挑战者650','达索猎鹰8X远程三发','本田公务机2600概念','艾康A5水陆两栖飞机','钻石DA62双发公务机','派珀M700复仇女神','泰克南P2012旅行者','大棕熊100多用途公务机','史诗E1000 GX涡轮飞机','环球7500洲际超远程公务机','湾流G800超远程旗舰'],
  '超级游艇':   ['乐顺127米超豪华游艇','斐帝星破冰探险号','海洋号107米环球探险艇','达门53米支援保障艇','希腊88米极简美学游艇','日蚀号超级游艇复刻版','圣劳伦佐73米钢铁游艇','阿兹慕大三体甲板艇','博纳多远洋拖网艇62','公主游艇X95长程型','圣汐克100Y全定制','斐帝星118米绿能游艇','CRN 72米探险游艇','海森80米极速游艇','坦科亚80米概念未来艇','曼哈顿73旗舰飞桥艇','阿兹慕贝内蒂巨人号','克里斯游艇88英尺经典','海洋之王88米意大利造','乐顺飞狐号136米','乐顺北极星号145米','尊贵阿齐兹号147米','翡翠号113米探险游艇','海洋珍珠号106米','飞越地平线号超级帆船','银云号极地探险游艇','蓝宝石号超级帆船游艇'],
  '深海潜器':   ['特里顿三万六全海深潜器','深水研究DSV-4探索者号','幽艇工坊C-探索者5型','海幻影极光六号潜水器','海幻影深海探索者号','幽艇工坊超级潜龙号','特里顿6600耐压深潜器','眩晕三座深潜观光球','海洋探索NAUI深海探路者','特里顿1700透明潜水器','双鹰深海探险潜水钟','特里顿水下直升机观光舱','深飞蛟龙号私人潜艇','双鱼六号深海科研潜艇','特里顿深海勇士号研发型','幽艇工坊巡航潜龙7号','深水纪元5000深海潜器','无尽深渊30号深海舱','海王星水下推进滑板系统','海洋礁石水下居住舱','阿尔文号深海载人探测器','水下滑板摩托推进器','便携式折叠深海潜水舱','超高清遥控水下机器人','全海深着陆式取样探测器','维度深海七千米钛合金舱','深海挑战者号潜器复刻'],
  // —— 艺术收藏 ——
  '西方油画':   ['莫奈睡莲系列原作','梵高向日葵静物油画','毕加索蓝色时期肖像','雷诺阿游艇午餐会','莫迪利亚尼侧卧裸女','塞尚圣维克多山系列','德加芭蕾舞女粉彩画','高更大溪地女人','伦勃朗自画像蚀刻版','维米尔戴珍珠耳环的少女','达利记忆的永恒','马蒂斯红色画室','蒙德里安百老汇爵士乐','康定斯基构图八号','罗斯科橙红黄抽象','波洛克滴画秋韵','沃霍尔玛丽莲梦露丝网','培根尖叫教皇三联画','弗洛伊德胖女人肖像','霍克尼泳池双人影','里希特抽象画','巴斯奎特无题头骨','哈林发光婴儿壁画','杰夫·昆斯气球狗','霍珀夜游者','米开朗基罗创世纪局部壁画','拉斐尔雅典学院局部'],
  '中国书画':   ['齐白石虾蟹图真迹','张大千泼墨山水长卷','徐悲鸿奔马图真迹','傅抱石丽人行','黄宾虹山水册页','潘天寿鹰石图','林风眠仕女图','吴冠中江南水乡油画','李可染万山红遍','启功行书精品','赵孟頫洛神赋手卷','宋徽宗瑞鹤图临本','王羲之兰亭序摹本','颜真卿祭侄文稿拓片','苏东坡黄州寒食帖','郑板桥竹石图','八大山人花鸟册页','石涛山水清音图','文征明千字文手卷','唐伯虎落霞孤鹜图','黄公望富春山居图','倪瓒六君子图','沈周庐山高图','米芾蜀素帖','董其昌秋兴八景图册','赵佶芙蓉锦鸡图真迹','梁楷泼墨仙人图'],
  '当代艺术':   ['村上隆微笑太阳花大版画','凯斯同伴巨型雕塑','班克斯捣蛋鬼丝网版画','达米恩赫斯特钻石骷髅','奈良美智背后藏刀女孩','草间弥生无限镜屋装置','艾未未葵花籽装置','安尼施卡普尔云门微缩','大卫霍克尼平板绘画限量版','杰夫昆斯气球狗大件','伊夫克莱因蓝色维纳斯','卢西安佛洛伊德画册全集','奥拉维尔埃利亚松气候计划','杉本博司海景摄影','辛迪舍尔曼无题电影剧照','蔡国强天梯爆破版画','马琳杜马肖像画','卢卡托马斯火山系列','丹尼尔阿尔轩腐蚀版维纳斯','贝尔纳弗礼兹万花筒画','乔治康多扭曲肖像','拉希德约翰逊拼贴画','翠西艾敏我的床复制品','乌尔斯费舍尔燃烧蜡像','萨尔瓦多普拉多NFT装置','徐冰天书木刻活字版','马克奎恩自我血头像雕塑'],
  '古董珍玩':   ['明成化斗彩鸡缸杯','清乾隆粉彩转心瓶','商晚期青铜饕餮纹鼎','战国错金银带钩','唐三彩骆驼载乐俑','北宋天青釉汝窑盘','元青花鬼谷子下山罐','明永乐铜鎏金大威德金刚','紫檀木嵌百宝花卉屏风','明式黄花梨圈椅一对','清代犀角雕山水杯','康熙御制珐琅彩瓷','战国玉龙形佩','西汉博局镜','唐代海兽葡萄镜','宋代建窑曜变天目盏','元代掐丝珐琅兽耳炉','明清田黄石印章','金累丝嵌宝石如意','碧玉雕山水人物笔筒','象牙雕刻云龙纹臂搁','犀皮漆六角捧盒','黄花梨官皮箱','乾隆铜胎画珐琅鼻烟壶','鎏金无量寿佛像','清雍正粉彩福寿双全瓶','明宣德青花海水龙纹瓶'],
  // —— 珠宝腕表 ——
  '传世腕表':   ['百达翡丽大师弦音6300A','百达翡丽1518不锈钢万年历','劳力士保罗纽曼迪通拿6263','江诗丹顿阁楼工匠57260','朗格1815追针万年历腕表','爱彼皇家橡树万年历中国限定','沛纳海埃及军团潜水腕表','积家翻转三问报时腕表','宝玑玛丽皇后怀表复刻版','理查德米勒RM56-02蓝宝石','FP儒纳陀飞轮天文台表','亨利慕时勇创者万年历腕表','芝柏金桥三金桥陀飞轮','罗杰杜彼王者四摆轮腕表','雅典奇想X蓝宝石水晶款','梵克雅宝情人桥逆跳腕表','宝珀1735大复杂功能怀表','卡地亚神秘钟座钟','泰格豪雅摩纳哥V4皮带','欧米茄超霸月之暗面陶瓷','百年灵航空计时B01自产芯','萧邦LUC 196典藏铂金腕表','真力时挑战者21百分秒计时','格拉苏蒂原创议员天文台表','雷森斯油浸表盘未来腕表','宇舶大爆炸蓝宝石全透明','梵克雅宝诗意星象复杂腕表'],
  '稀世珠宝':   ['格拉夫152克拉蓝钻戒指','缅甸鸽血红5克拉无烧戒指','克什米尔皇家蓝宝石铂金项链','海瑞温斯顿钻石簇群耳坠','卡地亚猎豹全钻满镶手镯','蒂芙尼传奇黄钻缎带项链','宝格丽灵蛇全钻腕表','梵克雅宝拉链满钻长项链','御木本南洋金珠典藏套装','肖邦高级珠宝动物王国系列','伯爵玫瑰园钻石耳环','宝诗龙动物彩宝指环王','萧邦红地毯钻石瀑布项链','迪奥凡尔赛花园彩宝系列','路易威登章鱼女王钻石项链','梅西卡钻石高级定制项链','布契拉提雕金花叶手镯','大卫莫里斯黄钻满天星项链','德比尔斯钻石瀑布流苏项链','妮基奥本海默传奇粉钻','法贝热帝王加冕彩蛋复刻','尚美巴黎约瑟芬皇后冠冕','杰拉德王室蓝宝石钻石胸针','大溪地黑珍珠王后长项链','200克拉坦桑石单颗吊坠','蒂芙尼太阳之泪黄钻吊坠','御木本海螺珍珠稀世套装'],
  // —— 时尚服饰 ——
  '高级定制':   ['香奈儿刺绣工坊高定礼服','迪奥蒙田大道高级定制长裙','华伦天奴高定红绸晚礼裙','范思哲高定水晶镶嵌礼服','阿玛尼私享系列丝绸长袍','丝黛拉麦卡特尼环保高定','纪梵希高定褶皱雪纺礼服','巴尔曼高定金属链甲裙','艾莉萨博高定水晶串珠礼服','高缇耶高定人鱼尾晚礼裙','维果罗夫艺术雕塑高定','祖海尔穆拉德星光透视礼服','玛切萨高定薄纱花卉礼服','艾里斯范赫本三维打印高定','郭培中国嫁衣高定系列','圣罗兰高定吸烟装套装','拉尔夫劳伦高定缎面礼服','杜嘉班纳高定西西里礼服','莫斯奇诺高定超现实礼服','汤姆福特高定丝绒晚宴装','奥斯卡德拉伦塔高定绣球裙','卡罗琳娜埃莱拉高定婚纱','拉克鲁瓦高定复古宫廷礼服','亚历克西斯马比勒蝴蝶结高定','贾巴尼高定奢华纱丽服','芬迪高定皮草刺绣礼服','夏帕瑞丽高定超现实主义礼服'],
  '奢侈包袋':   ['爱马仕喜马拉雅尼罗鳄铂金包','爱马仕喜马拉雅凯莉包25号','香奈儿钻石永恒经典口盖包','迪奥戴妃包鳄鱼皮限定版','路易威登城市指南行李箱套装','戈雅西贡迷你稀有皮手袋','德尔沃闪耀喜马拉雅限量版','普拉达杀手包鳄鱼皮限定','葆蝶家编织晚宴包经典款','芬迪躲猫猫貂毛装饰手袋','罗意威拼图蟒蛇皮手袋','圣罗兰风琴包鳄鱼皮限定','莫奈珍妮鳄鱼皮手袋','赛琳笑脸包幻影鳄鱼皮','宝格丽灵蛇头包限定款','华伦天奴铆钉铂金手袋','纪梵希安提戈娜稀有皮','莫斯奇诺机车包水晶版','范思哲宫殿拼色手袋','马克雅各布斯坦包鳄鱼皮','MCM柏林熊猫限定款','珑骧折叠包山羊皮定制','托德斯D系列稀有皮手袋','芙拉大都会定制款','蔻驰叛逆全蟒蛇皮手袋','香奈儿经典2.55口盖包','巴黎世家机车包限定版'],
  '名流礼服':   ['汤姆福特燕尾服全手工定制','阿玛尼黑色西服套装','萨维尔街亨斯曼定制晨礼服','布里奥尼最高级别定制西装','基顿K-50极致轻薄西装','杰尼亚典藏系列西服套装','安德森与谢泼德定制晚宴西装','萨维利亚诺斯图尔特单排扣','鲁宾纳奇红色晚礼长裙','埃德亚多赫雷拉鸡尾酒裙','奥斯卡德拉伦塔塔夫绸晚礼裙','拉尔夫劳伦紫标燕尾服','卡尔文克莱恩典藏系列礼服','玛切萨刺绣红毯拖尾礼服','瑞秋佐伊好莱坞红毯礼服','罗伯特卡沃利镶珠刺绣西装','D二次方全套晚宴西装','亚历山大麦昆骷髅刺绣西装','理查德詹姆斯定制条纹西装','汤姆布朗四扣海军蓝西装','海德艾克曼缎面翻领西装','朗万复古丝绒吸烟装','萨维尔街迪吉与斯金纳晨礼服','卡纳利黑标全套西装','康纳利定制三件套西装','赛鲁蒂1881定制西装','艾特罗佩斯利花纹定制西装'],
  // —— 美酒美食 ——
  '名庄红酒':   ['罗曼尼康帝特级园1945年份','柏图斯酒庄1982年1.5升装','勒桦酒庄慕西尼特级园','拉菲古堡1787年杰斐逊签名版','拉图尔酒庄1961年原木箱','木桐酒庄1945年胜利年份','玛歌酒庄1900年珍藏','奥比昂酒庄1989年满分酒','里鹏酒庄2005年双瓶装','白马酒庄1947年传世佳酿','奥松酒庄2005年份','金钟酒庄2012年圣埃美隆','帕维酒庄满分年份','罗曼尼拉塔希2005年份','蒙哈榭特级园白葡萄酒','爱士图尔酒庄百年珍藏','碧尚男爵古堡满分酒','宝嘉龙酒庄1982年份','拉梦多酒庄限量双瓶','库克香槟珍藏原木箱','唐培里侬桃红香槟1966','水晶香槟2008年大瓶装','沙龙白中白珍酿系列','碧卡莎梦珍藏干型','康帝拉塔希老年份珍藏','西施佳雅超级托斯卡纳','平古斯酒庄满分年份珍藏'],
  '珍稀烈酒':   ['麦卡伦1926年60年单一麦芽','轻井泽1960年雪莉桶','山崎55年水楢桶','大摩62年单一麦芽','波摩1957年54年陈酿','格兰菲迪50年珍稀典藏','麦卡伦红标50年','波特艾伦1978年稀有版','布朗拉1972年珍藏版','羽生扑克牌全套54瓶','路易十三珍稀桶黑珍珠','马爹利至尊尚·马爹利','轩尼诗百乐廷皇禧','人头马路易十三黑珍水晶','麦卡伦莱俪水晶瓶系列','余市20年单一麦芽','响30年调和威士忌','白州25年单一麦芽','宫城峡35年','秩父银叶水楢桶','格兰格拉索40年','高原骑士50年','阿贝1965年单桶','百富50年单一麦芽','三得利帝国水晶瓶威士忌','格兰冠60年单一麦芽原桶','尊尼获加钻石庆典限量版'],
  '顶级食材':   ['意大利阿尔巴白松露五百克','伊朗钻石级鱼子酱','日本5A级神户和牛整头','蓝鳍金枪鱼大腹十公斤','西班牙橡果饲养伊比利亚火腿','法国贝隆空心铜蚝','法国布雷斯蓝脚鸡','日本静冈皇冠蜜瓜','意大利布法拉水牛奶酪','摩洛哥阿甘油野生坚果油','马来西亚猫山王整果冻榴莲','法国勃艮第黑松露','日本北海道羽生昆布','俄罗斯贝利鱼子酱1.8公斤','奥地利野生熊肉香肠','意大利圣达涅拉九年陈火腿','法国鹅肝整肝两千克','日本大间町本鲔鱼','新西兰银蕨鹿肉','塔斯马尼亚黑松露','西藏藏红花百克装','法国布列塔尼蓝龙虾','日本东京都产水茄子','西班牙法定产区伊比利亚火腿','艾斯佩莱特法定区红辣椒','意大利切尔维亚海盐珍品','牙买加蓝山咖啡庄园豆'],
  '奢华雪茄':   ['高希霸贝伊可56周年限量','特立尼达创建50周年陶瓷罐','罗密欧与朱丽叶丘吉尔珍藏','蒙特克里斯托1935系列','帕特加斯雷蒙阿隆陈年','大卫杜夫香槟王联名限量','多米尼加富恩特禁果20年','奥利瓦V系列梅拉尼奥','德鲁庄园利加普利瓦达黑标','古巴好友双皇冠1990','古巴罗密欧雪松皇冠1995','乌普曼温斯顿爵士窖藏','玻利瓦尔金牌2009停产版','潘趣潘趣超陈年限量','罗密欧陈年龙年限量','蒙特四号陶罐陈年版','高希霸天才马杜罗五号','特立尼达发现号专卖版','雷蒙亚雷斯2017年限量','帕特加斯E2年度限量','蒙特80周年航空陶瓷罐','高希霸贵族专卖版','古巴外交官火山限定','唯佳1998年度雪茄','圣克里斯托瓦哈瓦那城堡','富恩特巨著X稀有珍藏','帕特加斯D4珍藏版雪茄'],
  // —— 家居生活 ——
  '设计师家具': ['让纳雷特昌迪加尔办公椅','艾洛阿尼奥泡泡椅经典款','汉斯韦格纳圆椅之王','弗拉基米尔卡根蛇形沙发','密斯凡德罗巴塞罗那椅','勒柯布西耶LC4躺椅','夏洛特佩里昂书架系统','野口勇玻璃面咖啡桌','芬恩尤尔酋长椅限量版','保尔汉宁森松果吊灯','让普鲁韦标准椅复刻版','芬兰安蒂洛瓦维索躺椅','潘顿一体成型塑料椅','菲利普斯塔克外星人榨汁器','卡斯提廖尼兄弟飞弓落地灯','马塞尔布劳耶瓦西里钢管椅','伊姆斯夫妇休闲躺椅','乔科伦坡埃尔达扶手椅','皮埃罗佛纳塞蒂主题壁画柜','吉奥庞蒂超轻椅经典款','加埃塔诺佩谢UP5母椅','罗伯特文丘里齐彭代尔椅','仓俣史郎玻璃小姐扶手椅','深泽直人广岛椅胡桃木版','佐藤大渐变拼接椅','凯瑞姆拉希德形变液态沙发','扎哈哈迪德液态冰川桌'],
  '私人影院':   ['巨幕私人放映厅全套设备','杜比全景声128声道系统','克里斯坦森4K激光投影机','斯图尔特16米画框透声巨幕','巴可家用定制激光投影','创诺顶级音频处理器','JBL极品定制音箱阵列','智慧之声线声源入墙音箱','普罗塞拉专业影院喇叭','斯图尔特顶级定制透声幕','科视CP4435激光电影机','索尼VPL旗舰4K激光投影','麦景图全景声前后级放大器','宝华鹦鹉螺旗舰落地音箱','凯夫刀锋二号旗舰落地箱','艾格斯顿巅峰系列音箱','丹拿信心60旗舰落地箱','劲浪大乌托邦旗舰音箱','马田卢根新石静电音箱','柏林之声全套环绕音响系统','欧典壁挂定制墙面音箱','真力监听音箱矩阵系统','驾势顶级三角前后级功放','数据中心影院解码处理器','弦声音学扩散板墙面系统','巴可S4激光数字电影放映机','马克莱文森旗舰环绕系统'],
  '智能机器人': ['特斯拉擎天柱人形机器人','波士顿动力斑点机器狗','索菲亚表情交互机器人','优必选行者S人形机器人','小布家庭管家机器人','大疆机甲大师教育机器人','索尼爱宝机器狗第七代','安基维克托桌面机器人','莫克西儿童情感教育机器人','菲戈工业送餐服务机器人','优必选克鲁泽服务机器人','AI象棋大师对弈机器人','仿生蝴蝶群飞艺术套装','乐沃特情感陪伴机器人','米萨社交厨房机器人','孕育莫克西少儿AI伙伴','迷雾二号可编程机器人','泰米个人管家服务机器人','艾力克桌面情感互动机器人','琪琪智能宠物陪伴机器人','宇树GO2四足机器人','索姆诺克斯睡眠呼吸机器人','穆尔博特哨兵监控机器人','乐林大黄蜂变形机器人','可立宝模块化编程机器人','优必选铁甲格斗竞技机器人','ANYmal四足巡检机器人'],
  // —— 运动休闲 ——
  '体育俱乐部': ['NBA球队多数股权','英超足球俱乐部控股权','F1赛车队所有权','美职棒大联盟球队股份','美式足球球队限量股份','西甲足球俱乐部股份','法甲足球俱乐部有限合伙权','印度板球超级联赛球队','北美冰球俱乐部少数股权','高尔夫莱德杯主队包厢','德甲足球俱乐部会员资格','PGL电竞俱乐部所有权','美国足球联赛创始股份','WNBA女子篮球球队股权','意甲百年俱乐部股东席位','澳大利亚橄榄球联赛球队','南非超级橄榄球俱乐部','亚洲冠军联赛俱乐部','中超联赛俱乐部参股权','独联体冰球俱乐部会员','马球俱乐部终身会籍','戴维斯杯网球国家队包厢','印地500赛车VIP围场','美洲杯帆船赛船队','牛津剑桥赛艇终身包厢','NHL冰球俱乐部控股权','MLS足球俱乐部创始股份'],
  '赛马竞技':   ['纯血阿拉伯马冠军血统','纯血赛马种公马配种权','肯塔基德比冠军马驹','英国国家大赛参赛马匹','迪拜世界杯马主冠名权','皇家阿斯科特金杯包厢','凯旋门赛马终身包厢','墨尔本杯赛马马主资格','香港杯国际赛马参赛权','美丹世界杯赛马提名','雅士谷赛道私人包厢','日本杯赛马VIP看台','隆格尚赛马终身包厢','国际良驹拍卖会买家资格','圣安妮塔赛马包厢','冠军驯马师马厩管理权','纯血马DNA基因鉴定服务','马匹运输专机包年','英国纯血马血统证书','法国多维尔赛马季包厢','纯血马拍卖会VIP目录','肯塔基赛马场家族包厢','赛马骑士冠名赞助权','纯血马国际护照','育马者杯参赛马匹提名','迪拜迈丹赛马VIP终身包厢','库尔摩尔种马场限量股份'],
  '高尔夫会籍': ['奥古斯塔国家俱乐部终身会籍','圆石滩高尔夫球场终身会员','圣安德鲁斯老球场终身全权','辛尼克山高尔夫俱乐部会籍','皇家墨尔本终身会员','穆菲尔德终身会籍','松树谷高尔夫终身会员','北贝里克海岸林克斯会员','柏树点俱乐部海洋球场会籍','温特沃斯高尔夫俱乐部会员','皇家波特拉什终身会员','卡诺斯蒂冠军球场VIP','阿布扎比亚斯林克斯VIP','多拉尔蓝色怪兽球场会籍','迪拜酋长高尔夫俱乐部','杰克尼克劳斯签名球场会员','班顿沙丘高尔夫度假球场','法式利克度假村终身会员','皇家圣乔治球场终身会员','川奈富士球场会员','海口观澜湖黑石球场会员','昆明春城湖畔湖景会员','佘山国际高尔夫会籍','圆石滩西班牙湾终身会员','丽思卡尔顿多拉尔俱乐部会员','皇家多诺赫锦标赛终身会员','松林二号球场百周年会籍'],
  '极限装备':   ['翼装飞行服专业竞赛款','8000米级连体高山羽绒服','自由潜水碳纤维脚蹼','钛合金冰镐技术冰攀套装','速降山地碳纤维全避震车','超高空跳伞翼伞装备','直升机滑雪安全气囊背包','冲浪大鱼板枪式长板','深海技术潜水呼吸器套装','雪崩三件套搜救器','弹跳鞋极限运动款','攀岩安全带顶级技术款','滑翔伞竞赛级伞翼','越野雪地摩托竞技款','白水皮划艇极限装备','悬挂式滑翔三角翼','巨型滑板长降速轮','单人悬挂式划水翼','风筝冲浪碳纤维全能板','红牛悬崖跳水专用泳镜','翼装飞行高速摄像头头盔','技术探险干式潜水服','全碳铁人三项竞赛车','极限洞穴潜水主备双瓶','格斗训练悬吊沙袋系统','自由式越野摩托竞赛整车','峡谷漂流干式探险服套装'],
  // —— 旅行体验 ——
  '太空旅行':   ['维珍银河亚轨道90分钟体验','蓝色起源新谢泼德号11分钟飞行','太空探索载人龙飞船7天轨道游','公理空间国际空间站10天游','俄罗斯联盟号轨道飞行体验','太空视角平流层气球之旅','零重力抛物线飞行体验','火星模拟基地7天封闭式训练','NASA中性浮力实验室水下训练','陨石坑探索直升机包机之旅','专属定制舱内太空服','亚轨道太空摄影专属航班','天文学私人遥望台','银河系虚拟现实沉浸式模拟舱','太空食品全套体验礼盒','肯尼迪航天中心VIP发射观看','嫦娥月球表面足迹纪念班','蓝色起源新格伦号轨道游','山脉太空追梦者号首飞体验','太空零重力艺术创作航次','平流层私人歌剧音乐会包厢','太空探索绕月飞行亲爱的月球','太空轨道极光观赏之旅','国际空间站外太空漫步体验','维珍银河私人定制航次','公理空间商业太空站舱段','月球门户空间站七日体验'],
  '极地探险':   ['南极90°极点徒步探险','北极点核动力破冰船之旅','格陵兰冰盖七日穿越','斯瓦尔巴北极熊追踪摄影','挪威斯瓦尔巴种子库参观','南极帝企鹅栖息地直升机游','俄罗斯北极群岛七日探险','加拿大巴芬岛冰川徒步','阿拉斯加迪纳利峰登顶','冰岛瓦特纳冰洞探险','西伯利亚驯鹿部落七日行','亚马逊雨林源头探险','巴塔哥尼亚大W路线全徒步','喜马拉雅南坡大穿越','挪威北角极光全覆盖行程','格陵兰东部狗拉雪橇远征','莫雷诺冰川冰上行走','乞力马扎罗登顶之旅','加拿大邱吉尔北极熊酒店','贝加尔湖冬季冰上穿越','蒙古西部阿尔泰鹰猎之旅','加拿大育空河漂流','法罗群岛悬崖徒步','南乔治亚岛帝企鹅密集地','纳斯卡线条飞行观光','阿拉斯加北极之门徒步穿越','巴塔哥尼亚冰原全穿越'],
  '赛事包厢':   ['超级碗五十码线总裁包厢','奥斯卡杜比剧院前排包厢','温布尔登皇家包厢终身权','F1摩纳哥大奖赛游艇包厢','戛纳电影节红毯终身资格','美国网球公开赛阿瑟阿什包厢','肯塔基德比百万富翁大道','欧冠决赛主席包厢席位','NBA总决赛场边前排季票','劳力士大师赛VIP贵宾包厢','格莱美颁奖礼前排套票','纽约时装周前排季票','皇家阿斯科特皇家游行区','美式足球职业碗VIP更衣室','威尼斯电影节红毯全程','美职棒世界大赛捕手后方包厢','温网中央球场皇家专座','美国大师赛奥古斯塔包厢','英联邦运动会皇家包厢','NCAA决赛四强赛包厢','世界杯开闭幕式VIP席位','悉尼除夕焰火专属观赏台','上海F1大奖赛发车直道包厢','北美冰球斯坦利杯决赛VIP','奥运会开幕式VIP贵宾席','东京奥运会开幕式VIP席位','卡塔尔世界杯决赛包厢'],
  // —— 另类收藏 ——
  '数字资产':   ['加密朋克外星人头像3100号','无聊猿猴游艇俱乐部7090号','菲登扎313号算法生成艺术','指环者879号鹅之神作','自绘文字128号原创生成','彩色波浪完整色系套装','XCOPY右键保存我数字动图','比普尔前五千天NFT授权','去中心乐园黄金地块','沙盒史努比狗狗邻地','谜比特17522号3D角色','红豆数字藏品9605号','涂鸦者6914号','克隆人村上隆联名459号','月鸟2642号','世界女性NFT藏品5672号','赛博金刚VX机甲大猩猩','酷猫2288号','维友3590号','胖企鹅6873号','阿库塔斯1313号','女性世界银河系列921号','变异猿游艇俱乐部345号','达米恩赫斯特货币系列','永恒NFT数字手表','朋克6529号蒂芙尼蓝稀缺版','艺术区块策展沙盒地块'],
  '军事藏品':   ['二战野马P-51战斗机修复实物','退役M4谢尔曼坦克展品','米格-21战斗机退役实机','拿破仑时期燧发手枪实物','奥斯卡二世级战列舰主炮','二战虎式坦克履带实物断面','英国喷火战斗机仪表盘','美国M1加兰德步枪1942原品','二战英菲尔德步枪四号马克一型','战舰主炮弹壳黄铜工艺品','美国南北战争骑兵军刀','苏联T-34坦克驾驶员舱盖','U型潜艇恩尼格玛密码机复刻','冷战时期民兵洲际导弹模型','M60坦克测距仪光学组件','美国海军雄猫F-14弹射座椅','二战德军军官双筒望远镜','英国海军六分仪1939年原品','F-4鬼怪战斗机机头鼻锥','一战德国铁十字勋章原品','美国M1911柯尔特手枪原品','英国空勤团匕首二战原品','二战闪电P-38战斗机操纵杆','亚利桑那号战列舰甲板木材','柏林墙砖块含东德徽章','F-22猛禽雷达罩展示件','阿帕奇AH-64旋翼桨叶实物'],
  '化石陨石':   ['霸王龙完整骨架化石','三角龙头骨化石标本','剑龙背板鳞甲化石','沧龙完整脊椎化石','猛犸象完整象牙化石','始祖鸟柏林标本级化石','雷克斯暴龙牙齿化石','三叶虫群体化石标本板','海百合化石大型标本','鹦鹉螺化石抛光横截面','火星陨石黑美人编号7034','月球陨石佐法尔280号','驰能铁陨石大切片标本','阿根廷艾尔查科陨石碎块','阿连德碳质球粒陨石','阜康橄榄陨铁切片','纳米比亚吉贝翁铁陨石','利比亚沙漠玻璃陨石','默奇森碳质球粒陨石','奥胡斯铁陨石整块','谷神星小行星陨石标本','俄罗斯橄榄陨铁寒冰切片','月球陨石5000号','印度火星陨石标本','伊米拉克橄榄陨铁大件','异特龙完整骨架化石','艾伦丘陵火星陨石84001号'],
  '稀有书籍':   ['古腾堡圣经单页1454年','莎士比亚第一对开本1623年','牛顿自然哲学的数学原理初版','达尔文物种起源初版1859年','奥杜邦美洲鸟类双象本','哥白尼天体运行论1543年初版','亚当斯密国富论1776年初版','霍布斯利维坦1651年初版','洛克人类理解论1689年','笛卡尔方法论1637年初版','伽利略关于两大世界体系的对话','马基雅维利君主论1532年','但丁神曲1472年印刷本','荷马史诗佛罗伦萨初版1488','柏拉图全集1513年阿尔丁版','莫尔乌托邦1516年初版','培根新工具1620年初版','维萨里人体构造1543年','开普勒新天文学1609年','狄德罗百科全书全卷初版','日内瓦圣经1560年初版','伯顿忧郁的解剖1621年','约翰洛克政府论1690年初版','陈梦雷钦定古今图书集成','永乐大典嘉靖副本残卷','弗兰西斯培根随笔集初版','马可波罗游记1485年印本'],
  '乐器名琴':   ['斯特拉迪瓦里1715年克雷莫纳小提琴','瓜奈里耶稣1742年大炮小提琴','斯坦威D274象牙键音乐会三角钢琴','法齐奥利F308印尼黑檀三角钢琴','贝希斯坦D282总统系列钢琴','瓜达尼尼1784年小提琴','阿玛蒂家族1650年大提琴','塞尔莫巴黎马克六次中音萨克斯','吉布森1959年日落色电吉他','芬达1954年元年款电吉他','吉普赛爵士强哥签名款吉他','马丁D-45战前巴西玫瑰木吉他','马可尼低音提琴大师演奏琴','赫尔穆特舍费尔双簧管','洛莱皇家级柳木长笛','塞尔莫参考54中音萨克斯','法奇奥里前奏曲系列演奏级','普莱耶尔F170音乐会三角钢琴','斯坦威路易十五艺术外壳钢琴','瓜达尼尼1778年大提琴','艾伯特皇家级双簧管','帕威尔图尔特大师级小提琴弓','贝森朵夫传世黑檀九尺钢琴','雅马哈CFX旗舰音乐会三角钢琴','飞魔士马尔科姆爵士吉他','斯坦威D274九尺演奏琴复刻','瓜达尼尼1780年手工大提琴'],
  '电影道具':   ['星球大战达斯维达原版头盔','回到未来时光车原道具复制品','007阿斯顿马丁DB5道具车','夺宝奇兵印第安纳琼斯原版鞭子','哈利波特光轮2000扫帚原版','指环王至尊魔戒拍摄原道具','肖申克监狱蒂姆罗宾斯囚服','罗马假日黄蜂牌踏板摩托车','泰坦尼克号海洋之心项链道具','黑客帝国尼奥黑色风衣','侏罗纪公园霸王龙原版模型','教父唐柯里昂怀中的猫','终结者T-800金属骨架','蝙蝠侠1989版蝙蝠车模型','阿甘正传公交站长椅原道具','绿野仙踪桃乐丝红宝石鞋','星球大战R2-D2原版机器人','ET外星人机械电子模型','发条橙牛奶吧裸女雕塑道具','异形吉格尔设计道具头骨','星球大战千年隼号微缩模型','疤面煞星托尼蒙大拿M16步枪','现代启示录休伊直升机模型','大白鲨布鲁斯机械鲨鱼模型','侏罗纪公园琥珀蚊子手杖','钢铁侠马克3原版战甲道具','侏罗纪公园迅猛龙机械模型'],
  '猛禽异宠':   ['阿拉伯纯血耐力赛马','雪白孟加拉虎幼崽','蒙古猎隼训练成熟个体','黑豹幼年合法驯养','白色非洲狮幼崽','金雕哈萨克猎鹰训练个体','亚马逊金刚鹦鹉彩虹配色','白色帝企鹅特殊个体','阿拉斯加雪橇犬赛级血统','安哥拉巨兔巨型种','萨凡纳猫F1一代杂交','球蟒薰衣草白化基因','柯尔鸭纯白种鸭','蓝松鸦鸣禽驯化','棕犀鸟马来珍贵物种','仓鸮白化驯养品种','银色狐狸驯化宠物','塔尔羊喜马拉雅蓝色品种','迷你驴澳洲宠物品种','鬣蜥绿蓝双色变异个体','日本锦鲤红白丹顶赛事级','蓝尾蜂鸟繁殖对','巨型非洲盾臂龟50岁','中国冠毛犬全血统冠军','英国短毛猫蓝金渐层种猫','苏门答腊虎幼崽驯育','非洲灰鹦鹉语言天才个体'],
  '改造奇物':   ['波音747机身改造私人别墅','退役核导弹发射井改建豪宅','退役灯塔改豪华旋转套房','双层巴士改移动总统套房','二战碉堡改地下天堂别墅','退役直升机改造胶囊旅馆','火车车厢连接式度假屋','集装箱架空玻璃别墅','退役消防船改造水上民宿','退役十字转门天文台','退役航天飞机机库改造','啤酒桶改造圆形小屋','退役A380引擎罩沙发','帆船船体改度假海景别墅','退役卫星天线改天文别墅','退役水塔改观景阁楼','退役运马拖车改移动民宿','退役隧道通风塔改塔楼','谷仓改建音乐厅','退役升降机井改地下酒吧','退役航空控制塔改酒店套房','退役机场摆渡车改露台酒吧','退役浮船坞改水上乐园','退役钻井平台改深海度假酒店','退役水泥厂改现代艺术馆','退役潜艇改水下观光舱酒店','退役火车隧道改地下葡萄酒窖'],
  // —— 其他 ——
  '贵金属':     ['四百盎司伦敦标准交割金条','铂金锭一公斤收藏证书','铑金属一盎司铸块','瑞士精铸千足金条','澳大利亚珀斯铸币厂金币','加拿大皇家铸币厂纪念银币','英国皇家铸币局不列颠金币','中国熊猫金币全套','南非克鲁格兰金币','奥地利维也纳爱乐乐团金币','墨西哥自由女神金币','澳大利亚袋鼠金块','铱金属纽扣锭','锇金属蓝色晶体球','钯金条一公斤','钌金属一盎司','高纯锗锭','碲金属晶体棒','铟金属锭高端封装','铋晶体彩虹阶梯色','铑黑粉末高纯度','金属镓液体密封瓶装','钨棒精密加工','钛合金钛锭十公斤','锗晶体完美晶格标本','阿联酋黄金一公斤金锭','工商银行如意金条五百克'],
  '名流会所':   ['摩纳哥游艇俱乐部终身会籍','香港赛马会全权会员','伦敦安娜贝尔夜总会终身','纽约苏富比理事会席位','达沃斯世界经济论坛固定邀请','太阳谷年度峰会终身资格','波希米亚俱乐部永久会员','纽约大都会艺术博物馆捐赠委员会','温莎城堡嘉德勋章骑士','法兰西学会荣军院院士席位','东京六本木新城俱乐部会员','戛纳影节宫终身会员','迈阿密巴塞尔艺术展VIP','伦敦白金汉宫花园聚会邀请','瑞士巴塞尔艺术展国际理事会','慕尼黑啤酒节家族包厢','威尼斯哈里酒吧终身会员','新加坡莱佛士酒店作家酒吧','格施塔德皇宫酒店冬季俱乐部','摩纳哥F1大奖赛车手俱乐部','伦敦皇家阿尔伯特音乐厅包厢','洛桑奥林匹克博物馆金环会','棕榈滩马拉戈俱乐部会员','格施塔德鹰俱乐部','圣莫里茨雪橇俱乐部','巴塞尔艺术展全球VIP','国际奥委会主席台终身席位'],
  '私人博物馆': ['弗兰克盖里设计私人美术馆','安藤忠雄混凝土艺术馆','扎哈哈迪德流体雕塑画廊','伦佐皮亚诺玻璃穹顶收藏馆','让努维尔光影雕塑展览馆','大卫奇珀菲尔德极简博物馆','隈研吾负建筑理念收藏空间','妹岛和世通透玻璃画廊','赫尔佐格与德梅隆改造工业空间','彼得卒姆托温泉冥想展览馆','奥斯卡尼迈耶曲线混凝土展馆','理查德迈耶白色现代画廊','诺曼福斯特钢结构展示厅','斯蒂文霍尔光影画廊','比雅克英格尔斯爬坡美术馆','阿尔瓦罗西扎几何雕塑画廊','马西米利亚诺福克萨斯云朵展馆','伯纳德屈米解构主义展馆','马里奥博塔砖石圆形画廊','德波尔藏巴克临时展馆','妹岛和世透明长盒画廊','藤本壮介树状结构展览厅','伊东丰雄流动画廊','石上纯也超薄白色展馆','斯诺赫塔峡湾式雕塑展示厅','弗兰克赖特草原风格美术馆','阿德迦耶非洲当代艺术博物馆'],
  '私人牧场':   ['蒙大拿黄石河万英亩牧场','德克萨斯国王牧场育牛庄园','新西兰南岛高地羊群牧场','阿根廷巴塔哥尼亚安格斯牧场','怀俄明落基山麋鹿狩猎牧场','昆士兰内陆牛栏站牧场','肯塔基蓝草纯血马育马场','科罗拉多洛基山狩猎度假牧场','苏格兰高地红鹿狩猎庄园','乌拉圭大草原高乔牧区','艾伯塔省洛基山东坡牧场','俄勒冈火山湖牧场庄园','纳米比亚野性牧场狩猎保护区','智利湖区冰河牧场','塔斯马尼亚美丽诺羊毛牧场','巴西南马托格罗索潘塔纳牧场','加拿大不列颠哥伦比亚牛仔牧场','埃塞俄比亚东非大裂谷牧场','匈牙利霍尔托巴吉草原牧马场','蒙大拿黑脚河飞钓牧场','俄克拉荷马野牛草场保护区','索诺拉沙漠生态牧场','冰岛高地马匹牧场','阿拉斯加德纳里荒野木屋牧场','安第斯山麓羊驼绒牧场','内华达黑石沙漠生态牧场','津巴布韦万基野生动物牧场'],
  '私人酒庄':   ['波尔多左岸列级一等酒庄','纳帕谷膜拜酒庄独立园','托斯卡纳布鲁奈罗特级酒庄','勃艮第特级园独占田酒庄','巴罗萨谷百年老藤西拉酒庄','香槟区白丘特级村酒庄','杜罗河谷年份波特酒庄','摩泽尔陡坡雷司令独占园','里奥哈百年家族传承酒庄','马尔堡长相思全景酒庄','门多萨高海拔马尔贝克酒庄','威拉米特谷黑皮诺精品庄','圣埃美隆一级B等酒庄','罗讷河谷埃米塔日传奇庄','皮埃蒙特巴罗洛独占园酒庄','索诺玛海岸黑皮诺膜拜庄','卢瓦尔河谷桑塞尔精品庄','弗兰肯西万尼干白独有庄','斯泰伦博斯老藤品诺塔吉庄','阿连特茹软木橡树酒庄','智利迈波谷安第斯麓酒庄','普罗旺斯桃红有机庄园','西西里岛埃特纳火山酒庄','朗格多克有机先锋酒庄','瑞士拉沃梯田世界遗产酒庄','教皇新堡产区珍稀老藤酒庄','索阿韦经典白葡萄酒庄'],
  '古董枪支':   ['柯尔特1851海军型左轮原品','史密斯威森44马格南六号','温彻斯特1873连发步枪','柯尔特和平缔造者1873型','雷明顿1858新军型左轮','毛瑟C96盒子炮原品','鲁格P08炮兵型1917年','柯尔特1911政府型1913年','威伯利马克六型一战军官版','斯普林菲尔德M1903狙击版','勃朗宁自动五号雕花版1930','荷兰东印度公司燧发火枪','维多利亚时代双管猎枪雕花','美国内战亨利连发步枪1860','法国查特维尔1766型火枪','柯尔特龙骑兵型1848','比利时勃朗宁叠排二十号猎枪','史密斯威森357注册麦格农','帕克兄弟A1特别雕花双管','柯尔特1860军用型左轮','约翰曼托与儿子十二号猎枪','霍兰德皇家双管步枪','伊萨卡M37雕花版','英国博西双管散弹枪','美国温彻斯特94型西部纪念版','毛瑟98K狙击型二战原品','纳甘M1895转轮手枪原品'],
  '顶奢帐篷':   ['路易威登游牧帐篷套房','丽思卡尔顿私人岛屿帐篷','安缦度假村野奢帐篷','辛吉塔石头城星空帐篷','鹰岛营地奥卡万戈三角洲','巴厘岛灵气竹帐篷','马尔代夫索尼瓦水上帐篷','非洲动物大迁徙移动营地','蒙古可汗汗帐豪华版','北极帆布极光泡泡帐篷','肯尼亚马赛马拉河马帐篷','智利百内国家公园透明穹顶','澳大利亚乌鲁鲁长夜星空帐篷','印度拉贾斯坦皇家狩猎帐篷','藏北羌塘无人区奢华毡房','新西兰峡湾悬崖帐篷','雨林树顶点树顶帐篷','不丹安缦科拉山谷帐篷','纳米布沙漠骷髅海岸星空帐篷','北极斯瓦尔巴犬拉雪橇帐篷','乌干达布温迪山地大猩猩营地','塔斯马尼亚摇篮山湖畔帐篷','萨武蒂象群走廊豪华帐篷','摩洛哥撒哈拉柏柏尔皇家帐篷','巴塔哥尼亚拖车改造野奢帐篷','亚马逊雨林树冠帐篷营地','冰岛米湖地热帐篷营地'],
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

// ==================== 主流程 ====================
const MIN_PER_TAG = 27;
const MIN_MATCH_PRODUCTS = 40; // 每位富豪 3 个标签，每个标签 ≥25 件，达标线 ~40

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
    ALL_MATCH_TAGS.map(tag => db.collection('matchTags').doc(tag._id).set({ category: tag.category, desc: tag.desc }))
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
        return db.collection('billionaires').doc(_id).set(dataWithoutId);
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
        return db.collection('products').doc(productId).set(data);
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
