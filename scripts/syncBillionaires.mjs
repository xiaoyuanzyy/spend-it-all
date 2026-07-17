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

const ENV_ID = process.env.CLOUDBASE_ENV || 'cloud1-d2g5khfkv2a660d00';
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

// ==================== matchTags 标签池 ====================
const ALL_MATCH_TAGS = [
  { _id: '科技创新',   category: '产业',   desc: '互联网、软件、硬件等科技领域' },
  { _id: '人工智能',   category: '产业',   desc: 'AI、机器学习、大数据' },
  { _id: '航空航天',   category: '产业',   desc: '太空探索、火箭、卫星' },
  { _id: '新能源汽车', category: '产业',   desc: '电动车、清洁能源汽车' },
  { _id: '电商零售',   category: '产业',   desc: '电商平台、零售连锁' },
  { _id: '社交媒体',   category: '产业',   desc: '社交平台、即时通讯' },
  { _id: '游戏电竞',   category: '产业',   desc: '电子游戏、电竞、虚拟世界' },
  { _id: '影视娱乐',   category: '产业',   desc: '电影、电视、综艺、演出' },
  { _id: '音乐文艺',   category: '产业',   desc: '音乐、文学、戏剧等文化艺术' },
  { _id: '新闻传媒',   category: '产业',   desc: '新闻、出版、媒体资讯' },
  { _id: '能源矿产',   category: '产业',   desc: '石油、天然气、矿业、化工' },
  { _id: '基础设施',   category: '产业',   desc: '港口、电力、水务、交通基建' },
  { _id: '食品饮料',   category: '产业',   desc: '食品加工、饮料、酒类生产' },
  { _id: '生物医药',   category: '产业',   desc: '制药、生物技术、医疗设备' },
  { _id: '物流快递',   category: '产业',   desc: '快递、物流、供应链' },
  { _id: '汽车工业',   category: '产业',   desc: '汽车制造、豪华轿车、汽车品牌' },
  { _id: '奢侈品',     category: '品位',   desc: '顶级奢侈品牌与限量商品' },
  { _id: '时尚潮流',   category: '品位',   desc: '时装、潮牌、穿搭审美' },
  { _id: '珠宝腕表',   category: '品位',   desc: '珠宝首饰、名表收藏' },
  { _id: '艺术收藏',   category: '品位',   desc: '艺术品、古董、稀有藏品' },
  { _id: '美食烹饪',   category: '品位',   desc: '顶级料理、烹饪艺术、米其林' },
  { _id: '红酒名酿',   category: '品位',   desc: '葡萄酒、威士忌、名酒品鉴' },
  { _id: '地产建筑',   category: '生活方式', desc: '豪宅、酒店、地标建筑、商业地产' },
  { _id: '金融投资',   category: '生活方式', desc: '股票、基金、投行、资产管理' },
  { _id: '运动健身',   category: '生活方式', desc: '健身、跑步、综合体能训练' },
  { _id: '赛车竞速',   category: '生活方式', desc: 'F1、赛车、摩托车、速度激情' },
  { _id: '私人飞机',   category: '生活方式', desc: '公务机、私人喷气机、直升机' },
  { _id: '游艇航海',   category: '生活方式', desc: '超级游艇、帆船、航海' },
  { _id: '篮球',       category: '生活方式', desc: 'NBA、篮球赛事与球队投资' },
  { _id: '足球',       category: '生活方式', desc: '足球俱乐部、世界杯' },
  { _id: '高尔夫',     category: '生活方式', desc: '高尔夫俱乐部、锦标赛' },
  { _id: '马术',       category: '生活方式', desc: '赛马、马术、马场' },
  { _id: '网球',       category: '生活方式', desc: '网球、大满贯赛事' },
  { _id: '极限运动',   category: '生活方式', desc: '跳伞、攀岩、冲浪、滑雪、潜水' },
  { _id: '体育竞技',   category: '生活方式', desc: '竞技体育、赛事运作、球队投资' },
  { _id: '环球旅行',   category: '生活方式', desc: '旅行探险、海岛度假、环游世界' },
  { _id: '宠物伴侣',   category: '生活方式', desc: '名贵宠物、稀有动物伴侣' },
  { _id: '家居设计',   category: '生活方式', desc: '室内设计、智能家居、高档家具' },
  { _id: '日用消费',   category: '生活方式', desc: '日常生活消费品、品质好物' },
  { _id: '慈善公益',   category: '精神',   desc: '慈善基金会、公益事业、回馈社会' },
  { _id: '教育事业',   category: '精神',   desc: '教育投资、学校捐赠、人才培养' },
  { _id: '哲学阅读',   category: '精神',   desc: '哲学思考、深度阅读、智慧追求' },
  { _id: '环保自然',   category: '精神',   desc: '环保主义、可持续发展、亲近自然' },
  { _id: '家族传承',   category: '精神',   desc: '家族企业、财富传承、世袭贵族' },
  { _id: '白手起家',   category: '精神',   desc: '自我奋斗、从零创立商业帝国' },
  { _id: '低调神秘',   category: '精神',   desc: '低调行事、神秘莫测、远离聚光灯' },
  { _id: '奢华张扬',   category: '精神',   desc: '极致奢华、不吝炫富、高调生活' },
];

