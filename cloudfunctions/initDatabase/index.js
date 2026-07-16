// 云函数：initDatabase
// 初始化数据库集合并插入 mock 数据
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ==================== 富豪数据 ====================
const billionaires = [
  { _id: '0',  name: '富军',   companies: ['阿里巴巴', '蚂蚁集团', '菜鸟网络'], assets: 250000000000, tags: ['商业奇才', '武侠迷', '教育家'],     catchphrase: '让天下没有难做的生意', avatar: '', matchTags: ['科技', '地产', '金融', '教育', '艺术', '收藏', '运动', '时尚'] },
  { _id: '1',  name: '马斯克', companies: ['特斯拉', 'SpaceX', 'X', 'xAI', 'Neuralink'], assets: 250000000000, tags: ['疯狂创新者', '推特整活', '火星人'], catchphrase: '让人类成为多星球物种', avatar: '', matchTags: ['科技', '太空', '汽车', '旅行', '金融', '收藏', '珠宝', '地产'] },
  { _id: '2',  name: '特朗普', companies: ['特朗普集团', 'Truth Social'], assets: 6500000000, tags: ['懂王', '地产大亨', '真人秀明星'],        catchphrase: '让美国再次伟大', avatar: '', matchTags: ['地产', '金融', '奢华', '炫富', '时尚', '珠宝', '美食', '汽车'] },
  { _id: '3',  name: '丁磊',   companies: ['网易', '网易云音乐', '严选'], assets: 35000000000, tags: ['网易掌门', '养猪达人', '品味生活'],       catchphrase: '以创新和品味改变生活', avatar: '', matchTags: ['科技', '美食', '家居', '音乐', '教育', '宠物', '艺术', '健康'] },
  { _id: '4',  name: '张一鸣', companies: ['字节跳动', 'TikTok', '抖音'], assets: 45000000000, tags: ['算法之王', '全球扩张', '延迟满足'],       catchphrase: '构建全球信息分发', avatar: '', matchTags: ['科技', '金融', '教育', '艺术', '旅行', '音乐', '时尚', '健康'] },
  { _id: '5',  name: '马云',   companies: ['阿里巴巴', '蚂蚁集团', '菜鸟'], assets: 25000000000, tags: ['风清扬', '武侠迷', '教育家'],           catchphrase: '让天下没有难做的生意', avatar: '', matchTags: ['地产', '金融', '教育', '艺术', '运动', '收藏', '旅行', '科技'] },
  { _id: '6',  name: '黄峥',   companies: ['拼多多', 'Temu'], assets: 35000000000, tags: ['拼多多王', '下沉市场', '退而不休'],       catchphrase: 'Costco + Disney', avatar: '', matchTags: ['科技', '日用品', '美食', '时尚', '家居', '宠物', '健康', '汽车'] },
  { _id: '7',  name: '马化腾', companies: ['腾讯', '微信', 'Riot Games'], assets: 40000000000, tags: ['企鹅帝国', '产品经理之王', '低调务实'],   catchphrase: '连接一切', avatar: '', matchTags: ['科技', '金融', '音乐', '艺术', '收藏', '时尚', '太空', '教育'] },
  { _id: '8',  name: '贝佐斯', companies: ['亚马逊', 'Blue Origin', '华盛顿邮报'], assets: 180000000000, tags: ['电商之王', '太空梦想家', '光头战神'], catchphrase: '每一天都是第一天', avatar: '', matchTags: ['科技', '太空', '地产', '金融', '旅行', '汽车', '收藏', '奢华'] },
  { _id: '9',  name: '扎克伯格', companies: ['Meta', 'Facebook', 'Instagram', 'WhatsApp'], assets: 120000000000, tags: ['社交之王', '元宇宙信徒', '格斗爱好者'], catchphrase: '快速行动，打破常规', avatar: '', matchTags: ['科技', '运动', '时尚', '旅行', '家居', '健康', '教育', '艺术'] },
  { _id: '10', name: '盖茨',   companies: ['微软', '盖茨基金会', 'TerraPower'], assets: 130000000000, tags: ['软件之父', '慈善大师', '读书狂人'],   catchphrase: '成功是一位糟糕的老师', avatar: '', matchTags: ['科技', '教育', '收藏', '健康', '旅行', '艺术', '金融', '太空'] },
  { _id: '11', name: '巴菲特', companies: ['伯克希尔·哈撒韦', '可口可乐', '苹果'], assets: 120000000000, tags: ['股神', '价值投资', '可乐狂魔'],     catchphrase: '别人贪婪时我恐惧', avatar: '', matchTags: ['金融', '美食', '收藏', '地产', '日用品', '汽车', '名酒', '奢华'] },
  { _id: '12', name: '李嘉诚', companies: ['长江集团', '和记黄埔', '屈臣氏'], assets: 38000000000, tags: ['超人', '地产之王', '低调富豪'],           catchphrase: '无论风吹浪打都前进', avatar: '', matchTags: ['地产', '金融', '日用品', '旅行', '健康', '科技', '家居', '收藏'] },
  { _id: '13', name: '王健林', companies: ['万达集团', '万达广场', '万达影业'], assets: 15000000000, tags: ['地产巨鳄', '先赚一个亿', '万达之魂'],     catchphrase: '先定一个小目标', avatar: '', matchTags: ['地产', '影视', '旅行', '运动', '收藏', '奢华', '汽车', '名酒'] },
  { _id: '14', name: '任正非', companies: ['华为', '海思', '鸿蒙'], assets: 3500000000, tags: ['硬汉', '民族脊梁', '技术狂魔'],                      catchphrase: '除了胜利，别无选择', avatar: '', matchTags: ['科技', '教育', '健康', '艺术', '珠宝', '地产', '金融', '旅行'] },
  { _id: '15', name: '雷军',   companies: ['小米', '金山', '顺为资本'], assets: 15000000000, tags: ['Are you OK', '性价比之王', '劳模'],             catchphrase: '站在风口上，猪都能飞', avatar: '', matchTags: ['科技', '日用品', '家居', '运动', '汽车', '时尚', '宠物', '健康'] },
  { _id: '16', name: '刘强东', companies: ['京东', '京东物流', '京东科技'], assets: 12000000000, tags: ['东哥', '兄弟文化', '物流之王'],               catchphrase: '不会自建物流就不是好电商', avatar: '', matchTags: ['科技', '地产', '旅行', '汽车', '日用品', '金融', '美食', '健康'] },
  { _id: '17', name: '蔡崇信', companies: ['阿里巴巴', '篮网队', '蓝池资本'], assets: 10000000000, tags: ['隐形军师', '律师出身', '体育投资人'],       catchphrase: '放弃高薪拥抱梦想', avatar: '', matchTags: ['运动', '金融', '艺术', '音乐', '旅行', '时尚', '收藏', '地产'] },
  { _id: '18', name: '钟睒睒', companies: ['农夫山泉', '万泰生物'], assets: 65000000000, tags: ['首富', '低调神秘', '瓶装水之王'],                    catchphrase: '我们不生产水，我们只是大自然的搬运工', avatar: '', matchTags: ['日用品', '健康', '美食', '旅行', '家居', '宠物', '科技', '收藏'] },
  { _id: '19', name: '库克',   companies: ['苹果', 'Apple Watch', 'Vision Pro'], assets: 2000000000, tags: ['供应链大师', '出柜CEO', '素食主义者'],    catchphrase: 'Think Different', avatar: '', matchTags: ['科技', '时尚', '健康', '音乐', '艺术', '旅行', '家居', '运动'] }
];