// ==================== 行业 → 标签映射 ====================
const INDUSTRY_TAG_MAP = [
  { keys: ['tesla','spacex','nvidia','apple','microsoft','google','alphabet','oracle','meta','facebook','amazon','samsung','dell','cisco','intel','amd','ibm','paypal','palantir','salesforce','adobe','netflix','uber','airbnb','stripe','huawei','xiaomi','tencent','alibaba','baidu','byte','tiktok','bytedance','softbank','sap','spotify','zoom','shopify','twitter','x corp'], tags: ['科技创新'] },
  { keys: ['openai','ai','artificial intelligence','deepmind','nvidia','machine learning','robot'], tags: ['人工智能'] },
  { keys: ['spacex','blue origin','space','rocket','satellite','boeing','aviation'], tags: ['航空航天'] },
  { keys: ['tesla','electric vehicle','ev','byd','nio','rivian','lucid','solid state','charging'], tags: ['新能源汽车'] },
  { keys: ['amazon','walmart','costco','alibaba','jd.com','pinduoduo','flipkart','rakuten','ebay','shopee','temu','retail','e-commerce','ecommerce','distribution'], tags: ['电商零售'] },
  { keys: ['zara','inditex','h&m','uniqlo','fast retailing','nike','adidas','fashion','apparel','clothing'], tags: ['时尚潮流'] },
  { keys: ['meta','facebook','instagram','whatsapp','snap','tiktok','twitter','telegram','wechat','social media','messaging'], tags: ['社交媒体'] },
  { keys: ['bloomberg','news','media','publish','thomson','reuters','newspaper','broadcasting','entertainment'], tags: ['新闻传媒'] },
  { keys: ['nintendo','tencent','riot','epic','activision','blizzard','gaming','esport'], tags: ['游戏电竞'] },
  { keys: ['netflix','disney','warner','paramount','universal','movie','film','cinema','hollywood'], tags: ['影视娱乐'] },
  { keys: ['spotify','apple music','universal music','warner music','sony music'], tags: ['音乐文艺'] },
  { keys: ['lvmh','louis vuitton','dior','hermès','chanel','gucci','kering','cartier','tiffany','prada','rolex','richemont','bulgari','versace','burberry','fendi'], tags: ['奢侈品'] },
  { keys: ['jewel','watch','diamond','gem','luxury watch','timepiece'], tags: ['珠宝腕表'] },
  { keys: ['art collection','auction','gallery','sotheby','christie'], tags: ['艺术收藏'] },
  { keys: ['wine','champagne','whisky','vineyard','distillery'], tags: ['红酒名酿'] },
  { keys: ['michelin','restaurant','food','beverage','coca-cola','pepsico','nestlé','mars','ferrero','mondelez','kraft','heineken','ab inbev','diageo','red bull','monster','starbucks','mcdonald'], tags: ['食品饮料','美食烹饪'] },
  { keys: ['berkshire','blackstone','blackrock','goldman','morgan stanley','jpmorgan','citadel','bridgewater','fidelity','vanguard','apollo','kkr','carlyle','hedge fund','private equity','investment','bank','insurance','finance','asset management'], tags: ['金融投资'] },
  { keys: ['pharma','biotech','healthcare','medical','pfizer','moderna','roche','novartis','johnson','merck','astrazeneca','gilead','eli lilly','abbvie','thermo fisher','danaher'], tags: ['生物医药'] },
  { keys: ['oil','gas','petroleum','energy','shell','exxon','chevron','bp','total','aramco','mining','steel','coal','nickel','copper','chemical','refinery','arconic','alcoa','glencore','bhp','rio tinto','vale','arcelormittal'], tags: ['能源矿产'] },
  { keys: ['solar','wind','renewable','clean energy','green','carbon','hydrogen','sustainability','electric'], tags: ['环保自然'] },
  { keys: ['real estate','property','construction','infrastructure','port','airport','railway','telecom','tower'], tags: ['地产建筑','基础设施'] },
  { keys: ['automotive','bmw','mercedes','ferrari','porsche','toyota','volkswagen','ford','gm','hyundai','honda'], tags: ['汽车工业'] },
  { keys: ['logistics','shipping','delivery','fedex','ups','dhl','sf express','maersk','cargo','freight','supply chain'], tags: ['物流快递'] },
  { keys: ['nba','basketball','nfl','football club','soccer','f1','formula','motorsport','racing','yacht','golf','tennis'], tags: ['体育竞技'] },
  { keys: ['foundation','philanthropy','charity','donation','education','university','school'], tags: ['慈善公益','教育事业'] },
];

const NATIONALITY_EXTRA_TAGS = {
  '中国': ['白手起家'], '印度': ['家族传承'], '俄罗斯': ['低调神秘'],
  '德国': ['家族传承'], '法国': ['家族传承'], '意大利': ['家族传承'],
  '英国': ['家族传承'], '美国': ['白手起家'], '日本': ['低调神秘'],
  '巴西': ['白手起家'], '韩国': ['家族传承'], '加拿大': ['白手起家'],
  '澳大利亚': ['白手起家'], '西班牙': ['家族传承'],
};