// ==================== 商品数据 ====================
const products = [
  { _id: 'p1',   name: '镶钻狗项圈',          price: 2400000,   image: '', tags: ['宠物', '奢华', '炫富'] },
  { _id: 'p2',   name: '镀金厕纸卷',          price: 800000,    image: '', tags: ['日用品', '奢华'] },
  { _id: 'p3',   name: '带WiFi私人岛屿',       price: 12000000,  image: '', tags: ['地产', '科技', '炫富'] },
  { _id: 'p4',   name: '太空舱卧室套房',       price: 50000000,  image: '', tags: ['科技', '炫富', '太空'] },
  { _id: 'p5',   name: '纯金马桶座',          price: 3600000,   image: '', tags: ['日用品', '奢华'] },
  { _id: 'p6',   name: '钻石牙刷套装',         price: 1200000,   image: '', tags: ['日用品', '奢华'] },
  { _id: 'p7',   name: '黄金iPhone',           price: 2800000,   image: '', tags: ['科技', '奢华', '炫富'] },
  { _id: 'p8',   name: '私人飞机小模型',       price: 4800000,   image: '', tags: ['科技', '炫富'] },
  { _id: 'p9',   name: '纯金镶钻手表',         price: 8900000,   image: '', tags: ['珠宝', '奢华', '炫富'] },
  { _id: 'p10',  name: '限量版布加迪跑车',     price: 35000000,  image: '', tags: ['汽车', '奢华', '炫富'] },
  { _id: 'p11',  name: '私人游艇派对套餐',     price: 25000000,  image: '', tags: ['游艇', '炫富', '旅行'] },
  { _id: 'p12',  name: '北极冰川矿泉水整箱',   price: 450000,    image: '', tags: ['美食', '奢华', '日用品'] },
  { _id: 'p13',  name: '梵高真迹向日葵',       price: 82000000,  image: '', tags: ['艺术', '收藏', '炫富'] },
  { _id: 'p14',  name: '私人厨师团队年卡',     price: 12000000,  image: '', tags: ['美食', '奢华'] },
  { _id: 'p15',  name: '意大利庄园度假别墅',   price: 68000000,  image: '', tags: ['地产', '旅行', '奢华'] },
  { _id: 'p16',  name: '定制劳斯莱斯幻影',     price: 28000000,  image: '', tags: ['汽车', '奢华', '炫富'] },
  { _id: 'p17',  name: '鳄鱼皮镶钻手机壳',     price: 680000,    image: '', tags: ['科技', '时尚', '炫富'] },
  { _id: 'p18',  name: '太空旅行套票双人',     price: 180000000, image: '', tags: ['太空', '科技', '炫富'] },
  { _id: 'p19',  name: '喜马拉雅盐砖桑拿房',   price: 5600000,   image: '', tags: ['健康', '家居', '奢华'] },
  { _id: 'p20',  name: '纯金钢笔限量版',       price: 1800000,   image: '', tags: ['收藏', '奢华'] },
  { _id: 'p21',  name: '瑞士私人银行VIP账户',   price: 100000000, image: '', tags: ['金融', '奢华', '炫富'] },
  { _id: 'p22',  name: '名人签名篮球收藏',     price: 7200000,   image: '', tags: ['运动', '收藏', '炫富'] },
  { _id: 'p23',  name: '私人影院装修套餐',     price: 15000000,  image: '', tags: ['家居', '影视', '炫富'] },
  { _id: 'p24',  name: '深海潜艇一日游',       price: 35000000,  image: '', tags: ['旅行', '科技', '炫富'] },
  { _id: 'p25',  name: '钻石内嵌太阳眼镜',     price: 4200000,   image: '', tags: ['时尚', '珠宝', '炫富'] },
  { _id: 'p26',  name: '私人动物园年维护费',   price: 24000000,  image: '', tags: ['宠物', '地产', '炫富'] },
  { _id: 'p27',  name: '古董老爷车收藏',       price: 45000000,  image: '', tags: ['汽车', '收藏', '炫富'] },
  { _id: 'p28',  name: '米其林三星私宴',       price: 3800000,   image: '', tags: ['美食', '奢华'] },
  { _id: 'p29',  name: '纯金高尔夫球杆套装',   price: 9600000,   image: '', tags: ['运动', '奢华', '炫富'] },
  { _id: 'p30',  name: '私人岛屿求婚套餐',     price: 32000000,  image: '', tags: ['地产', '旅行', '炫富'] },
  { _id: 'p31',  name: '镶钻蓝牙耳机',         price: 2500000,   image: '', tags: ['科技', '珠宝', '炫富'] },
  { _id: 'p32',  name: '名牌限量手袋墙',       price: 18000000,  image: '', tags: ['时尚', '收藏', '炫富'] },
  { _id: 'p33',  name: '私人直升机停机坪',     price: 42000000,  image: '', tags: ['地产', '科技', '炫富'] },
  { _id: 'p34',  name: '百年陈酿威士忌',       price: 6500000,   image: '', tags: ['名酒', '收藏', '奢华'] },
  { _id: 'p35',  name: '智能机器人管家',       price: 8500000,   image: '', tags: ['科技', '家居'] },
  { _id: 'p36',  name: '定制私人香水工坊',     price: 5200000,   image: '', tags: ['时尚', '奢华'] },
  { _id: 'p37',  name: '全息投影游戏厅',       price: 12000000,  image: '', tags: ['科技', '家居', '炫富'] },
  { _id: 'p38',  name: '私人马场年运营费',     price: 18000000,  image: '', tags: ['运动', '宠物', '地产'] },
  { _id: 'p39',  name: '蓝宝石浴缸',           price: 4200000,   image: '', tags: ['家居', '珠宝', '奢华'] },
  { _id: 'p40',  name: '非洲野生动物园之旅',   price: 9800000,   image: '', tags: ['旅行', '宠物', '炫富'] },
  { _id: 'p41',  name: '钛合金行李箱限量',     price: 1600000,   image: '', tags: ['旅行', '科技', '时尚'] },
  { _id: 'p42',  name: '月球陨石项链',         price: 7500000,   image: '', tags: ['珠宝', '太空', '收藏'] },
  { _id: 'p43',  name: '私人酒窖翻新技术',     price: 22000000,  image: '', tags: ['名酒', '家居', '收藏'] },
  { _id: 'p44',  name: '全球高速VPN终身会员',  price: 560000,    image: '', tags: ['科技', '日用品'] },
  { _id: 'p45',  name: '24K金餐具全套',        price: 4800000,   image: '', tags: ['美食', '家居', '奢华'] },
  { _id: 'p46',  name: '私人F1赛道体验',       price: 55000000,  image: '', tags: ['汽车', '运动', '炫富'] },
  { _id: 'p47',  name: '古董中国瓷器花瓶',     price: 36000000,  image: '', tags: ['艺术', '收藏', '炫富'] },
  { _id: 'p48',  name: '南极考察团VIP席位',    price: 16000000,  image: '', tags: ['旅行', '科技', '炫富'] },
  { _id: 'p49',  name: '纯金健身哑铃',         price: 2800000,   image: '', tags: ['运动', '奢华', '炫富'] },
  { _id: 'p50',  name: '人工智能投资顾问',     price: 9800000,   image: '', tags: ['科技', '金融'] },
  { _id: 'p51',  name: '定制水晶吊灯',         price: 6300000,   image: '', tags: ['家居', '奢华', '炫富'] },
  { _id: 'p52',  name: '深海珍珠项链',         price: 3800000,   image: '', tags: ['珠宝', '时尚', '收藏'] },
  { _id: 'p53',  name: '顶级雪茄保湿柜',       price: 2400000,   image: '', tags: ['收藏', '奢华'] },
  { _id: 'p54',  name: '私人滑雪度假村',       price: 85000000,  image: '', tags: ['地产', '旅行', '运动'] },
  { _id: 'p55',  name: '碳纤维私人飞机',       price: 150000000, image: '', tags: ['科技', '炫富', '旅行'] },
  { _id: 'p56',  name: '名家书法真迹',         price: 32000000,  image: '', tags: ['艺术', '收藏', '炫富'] },
  { _id: 'p57',  name: '定制地毯波斯手工',     price: 4800000,   image: '', tags: ['家居', '艺术', '奢华'] },
  { _id: 'p58',  name: '深海鱼子酱一公斤',     price: 1800000,   image: '', tags: ['美食', '奢华'] },
  { _id: 'p59',  name: '黄金扑克牌套装',       price: 960000,    image: '', tags: ['收藏', '奢华'] },
  { _id: 'p60',  name: '激光脱毛私人诊所',     price: 3800000,   image: '', tags: ['健康', '科技'] },
  { _id: 'p61',  name: '虚拟现实会议室',       price: 7200000,   image: '', tags: ['科技', '家居'] },
  { _id: 'p62',  name: '天然温泉私人浴池',     price: 5600000,   image: '', tags: ['地产', '健康', '奢华'] },
  { _id: 'p63',  name: '铂金信用卡定制版',     price: 50000000,  image: '', tags: ['金融', '奢华', '炫富'] },
  { _id: 'p64',  name: '名猫品种繁育套装',     price: 3200000,   image: '', tags: ['宠物', '收藏'] },
  { _id: 'p65',  name: '3D打印人体器官储备',   price: 65000000,  image: '', tags: ['科技', '健康'] },
  { _id: 'p66',  name: '定制丝绸床品全套',     price: 2200000,   image: '', tags: ['家居', '时尚', '奢华'] },
  { _id: 'p67',  name: '名犬纯种藏獒',         price: 5800000,   image: '', tags: ['宠物', '收藏', '炫富'] },
  { _id: 'p68',  name: '海底酒店总统套间',     price: 45000000,  image: '', tags: ['旅行', '科技', '炫富'] },
  { _id: 'p69',  name: '纯银古典留声机',       price: 1800000,   image: '', tags: ['音乐', '收藏', '奢华'] },
  { _id: 'p70',  name: '量子计算机原型机',     price: 120000000, image: '', tags: ['科技', '炫富'] },
  { _id: 'p71',  name: '古罗马金币收藏',       price: 24000000,  image: '', tags: ['收藏', '艺术', '炫富'] },
  { _id: 'p72',  name: '世界巡回演唱会包厢',   price: 8500000,   image: '', tags: ['音乐', '旅行', '炫富'] },
  { _id: 'p73',  name: '定制战甲模型全套',     price: 9800000,   image: '', tags: ['收藏', '艺术', '炫富'] },
  { _id: 'p74',  name: '摩纳哥海景公寓',       price: 72000000,  image: '', tags: ['地产', '旅行', '奢华'] },
  { _id: 'p75',  name: '纯金国际象棋',         price: 3600000,   image: '', tags: ['运动', '收藏', '奢华'] },
  { _id: 'p76',  name: '数字艺术品NFT套装',    price: 42000000,  image: '', tags: ['科技', '艺术', '收藏'] },
  { _id: 'p77',  name: '法式贵族礼仪课程',     price: 2800000,   image: '', tags: ['教育', '时尚'] },
  { _id: 'p78',  name: '名人御用发型师年卡',   price: 5600000,   image: '', tags: ['时尚', '健康'] },
  { _id: 'p79',  name: '镀金跑步机',           price: 4800000,   image: '', tags: ['运动', '家居', '奢华'] },
  { _id: 'p80',  name: '百万美金现金床垫',     price: 72000000,  image: '', tags: ['金融', '炫富', '家居'] },
  { _id: 'p81',  name: '私人气象卫星',         price: 85000000,  image: '', tags: ['科技', '太空', '炫富'] },
  { _id: 'p82',  name: '黑松露巧克力礼盒',     price: 1200000,   image: '', tags: ['美食', '奢华'] },
  { _id: 'p83',  name: '定制签名球衣全套',     price: 6800000,   image: '', tags: ['运动', '收藏', '炫富'] },
  { _id: 'p84',  name: '深海钻石勘探权',       price: 48000000,  image: '', tags: ['珠宝', '金融', '炫富'] },
  { _id: 'p85',  name: '私人图书馆装修',       price: 16000000,  image: '', tags: ['家居', '收藏', '教育'] },
  { _id: 'p86',  name: 'AI作曲交响乐定制',     price: 3800000,   image: '', tags: ['科技', '音乐', '艺术'] },
  { _id: 'p87',  name: '古董望远镜收藏级',     price: 9200000,   image: '', tags: ['科技', '收藏', '太空'] },
  { _id: 'p88',  name: '铂金定制自行车',       price: 1800000,   image: '', tags: ['运动', '科技', '炫富'] },
  { _id: 'p89',  name: '限量版香槟塔喷泉',     price: 8600000,   image: '', tags: ['名酒', '美食', '炫富'] },
  { _id: 'p90',  name: '鳄鱼养殖场',           price: 32000000,  image: '', tags: ['宠物', '地产', '炫富'] },
  { _id: 'p91',  name: '激光表演无人机编队',   price: 15000000,  image: '', tags: ['科技', '艺术', '炫富'] },
  { _id: 'p92',  name: '世界名画数字复刻仪',   price: 5800000,   image: '', tags: ['科技', '艺术', '收藏'] },
  { _id: 'p93',  name: '定制金箔名片一万张',   price: 1600000,   image: '', tags: ['时尚', '奢华', '炫富'] },
  { _id: 'p94',  name: '钻石镶嵌耳钉套装',     price: 5200000,   image: '', tags: ['珠宝', '时尚', '奢华'] },
  { _id: 'p95',  name: '全球跳伞地标之旅',     price: 22000000,  image: '', tags: ['运动', '旅行', '炫富'] },
  { _id: 'p96',  name: '翡翠原石赌石体验',     price: 8800000,   image: '', tags: ['珠宝', '收藏', '炫富'] },
  { _id: 'p97',  name: '私人核避难所',         price: 95000000,  image: '', tags: ['地产', '科技', '健康'] },
  { _id: 'p98',  name: '定制香水分子料理',     price: 4800000,   image: '', tags: ['美食', '时尚', '奢华'] },
  { _id: 'p99',  name: '复古机械怀表收藏',     price: 7200000,   image: '', tags: ['收藏', '时尚', '奢华'] },
  { _id: 'p100', name: '火星殖民地认购权',     price: 500000000, image: '', tags: ['太空', '科技', '地产', '炫富'] }
];

// ==================== 随机工具函数 ====================
function pickRandom(arr, min, max) {
  const count = min + Math.floor(Math.random() * (max - min + 1));
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ==================== 主函数 ====================
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const results = [];

  // ---- 1. 初始化亿万富豪集合（doc().set，_id 不能出现在 data 中）----
  for (const b of billionaires) {
    try {
      const { _id, ...dataWithoutId } = b;
      await db.collection('billionaires').doc(_id).set({ data: dataWithoutId });
      results.push({ collection: 'billionaires', action: 'upsert', id: _id, name: b.name, status: 'ok' });
    } catch (e) {
      results.push({ collection: 'billionaires', action: 'upsert', id: b._id, name: b.name, status: 'error', message: e.message });
    }
  }

  // ---- 1.5 初始化商品集合（doc().set，_id 不能出现在 data 中）----
  for (const p of products) {
    try {
      const { _id, ...dataWithoutId } = p;
      await db.collection('products').doc(_id).set({ data: dataWithoutId });
      results.push({ collection: 'products', action: 'upsert', id: _id, name: p.name, status: 'ok' });
    } catch (e) {
      results.push({ collection: 'products', action: 'upsert', id: p._id, name: p.name, status: 'error', message: e.message });
    }
  }

  // ---- 2. 生成 Mock 账单 ----
  const now = Date.now();
  const oneDay = 86400000;
  const mockBills = [];

  const billionairePool = billionaires.map(b => ({ id: b._id, name: b.name }));
  const modes = ['normal', 'timed', 'challenge'];
  const budgets = [10000000, 30000000, 50000000, 80000000, 100000000];

  const billProductPool = products.map(p => ({ id: p._id, name: p.name, price: p.price }));

  for (let i = 0; i < 5; i++) {
    const mode = modes[randomInt(0, 2)];
    const budget = budgets[randomInt(0, budgets.length - 1)];
    const pickedProducts = pickRandom(billProductPool, 3, 8);
    const total = pickedProducts.reduce((sum, p) => sum + p.price, 0);
    const billionaire = billionairePool[randomInt(0, billionairePool.length - 1)];

    mockBills.push({
      openid: OPENID,
      billionaireId: billionaire.id,
      billionaireName: billionaire.name,
      products: pickedProducts.map(p => ({ ...p, qty: 1 })),
      total: total,
      budget: budget,
      over: Math.max(0, total - budget),
      success: total >= budget * 0.9,
      mode: mode,
      createdAt: now - (4 - i) * oneDay
    });
  }

  for (const bill of mockBills) {
    try {
      await db.collection('bills').add({ data: bill });
      results.push({ collection: 'bills', action: 'insert', mode: bill.mode, total: bill.total, status: 'ok' });
    } catch (e) {
      results.push({ collection: 'bills', action: 'insert', mode: bill.mode, status: 'error', message: e.message });
    }
  }

  // ---- 3. 创建 Mock 用户档案 ----
  const mockProfile = {
    openid: OPENID,
    nickname: '富一代·布莱恩',
    avatar: '',
    vip: String(randomInt(10000, 99999)),
    role: '首席挥霍官',
    createdAt: now,
    updatedAt: now
  };

  try {
    // 检查是否已存在
    const existing = await db.collection('profiles').where({ openid: OPENID }).get();
    if (existing.data.length === 0) {
      await db.collection('profiles').add({ data: mockProfile });
      results.push({ collection: 'profiles', action: 'insert', nickname: mockProfile.nickname, status: 'ok' });
    } else {
      results.push({ collection: 'profiles', action: 'skip', reason: 'already exists' });
    }
  } catch (e) {
    results.push({ collection: 'profiles', action: 'insert', status: 'error', message: e.message });
  }

  // ---- 4. 创建 Mock 对战房间 ----
  const mockRoom = {
    code: 'BTL-' + String(randomInt(1000, 9999)),
    status: 'waiting',
    hostOpenid: OPENID,
    players: [
      { openid: OPENID, nickname: mockProfile.nickname, avatar: '', isHost: true, slot: 'P1', amount: 0 }
    ],
    createdAt: now,
    updatedAt: now
  };

  try {
    await db.collection('rooms').add({ data: mockRoom });
    results.push({ collection: 'rooms', action: 'insert', code: mockRoom.code, status: 'ok' });
  } catch (e) {
    results.push({ collection: 'rooms', action: 'insert', status: 'error', message: e.message });
  }

  return {
    success: true,
    openid: OPENID,
    summary: {
      billionaires: billionaires.length,
      products: products.length,
      bills: mockBills.length,
      profiles: 1,
      rooms: 1
    },
    results: results
  };
};