function mapIndustryToMatchTags(sourceText, nationality) {
  const lowerText = sourceText.toLowerCase();
  const lowerNationality = (nationality || '').toLowerCase();
  const tagSet = new Set();
  for (const entry of INDUSTRY_TAG_MAP) {
    for (const key of entry.keys) {
      if (lowerText.includes(key)) { entry.tags.forEach(t => tagSet.add(t)); break; }
    }
  }
  for (const [nat, tags] of Object.entries(NATIONALITY_EXTRA_TAGS)) {
    if (lowerNationality.includes(nat)) { tags.forEach(t => tagSet.add(t)); }
  }
  if (tagSet.size < 3) { tagSet.add('金融投资'); tagSet.add('环球旅行'); tagSet.add('地产建筑'); }
  return [...tagSet].slice(0, 5);
}

function generatePersonalityTags(name, companies) {
  const pool = ['商业天才', '白手起家', '低调富豪', '慈善家', '投资大师', '行业颠覆者', '全球视野', '技术先驱', '收藏大家', '传奇人物'];
  const picked = [];
  const source = [...pool];
  for (let i = 0; i < 3; i++) {
    const idx = (name.length + companies.length + i) % source.length;
    picked.push(source.splice(idx, 1)[0]);
  }
  return picked;
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

    const matchTags = mapIndustryToMatchTags(companyText + ' ' + name, nationality);
    const tags = generatePersonalityTags(name, companies);
    const catchphrase = generateCatchphrase(name);

    billionaires.push({
      _id: `g${billionaires.length}`,
      name,
      nationality: nationality || '未知',
      companies: companies.map(c => COMPANY_NAME_CN[c.trim()] || c).slice(0, 3),
      assets: Math.round(netWorth),
      tags,
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
    const matchTags = mapIndustryToMatchTags(companyText + ' ' + name, nationality);
    const tags = generatePersonalityTags(name, companies);
    const catchphrase = generateCatchphrase(name);
    // 公司名转中文便于前端展示，匹配仍用原始英文名
    const cnCompanies = companies.map(c => COMPANY_NAME_CN[c.trim()] || c).slice(0, 3);
    return {
      _id: `g${i}`,
      name,
      nationality,
      companies: cnCompanies,
      assets: assetsB * 1e9, // 转换为美元
      tags,
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
const LUXURY_PREFIX = ['限量版', '定制款', '至尊', '皇家', '奢华', '私人', '大师级', '传世', '典藏', '御用', '传奇', '至臻', '非凡', '瑰丽', '绝世', '巅峰', '璀璨', '荣耀', '殿堂', '经典'];

const TAG_PRODUCT_TYPES = {
  '科技创新':   ['智能机器人管家','全息投影仪','折叠屏手机','AI芯片收藏版','超级计算机微缩模型','智能眼镜','生物识别保险箱','量子加密通讯器','卫星互联网终端','透明电视','激光投影键盘','电子墨水笔记本','纳米无人机','3D扫描仪','无线充电桌','智能戒指','防丢定位器','机械臂套件','激光雷达测距仪','电子显微镜','热成像仪','可穿戴空调','激光雕刻机','智能门锁','体感控制器','桌面交互投影','智能镜子','迷你PC主机','墨水屏手写板','便携投影幕布'],
  '人工智能':   ['四足机器狗','神经形态芯片','对话机器人旗舰版','自动驾驶改装套件','AI医疗诊断仪','智能家居中枢','智能翻译耳机','视觉识别摄像头','语音克隆设备','脑机接口头环','深度学习开发板','情感识别摄像头','智能象棋机器人','AI编程助手终端','手势识别手套','自动跟踪云台','人脸识别门禁','智能试衣镜','AI摄影助手','同声传译终端','智能排插中枢','无人清洁车','AI作曲键盘','行为分析摄像头','智能体重秤','智能花盆','自动叠衣机','语音控制开关面板','智能会议记录仪','AI绘画显示屏'],
  '航空航天':   ['月球岩石标本','火箭发动机模型','航天服复刻版','火星陨石藏品','卫星缩比模型','太空望远镜','飞机驾驶舱模拟器','碳纤维无人机','喷气背包原型','抗荷服复刻','星图投影仪','航天员食品包','月球车模型','空间站积木','星座地毯','行星仪摆件','火箭发射塔模型','宇航员头盔复刻','太空笔','飞机黑匣子模型','陀螺仪摆件','卫星轨道模型','返回舱座椅','太空种子培育箱','飞机涡轮叶片','地球仪灯','天文日历','重力感应沙漏','飞行数据记录仪','大气层模型'],
  '新能源汽车': ['纯电超跑','电动飞行汽车','固态电池展示模型','氢燃料跑车','电动垂直起降飞行器','太阳能充电桩','电动摩托赛车','石墨烯电池组','车载激光雷达','轮毂电机套件','充电枪模型','电动车底盘展示架','热泵空调模型','电池模组展示','电动F1车模','车载中控大屏','电机控制器','能量回收踏板','磁悬浮车轮展品','太阳能车顶板','电动滑板车','电池健康检测仪','无线车充板','电动卡丁车','换电机器人','智能充电站','电驱桥总成','电池包拆解模型','光伏充电背包','电动方程式赛车模型'],
  '电商零售':   ['自动化分拣机器人','无人配送车','智能货架系统','手持扫码终端','电子价签套装','无人收银台','物流追踪标签','智能仓储机器人','冷链保温箱','热敏打印机阵列','自动打包机','电子秤','收银钱箱','条码打印机','商品展示柜','智能购物车','自助取餐柜','RFID读写器','POS终端机','防损防盗门','电子标签拣货系统','智能试衣间','自动售货机','仓储搬运AGV','智能包装台','商品拍摄灯箱','库存盘点无人机','货架空位检测器','逆向物流回收箱','温湿度监控标签'],
  '社交媒体':   ['AR智能眼镜','全景运动相机','直播环形补光灯','手机云台稳定器','无线领夹麦克风','绿幕背景套装','提词器平板','声卡调音台','桌面三脚架','手机兔笼套件','运动相机','流媒体编码器','直播导播台','手机散热背夹','自拍杆','补光棒','无线图传器','便携监视器','USB麦克风','耳机放大器','相机兔笼','监视器遮光罩','跟焦器','电动滑轨','背景支架系统','LED panel灯','采访话筒','防震架','XLR音频线套装','相机清洁套装'],
  '游戏电竞':   ['电竞曲面显示器','机械键盘限定版','游戏主机典藏版','冠军奖杯复刻','电竞椅','VR头显套装','游戏手柄精英版','显卡限定版','鼠标旗舰款','桌面电竞音响','电竞桌','头戴式电竞耳机','鼠标垫','电竞话筒','采集卡','游戏摇杆','方向盘模拟器','RGB灯带','网线钳','电竞背包','主机散热器','显示器支架','电竞眼镜','电竞手套','电竞水杯','电竞机箱','CPU水冷头','电竞插座','游戏卡带收藏盒','手柄充电底座'],
  '影视娱乐':   ['IMAX家庭影院','电影道具原版','导演取景器','场记板收藏','胶片摄影机','便携监视器','滑轨套装','收音麦克风','补光灯组','剪辑控制台','场务对讲机','灯光控台','投影幕布','调色台','录音机','监听音箱','电影海报','打板器','摄影测光表','滤镜套装','镜头箱','监视记录仪','时间码同步器','无线跟焦器','斯坦尼康稳定器','柔光箱','反光板','色卡','对讲机套装','拍摄无人机'],
  '音乐文艺':   ['斯特拉迪瓦里名琴','电吉他签名款','数字黑胶唱片机','古典钢琴','模块化合成器','降噪耳机旗舰','书架音箱','MIDI键盘','架子鼓','萨克斯管','小提琴','大提琴','口琴','竖琴','古筝','琵琶','二胡','手风琴','电钢琴','尤克里里','调音器','节拍器','乐谱架','拾音器','混音器','耳放','麦克风支架','吉他拨片收藏盒','音频线套装','监听耳机'],
  '新闻传媒':   ['卫星新闻采集车','广播级摄像机','无人机航拍器','便携直播背包','印刷机微缩模型','老式打字机','短波收音机','暗房放大机','铜版印刷机','报纸合订本','采访机','新闻灯','场记板','提词器','卫星电话','手持示波器','媒体服务器','广播调音台','音频矩阵','光纤收发器','无线通话系统','字幕机','硬盘录像机','矩阵切换器','帧同步器','监视器','视音频分配器','光端机','IP直播盒','便携频谱仪'],
  '能源矿产':   ['稀土元素收藏盒','稀有金属锭','铀矿标本','钻石原石','金条','银锭套装','铂金块','钛金属棒','锂矿石标本','铜板收藏','钴矿标本','镍矿石','钨钢棒','铑金属锭','锇金属球','铱金火花塞','铋晶体','黄铁矿标本','孔雀石摆件','紫水晶洞','萤石标本','玛瑙切片','黑曜石球','虎眼石镇纸','砗磲摆件','石榴石原石','月光石吊坠','橄榄石标本','青金石笔筒','绿松石印章'],
  '基础设施':   ['水电站大坝模型','跨海大桥模型','5G基站设备','海底光缆截面','高速铁路模型','风力发电机模型','盾构机微缩','智能电表','港口龙门吊模型','石油钻井平台模型','核电站穹顶模型','隧道掘进机模型','输电铁塔模型','污水处理厂模型','机场航站楼模型','水库闸门模型','燃气轮机模型','海上风机叶片','高压断路器','变电站模型','光缆接头盒','铁路信号灯','桥梁拉索模型','水闸启闭机','地铁盾构管片','电缆接头','绝缘子串','塔吊模型','沉管隧道管节','装配式建筑构件'],
  '食品饮料':   ['鱼子酱罐','千年古树茶饼','威士忌原桶','蓝鳍金枪鱼罐头','松露油礼盒','伊比利亚火腿','陈年香醋桶','藏红花礼盒','蜂王浆原浆','猫屎咖啡豆','海盐焦糖巧克力','抹茶粉罐','龙舌兰蜜瓶','有机橄榄油桶','黑枸杞礼盒','冻干草莓脆','风干牛肉干','乳酪轮','蜂蜜巢脾','松茸干片','燕窝盏','花胶筒','海参干货','有机藜麦罐','枸杞原浆瓶','黑蒜礼盒','陈年普洱茶砖','日晒盐花','椰子油罐','野生蓝莓干'],
  '生物医药':   ['DNA双螺旋模型','脑机接口设备','器官芯片检测仪','基因测序仪','医用外骨骼','人工晶体植入体','微型胰岛素泵','助听器旗舰款','假肢智能关节','手术机器人手臂','心电图机','血氧仪','血压计','耳温枪','雾化器','制氧机','轮椅','护理床','输液泵','除颤仪','胎心仪','针灸模型','骨骼标本','解剖模型','视力表灯箱','听诊器','手术无影灯','牙科综合治疗椅','灭菌器','担架'],
  '物流快递':   ['超音速货机模型','智能分拣机器人','无人机配送箱','冷链运输集装箱','快递柜','自动搬运叉车','物流无人机','包裹追踪器','智能快递车','电子面单打印机','周转箱','托盘','缠绕膜','打包带','气泡膜卷','封箱器','手动液压车','集装箱模型','货架','笼车','货物升降机','称重地磅','手持巴枪','物流周转筐','防水帆布','绑带收紧器','塑料托盘','货梯模型','传送带模型','冷链温度记录仪'],
  '汽车工业':   ['概念车模型','V12发动机摆件','跑车方向盘','碳陶瓷刹车盘','钛合金排气','锻造轮毂','赛车桶椅','序列式变速箱','涡轮增压器','悬挂避震套装','差速器','进气歧管','凸轮轴','活塞连杆组','气缸盖','油底壳','飞轮','离合器片','传动轴','转向机','刹车卡钳','减震弹簧','防倾杆','轮胎','轮毂螺丝套装','车载音响','汽车电瓶','火花塞套装','机油滤清器','空调压缩机'],
  '奢侈品':     ['鳄鱼皮手袋','黄金钢笔','宝石国际象棋','钻石袖扣','铂金打火机','香水瓶','腕表','羊绒围巾','蟒蛇皮钱包','水晶香槟杯','小羊皮手套','驼鸟皮皮带','蜥蜴皮卡包','鲨鱼皮表带','貂毛围脖','珍珠母贝梳妆镜','玳瑁发簪','龙骨袖扣','犀角杯','象牙雕刻','犀皮漆盒','螺钿首饰箱','金丝楠木扇','珊瑚摆件','玛瑙烟斗','犀角梳','螺钿镶嵌笔筒','漆金名片盒','纯银雪茄剪','碧玉印章'],
  '时尚潮流':   ['设计师联名球鞋','高定礼帽','太阳镜','丝绸方巾','手工皮鞋','机械腕表','真皮机车夹克','羊绒大衣','牛仔夹克限定','钛金属眼镜架','渔夫帽','棒球帽','围巾','领带','背带','皮带','钱包','卡包','双肩背包','托特包','手拿包','腰带','袖扣套装','丝巾扣','胸针','叠穿马甲','格纹衬衫','亚麻西装','帆布鞋','乐福鞋'],
  '珠宝腕表':   ['彩钻耳钉套装','翡翠手镯','红宝石冠冕','蓝钻戒指','陨石表盘腕表','珍珠项链','祖母绿胸针','陀飞轮腕表','白金手链','碧玺吊坠','黄钻项链','粉钻戒指','黑珍珠耳坠','琥珀吊坠','蜜蜡手串','和田玉把件','南红玛瑙珠串','绿松石项链','海蓝宝石戒指','摩根石胸针','坦桑石耳钉','帕拉伊巴碧玺','欧泊戒指','尖晶石吊坠','沙弗莱石耳坠','芬达石手链','紫锂辉石戒指','红纹石吊坠','蓝宝石袖扣','翡翠平安扣'],
  '艺术收藏':   ['文艺复兴油画','青铜器摆件','古籍善本','摄影大师原作','陶瓷花瓶','木雕造像','景泰蓝花瓶','书法真迹','珐琅座钟','漆器屏风','铜胎掐丝珐琅','犀角雕件','竹雕笔筒','黄花梨官皮箱','紫檀镇纸','端砚','徽墨','湖笔','宣纸','和田玉山子','寿山石印章','鸡血石摆件','田黄石挂件','金丝楠木雕','象牙雕件','犀皮漆器','剔红漆盘','云锦','缂丝','苏绣屏风'],
  '美食烹饪':   ['和牛熟成冷柜','分子调酒套装','真空烹饪棒','名厨签名刀具','铜锅套装','大理石擀面杖','熟成柜','低温慢煮机','喷枪厨用','铸铁珐琅锅','寿司卷帘','章鱼烧烤盘','塔吉锅','石锅','烧烤炉','电磁炉','厨师机','空气炸锅','破壁机','咖啡烘焙机','面条机','酸奶机','冰淇淋机','榨油机','豆芽机','肠粉机','爆米花机','棉花糖机','华夫饼机','碳烤炉'],
  '红酒名酿':   ['百年陈酿红酒','水晶醒酒器套装','勃艮第特级园酒','年份香槟','单一麦芽威士忌','手工水晶杯','名庄红酒礼盒','雪莉桶威士忌','冰酒珍藏','陈年朗姆酒','贵腐甜白','波特酒','马德拉酒','干邑白兰地','雅文邑','金酒','伏特加','龙舌兰酒','梅斯卡尔','清酒','绍兴黄酒','青梅酒','桂花陈酿','杨梅酒','蜂蜜酒','黑啤原浆','精酿啤酒套装','苹果酒','开瓶器收藏套装','不锈钢酒壶'],
  '地产建筑':   ['智能家居全屋套装','大理石浮雕墙','水晶吊灯','名牌家具套组','金箔天花板','声学影音室设备','艺术楼梯模型','酒窖恒温系统','地暖系统设备','花园喷泉雕塑','壁炉','铜门','罗马柱','大理石地板','实木护墙板','穹顶壁画','旋转楼梯','电梯轿厢模型','中庭水景','庭院凉亭','日式枯山水','英式花园工具屋','法式喷泉','意大利石雕','铁艺大门','泳池水处理设备','桑拿房','阳光房','户外厨房','地下车库旋转平台'],
  '金融投资':   ['实物金条套装','纯金币收藏','银币套装','加密货币冷钱包','古董股票证书','算盘收藏','金融钟摆雕塑','牛熊铜雕','纪念钞册','古钱币套装','熊猫金币','鹰洋银币','枫叶金币','生肖金币','奥运纪念币','精制币套装','错版币','连号钞','塑料钞','外国硬币册','古罗马钱币','古希腊银币','丝路古币','货布','刀币','布币','贝币','大清银币','袁大头','鹰洋'],
  '运动健身':   ['智能跑步机','碳纤维自行车','冷冻疗法舱','碳纤跑鞋','拳击沙袋','哑铃套装','划船机','筋膜枪','运动手环旗舰','瑜伽垫套装','椭圆机','动感单车','综合训练架','弹力带套装','壶铃','健腹轮','战绳','波速球','跳箱','普拉提床','攀岩墙板','蹦床','拳击手套','跳绳','拉力器','仰卧板','单杠','双杠','杠铃片','运动护具套装'],
  '赛车竞速':   ['F1赛车模型','赛车方向盘','碳纤维头盔','赛车模拟器','F1轮毂展示','赛道计时器','赛车服复刻','卡丁车','热熔轮胎组','氮气加速瓶','漂移遥控车','赛车手套','赛车鞋','HANS头颈保护','赛车面罩','防滚架','灭火器','油泵','水箱','赛车仪表盘','安全带','快拆方向盘','碳纤维座椅','后视镜','尾翼','扩散器','侧裙','前唇','刹车通风管','限滑差速器'],
  '私人飞机':   ['湾流飞机模型','航空铝行李箱','飞行员腕表','飞行夹克','飞机发动机叶片','皮质登机牌夹','钛合金墨镜','降噪航空耳机','飞机蒙皮标本','仪表盘摆件','皮质飞行手册','登机梯模型','飞机餐瓷具','航空毛毯','救生衣','氧气面罩','逃生滑梯模型','机轮模型','空速管','天线罩','APU模型','机翼截面切片','航图','飞行计算尺','高度表','航向陀螺仪','空速表','升降速度表','转弯侧滑仪','地平仪'],
  '游艇航海':   ['超级游艇模型','深海潜水器','水下推进器','海底摄影相机','航海六分仪','游艇方向盘','船用时钟','航海图','锚形镇纸','信号旗套装','船用罗盘','救生圈','船用望远镜','船锚','缆绳','羊角栓','防撞球','甲板椅','海事对讲机','雷达反射器','航海日志本','船用气压计','深度计','水温计','鱼探仪','船用喇叭','救生筏','航海刀','防水袋','船模展示架'],
  '篮球':       ['乔丹亲签球衣','冠军戒指复刻','篮球鞋','NBA官方篮球','球衣相框','篮筐系统','篮球背心','护臂套装','篮球袜礼盒','球星签名照','篮球短裤','投篮训练球','加重训练球','运球手套','弹跳训练器','篮球背包','护膝','护踝','发带','腕带','篮球哨','计分牌','战术板','球网','球针','打气筒','篮球架模型','球星摇头娃娃','复古球衣','街球花式篮球'],
  '足球':       ['世界杯金球复刻','签名足球收藏','足球战靴限定','球衣相框','守门员手套','队长袖标','足球护腿板','世界杯纪念币','训练标志碟','战术板','足球袜','护踝','裁判哨','红黄牌','角旗','球门网','足球训练背心','敏捷梯','障碍锥','反弹网','颠球训练器','足球背包','球袋','护膝','足球紧身衣','球队围巾','球迷喇叭','助威鼓','球星卡册','球场模型'],
  '高尔夫':     ['镀金球杆套装','冠军推杆','高尔夫球车','测距仪','球包','签名高尔夫球','果岭旗','球Tee套装','挥杆训练器','果岭推杆垫','铁杆','木杆','挖起杆','推杆握把','高尔夫手套','球帽','球鞋','球伞','球道木杆套','杆头套','修复叉','球标','计分卡夹','下场毛巾','高尔夫袜','防晒袖套','球架','挥杆速度计','球Tee盒','室内果岭'],
  '马术':       ['纯血赛马','马鞍','马术头盔','马鞭','马靴','马蹄铁收藏','马术手套','马匹护理套装','马厩铭牌','奖杯陈列柜','马衔','缰绳','肚带','马镫','马衣','汗垫','刷马工具','马匹浴袍','马房名牌','马饲料槽','马饮水桶','马匹降温毯','马术护甲','马术领带','马术袜','马刺','马桩','障碍架','地杆','马术计时器'],
  '网球':       ['签名网球拍','智能发球机','网球训练器','球拍包','穿线机','签名网球','网球鞋限定','握把带套装','裁判椅','计分板','网球裙','网球帽','护腕','网球袜','减震器','网球线','铅片配重','拍头贴','吸汗带','网球包','捡球篮','训练锥','网球弹力绳','球拍平衡板','护肘','儿童网球拍','沙滩网球拍','网球墙靶','网球反弹训练器','球拍架'],
  '极限运动':   ['翼装飞行服','深海探潜器','攀岩冰镐','跳伞高度计','冲浪板','滑雪板','滑翔伞','洞穴潜水手电','越野摩托','速降山地车','攀岩头盔','安全带','主锁','快挂','攀岩鞋','粉袋','冰爪','雪镜','滑雪杖','滑板','轮滑鞋','长板','尾波板','皮划艇','漂流筏','蹦极绳','走扁带','探洞头灯','防水背包','防水相机壳'],
  '体育竞技':   ['冠军雕塑','奖牌陈列柜','奥运火炬复刻','接力棒','起跑器','奖杯','体操吊环','举重杠铃','击剑面罩','计时器','标枪','铁饼','铅球','跳高横杆','撑杆跳杆','跨栏架','体操垫','平衡木','鞍马','双杠','吊环架','跳马','艺术体操圈','艺术体操球','艺术体操棒','拳击头套','跆拳道护具','柔道服','摔跤垫','击剑服'],
  '环球旅行':   ['世界地标微缩模型','复古地球仪','行李牌套装','护照套','登机箱','旅行日记本','指南针','望远镜','转换插头套装','旅行水壶','颈枕','眼罩','耳塞套装','分装瓶','洗漱包','防水手机袋','便携行李秤','折叠水杯','压缩毛巾','防晒衣','速干裤','徒步鞋','登山杖','户外头灯','防水袋','旅行锁','行李绑带','折叠衣架','旅行插排','急救包'],
  '宠物伴侣':   ['宠物珠宝项圈','水晶鱼缸','真皮牵引绳','智能喂食器','猫爬架','宠物推车','自动猫砂盆','恒温孵化器','纯银犬牌','宠物香波套装','宠物窝','航空箱','宠物背包','饮水机','宠物烘干箱','宠物美容台','指甲剪','梳毛刷','宠物玩具套装','宠物飞盘','逗猫棒','猫抓板','仓鼠跑轮','鸟笼','兔笼','蜥蜴饲养箱','龟缸晒台','宠物电热毯','宠物围栏','自动投食器'],
  '家居设计':   ['大理石餐桌','真皮沙发','水晶吊灯','实木书柜','羊毛地毯','丝绸窗帘','陶瓷餐具套','铜质烛台','羽绒枕头','香薰蜡烛套装','边柜','玄关台','换鞋凳','穿衣镜','衣帽架','屏风','花架','落地灯','台灯','壁灯','装饰画','挂钟','花瓶','果盘','托盘','餐垫','餐巾环','盐胡椒研磨器','托盘桌','杂志架'],
  '日用消费':   ['真丝床品套装','手工羊绒毯','金箔香皂','铂金餐具','水晶花瓶','象牙梳子','珐琅水壶','银质镜子','精油套装','檀木扇','竹纤维毛巾','蚕丝枕巾','乳胶枕头','羽绒被','纯棉浴袍','手工皂','浴盐套装','洗发皂','护手霜礼盒','唇膏套装','指甲油套装','蜜蜡脱毛套装','剃须刀','剃须刷','剃须皂','须后水','古龙水','扩香石','无火香薰','车载香氛'],
  '慈善公益':   ['手工编织毯','公平贸易咖啡豆','再生材料背包','竹纤维餐具','蜂蜡保鲜布','有机棉T恤','环保购物袋','太阳能灯','种子盆栽礼盒','可降解手机壳','有机皂液','竹牙刷','不锈钢吸管','有机棉袜','再生纸笔记本','种子铅笔','稻壳餐具','麦秆水杯','椰壳碗','竹制砧板','软木瑜伽垫','有机棉围巾','植物染丝巾','手工蜡染布','公平贸易巧克力','生态棉毛巾','咖啡渣杯子','再生渔网太阳镜','麻绳编织篮','木制拼图'],
  '教育事业':   ['地球仪','显微镜','天文望远镜','3D打印机','化学实验套装','书法文房四宝','绘本收藏','科学模型','乐谱架','画架套装','算盘','七巧板','魔方','鲁班锁','数独板','拼图','立体书','手绘地图','化石标本','矿物标本盒','蝴蝶标本','植物标本册','昆虫观察盒','电路实验套件','机器人编程套件','乐高建筑系列','磁力片','橡皮泥','沙画台','陶艺拉坯机'],
  '哲学阅读':   ['羊皮古籍善本','复古台灯','皮质笔记本','羽毛笔','书立摆件','放大镜','镇纸','墨水套装','木质书架','线装书','羊皮卷轴','竹简','铜制书签','琉璃镇纸','砚滴','笔洗','笔山','笔舔','臂搁','印章','印泥盒','藏书票','手工装订工具','火漆印章','书皮套','阅读架','书桌椅','落地书柜','台灯','读书枕'],
  '环保自然':   ['太阳能发电机','雨水收集系统','堆肥箱','空气净化器','节能LED灯组','竹制家具','有机棉毛巾','植物种子库','蜂箱','水过滤壶','太阳能灯串','风力小风机','蚯蚓养殖箱','雨水桶','垂直绿化墙','苔藓微景观','生态瓶','多肉组合盆栽','有机肥','生物降解垃圾袋','可重复使用保鲜膜','不锈钢饭盒','玻璃储物罐','竹纤维抹布','丝瓜络洗碗布','椰子壳刷','麻绳','天然乳胶手套','木制衣架','椰棕床垫'],
  '家族传承':   ['家族徽章戒指','百年金库箱','族谱卷轴','家徽旌旗','传家怀表','银质烛台','古董座钟','家族印章','首饰盒','相册','家训匾额','祖先画像','手工地毯','老式缝纫机','黄铜门环','石雕门墩','木雕花窗','古井模型','石磨','蓑衣斗笠','织布机模型','陶罐','铜盆','老式熨斗','煤油灯','手摇电话机','留声机','八音盒','万花筒','老式相机'],
  '白手起家':   ['第一桶金纪念币','公文包','袖扣','领带夹','钢笔','名片夹','真皮笔记本','墨水笔','钱夹','怀表','计算器','办公桌摆件','桌面收纳盒','签字笔','活页笔记本','便签纸套装','订书机','文件架','桌面垃圾桶','手机支架','保温杯','雨伞','钥匙扣','U盘','移动硬盘','无线鼠标','蓝牙音箱','多头充电线','充电宝','扩展坞'],
  '低调神秘':   ['加密通讯器','防窃听探测器','隐形墨水瓶','密码锁手提箱','信号屏蔽袋','夜视望远镜','伪装摄像头','伪装保险罐','录音干扰器','反光太阳镜','变声器','迷你卫星电话','金属探测器','信号干扰器','防跟踪探测器','红外补光灯','窥镜','开锁工具套装','电磁屏蔽帐篷','隐蔽录音笔','针孔检测仪','法拉第袋','射频屏蔽钱包','不可见墨水笔','微型显微镜','折光眼镜','安全锤','多功能刀卡','战术笔','防身喷雾'],
  '奢华张扬':   ['黄金跑车模型','钻石牙套','黄金手机壳','水晶雕塑','镭射跑鞋','发光吧台','黄金哑铃','钻石耳机','铂金充电宝','金箔披萨','水晶马桶盖','黄金浴缸','钻石键盘','铂金鼠标','金线刺绣夹克','发光鞋','闪光西装','水晶车标','发光酒杯','LED舞池','黄金勺','钻石伞','金线围巾','激光舞台灯','香槟塔杯架','镜面球','烟雾机','泡泡机','冷烟花机','派对礼炮'],
};

function randomPrice() {
  const tiers = [[500000, 5000000], [2000000, 20000000], [5000000, 100000000], [10000000, 500000000]];
  const tier = tiers[Math.floor(Math.random() * tiers.length)];
  return Math.round(tier[0] + Math.random() * (tier[1] - tier[0]));
}

// 从已有商品名中剥离前缀，返回基础商品类型（用于去重）
function stripProductPrefix(productName) {
  for (const prefix of LUXURY_PREFIX) {
    if (productName.startsWith(prefix) && productName.length > prefix.length) {
      return productName.slice(prefix.length);
    }
  }
  return productName; // 无匹配前缀，保持原名
}

// 拆分版：纯计算商品元数据（零网络开销），供并发生成使用
function createProductMeta(tag, index) {
  const types = TAG_PRODUCT_TYPES[tag] || LUXURY_PREFIX;
  const baseType = types[index % types.length];
  const adj = LUXURY_PREFIX[index % LUXURY_PREFIX.length];
  const name = baseType.length > 3 ? `${adj}${baseType}` : `${adj}${baseType}套装`;
  const productId = `gen_${tag}_${String(index).padStart(3, '0')}`;
  return { name, price: randomPrice(), tags: [tag], productId, tag, index, baseType };
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
const MIN_PER_TAG = 25;
const MIN_MATCH_PRODUCTS = 80;

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
  console.log(`  ✅ 已同步 ${tagSynced}/${ALL_MATCH_TAGS.length} 个标签\n`);

  // ===== 第 3 步：读取现有商品池（唯一一次全量扫描）=====
  console.log('【第 3 步】读取现有商品池\n');
  const allProducts = await readAllProducts();
  console.log(`  📦 现有商品: ${allProducts.length} 件\n`);

  const tagProducts = {};
  ALL_MATCH_TAGS.forEach(t => { tagProducts[t._id] = 0; });
  const existingBaseTypes = new Set(); // 已入库商品的核心类型（剥离前缀），用于去重
  for (const p of allProducts) {
    if (p.name) existingBaseTypes.add(stripProductPrefix(p.name));
    (p.tags || []).forEach(tag => {
      if (tagProducts.hasOwnProperty(tag)) tagProducts[tag]++;
    });
  }

  // ===== 第 4 步：并发写入富豪 + 补齐商品 =====
  console.log(`【第 4 步】写入 ${billionaires.length} 位富豪 + 商品补齐\n`);

  // 4a: 并发批量写入富豪
  const BATCH_SIZE = 10;
  console.log('  📝 正在写入富豪...');
  let billionairesWritten = 0;
  for (let i = 0; i < billionaires.length; i += BATCH_SIZE) {
    const batch = billionaires.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(b => {
        const { _id, ...dataWithoutId } = b;
        return db.collection('billionaires').doc(_id).set(dataWithoutId);
      })
    );
    billionairesWritten += batch.length;
    process.stdout.write(`\r  📝 已写入 ${billionairesWritten}/${billionaires.length} 位富豪`);
  }
  console.log('');

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
    for (let i = 0; i < newProducts.length; i += BATCH_SIZE) {
      const batch = newProducts.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(batch.map(p => {
        const { productId, ...data } = p;
        return db.collection('products').doc(productId).set(data);
      }));
      process.stdout.write(`\r  📦 已写入 ${Math.min(i + BATCH_SIZE, totalNew)}/${totalNew}`);
    }
    console.log('');
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
