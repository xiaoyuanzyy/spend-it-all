// app.js

const { getAvatarChar } = require('./utils/format.js');

// 花光富豪花名册 —— 霸气狂拽，专治各种不服（300个）
const COOL_NAMES = [
  // —— 帝王级（20个） ——
  '挥霍大帝', '散财天子', '败家帝王', '烧金霸主', '花光教主',
  '扫货至尊', '豪掷王爵', '狂买帝君', '撒钱皇者', '亿万君主',
  '挥金统帅', '烧财元帅', '金库清道夫', '豪门终结者', '财富粉碎机',
  '资产蒸发师', '余额清零者', '千金散尽人', '万贯归零客', '富可敌国贼',

  // —— 狂徒级（30个） ——
  '挥金狂徒', '败家悍匪', '烧钱疯子', '散财赌徒', '花光暴徒',
  '扫货狂徒', '豪掷狂人', '狂买魔头', '撒钱恶霸', '亿万赌棍',
  '挥霍无度', '散尽千金', '花钱不眨眼', '月光族族长', '剁手党魁首',
  '败家子掌门', '购物车杀手', '秒杀狂魔', '返现猎人', '免单锦鲤',
  '扫货机器', '买买买教主', '清空购物车', '双十一战神', '六一八狂徒',
  '直播扫货王', '盲盒收割机', '限量终结者', '绝版收藏家', '典藏狂魔',

  // —— 速度级（25个） ——
  '烧钱光速侠', '挥金闪电客', '败家一阵风', '撒钱如流水', '花金似瀑布',
  '扫货龙卷风', '豪掷穿云箭', '狂买过山车', '亿万过隙驹', '散财流星雨',
  '挥霍倒计时', '花光倒计时', '金库见底日', '余额归零时', '零元倒计时',
  '烧金倒数王', '败家加速度', '花钱无刹车', '剁手不停歇', '购物无极限',
  '秒光一亿', '花光一百亿', '散尽千万金', '豪掷百万银', '挥金如粪土',

  // —— 身份级（30个） ——
  '挥金继承人', '败家富二代', '烧钱拆二代', '散财暴发户', '花光拆迁户',
  '扫货阔少爷', '豪掷大小姐', '狂买太子爷', '撒钱大小姐', '亿万继承人',
  '豪门败家子', '世家散财童', '财阀清账人', '矿主傻儿子', '煤老板千金',
  '房姐败家女', '拆哥撒钱王', '币圈暴富者', '股神清仓人', '风投冤大头',
  '上市套现王', '退税款到账', '中奖幸运儿', '遗产继承人', '信托破壁人',
  '基金回撤侠', '理财暴雷者', '对冲爆仓人', '杠杆断头台', '虚拟经济人',

  // —— 怪物级（25个） ——
  '烧金饕餮', '挥霍貔貅', '败家穷奇', '散财梼杌', '花光混沌',
  '扫货鲲鹏', '豪掷麒麟', '狂买蛟龙', '撒钱饕餮', '亿万年兽',
  '挥金食铁兽', '败金吞金兽', '烧银嗑金币', '散尽纸熔炉', '花光碎钞机',
  '扫货吸尘器', '豪掷压路机', '狂买推土机', '撒钱播种机', '亿万收割机',
  '金库掘墓人', '钱包送葬者', '余额斩首台', '钞票焚化炉', '资产核弹头',

  // —— 武器级（25个） ——
  '烧钱导弹', '挥金核武', '败家航母', '散财战舰', '花光歼星舰',
  '扫货坦克', '豪掷重炮', '狂买炸弹', '撒钱手雷', '亿万鱼雷',
  '消费核弹', '购物赤兔', '刷卡方天戟', '支付青龙刀', '结账开天斧',
  '秒杀倚天剑', '抢购屠龙刀', '免单打神鞭', '返现金箍棒', '提货芭蕉扇',
  '下单翻天印', '支付轩辕剑', '分期东皇钟', '花呗盘古幡', '白条封神榜',

  // —— 职业级（30个） ——
  '挥金顾问', '败家规划师', '烧钱分析师', '散财策略师', '花光教练',
  '扫货买手', '豪掷评估师', '狂买体验官', '撒钱设计师', '亿万营养师',
  '私人烧金师', '首席败家官', '豪华消费师', '至尊挥霍家', '金牌倒爷',
  '钻石剁手', '铂金购物狂', '星耀扫货王', '王者买家', '荣耀消费者',
  '顶格支付员', '满额刷卡师', '无限额度侠', '永不透支神', '额度拉满人',
  '黑卡持有者', '无限卡掌门', '透支卡教主', '信用卡暴君', '储蓄卡克星',

  // —— 特效级（25个） ——
  '败家闪电', '散财惊雷', '烧钱飓风', '挥金海啸', '花光地震',
  '扫货火山', '豪掷雪崩', '狂买山洪', '撒钱冰雹', '亿万陨石',
  '消费黑洞', '购物白洞', '支付日冕', '刷卡极光', '结账彩虹',
  '提货幻象', '秒杀幻影', '抢购残影', '免单幻梦', '返现海市',
  '限量蜃楼', '典藏泡影', '绝版烟云', '收藏过眼', '金库海沟',

  // —— 江湖级（25个） ——
  '挥金一刀', '败家剑圣', '散财刀皇', '烧钱枪神', '花光棍帝',
  '扫货鞭王', '豪掷戟霸', '狂买斧尊', '撒钱锤仙', '亿万镖师',
  '消费宗师', '购物掌门', '支付帮主', '刷卡门主', '结账堂主',
  '免单香主', '返现舵主', '提货坛主', '秒杀分舵', '抢购总舵',
  '土豪盟主', '富豪克星', '财主噩梦', '富翁灾星', '阔佬瘟神',

  // —— 终极级（25个） ——
  '花钱花到死', '烧钱烧到手软', '败家败到天亮', '挥霍到天荒地老',
  '散财散尽还复来', '花光千金不复还', '千金散尽还复来', '万金一挥如粪土',
  '视金钱如粪土', '挥千金如敝屣', '散万贯若浮云', '花亿万家财如流水',
  '购物车填不满', '欲望看不到边', '刷卡永远不累', '支付从来不看',
  '价格不是问题', '数量没有上限', '额度永远拉满', '奢侈从不眨眼',
  '你家有矿吗', '钱是王八蛋', '花完再去赚', '余额什么玩意', '我只管花',

  // —— 霸气绝杀（40个） ——
  '让富豪破产的男人', '让富翁流泪的女人', '财阀见了都绕道',
  '首富见了连夜逃', '马爸爸的噩梦', '王校长的天敌', '煤老板的克星',
  '拆二代的终结者', '让钱包闻风丧胆', '令银行胆战心惊', '使金库望而生畏',
  '花到你怀疑人生', '买到你倾家荡产', '扫到你一无所有', '刷到你无卡可用',
  '吞金无底洞', '烧钱永动机', '花钱小能手', '败家第一名',
  '挥霍冠军', '散财状元', '花光榜眼', '烧钱探花',
  '剁手第一人', '购物第一狂', '消费第一狠', '刷卡第一猛',
  '富豪绞肉机', '资产榨汁机', '金钱黑洞', '财富漩涡',
  '挥金大魔王', '败家总教头', '散财大宗师', '花光是信仰'
];

App({
  globalData: {
    userInfo: null,        // { nickName, avatarUrl }
    openid: null,
    currentBillionaire: null,
    currentMode: 'normal', // normal | timed | challenge
    budget: 50000000,
    spent: 0,
    roomCode: null,
    profileReady: false    // 花名初始化完成标记
  },

  onLaunch() {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('当前微信版本过低，请升级到最新微信');
    } else {
      wx.cloud.init({
        env: 'cloud1-d2g5khfkv2a660d00',
        traceUser: true
      });
    }
    // 登录 + 初始化花名
    this.loginAndInit();
  },

  // 登录获取 openid，完成后初始化花名
  loginAndInit() {
    const that = this;

    // 读取已有 profile 缓存
    wx.getStorage({
      key: 'profile',
      success(res) {
        that.globalData.userInfo = that.globalData.userInfo || {};
        const p = res.data || {};
        that.globalData.userInfo.nickname = p.nickname;
        that.globalData.userInfo.nickName = p.nickname;
      }
    });

    // 获取 openid
    wx.getStorage({
      key: 'openid',
      success(res) {
        that.globalData.openid = res.data;
        that.callLogin();
      },
      fail() {
        that.callLogin();
      }
    });
  },

  callLogin() {
    const that = this;
    wx.cloud.callFunction({
      name: 'login',
      data: {},
      success(loginRes) {
        that.globalData.openid = loginRes.result.openid;
        wx.setStorage({ key: 'openid', data: loginRes.result.openid });
        that.initNickname();
      },
      fail() {
        // 登录失败：先用缓存 openid 兜底，避免后续 openid 永远为空
        try {
          const cachedId = wx.getStorageSync('openid');
          if (cachedId) that.globalData.openid = cachedId;
        } catch (e) { /* ignore */ }
        that.initNickname();
      }
    });
  },

  // 初始化花名：本地 profile 缓存 → 云端 → 新用户生成
  async initNickname() {
    // 1. 检查本地 profile 缓存（我们自己写的，最可靠）
    try {
      const cached = wx.getStorageSync('profile');
      if (cached && cached.nickname) {
        this.globalData.userInfo = this.globalData.userInfo || {};
        this.globalData.userInfo.nickname = cached.nickname;
        this.globalData.userInfo.nickName = cached.nickname;
        this.globalData.profileReady = true;
        return;
      }
    } catch (e) { /* ignore */ }

    // 2. 从云端获取资料
    try {
      const profileRes = await new Promise((resolve, reject) => {
        wx.cloud.callFunction({
          name: 'getProfile',
          data: {},
          success: r => resolve(r.result),
          fail: reject
        });
      });

      if (profileRes && profileRes.ok) {
        if (profileRes.isNew) {
          // 新用户：AI 生成唯一花名
          const name = await this.generateUniqueName();
          // 先存入本地缓存（无论云端是否成功，保证用户有花名可用）
          this.globalData.userInfo = this.globalData.userInfo || {};
          this.globalData.userInfo.nickname = name;
          this.globalData.userInfo.nickName = name;
          const avatarChar = getAvatarChar(name);
          wx.setStorageSync('profile', {
            nickname: name, avatar: avatarChar,
            vip: '0000420', role: '见习挥霍官'
          });
          // 尝试保存到云端（失败不影响本地使用，账单保存时会补建）
          try {
            await new Promise((resolve, reject) => {
              wx.cloud.callFunction({
                name: 'saveProfile',
                data: { nickname: name, avatar: avatarChar },
                success: r => resolve(r.result),
                fail: reject
              });
            });
          } catch (e) {
            console.warn('[initNickname] 云端保存失败，使用本地缓存');
          }
        } else if (profileRes.profile) {
          const p = profileRes.profile;
          this.globalData.userInfo = this.globalData.userInfo || {};
          this.globalData.userInfo.nickname = p.nickname;
          this.globalData.userInfo.nickName = p.nickname;
          wx.setStorageSync('profile', {
            nickname: p.nickname, avatar: p.avatar,
            vip: p.vip, role: p.role
          });
        }
      }
    } catch (e) {
      // 网络异常等，尝试用本地缓存兜底
      try {
        const cached = wx.getStorageSync('profile');
        if (cached && cached.nickname) {
          this.globalData.userInfo = this.globalData.userInfo || {};
          this.globalData.userInfo.nickname = cached.nickname;
          this.globalData.userInfo.nickName = cached.nickname;
        }
      } catch (e2) { /* ignore */ }
    }

    this.globalData.profileReady = true;
  },

  // 递归尝试随机花名直到不重名（最多 300 次，超出追加后缀）
  async generateUniqueName(retry) {
    retry = retry || 0;
    const idx = Math.floor(Math.random() * COOL_NAMES.length);
    let name = COOL_NAMES[idx];

    if (retry < COOL_NAMES.length) {
      try {
        const checkRes = await new Promise((resolve, reject) => {
          wx.cloud.callFunction({
            name: 'checkName',
            data: { nickname: name },
            success: r => resolve(r.result),
            fail: reject
          });
        });
        if (checkRes && checkRes.ok && checkRes.exists) {
          return this.generateUniqueName(retry + 1);
        }
      } catch (e) {
        // 网络异常等，直接用（降级）
      }
    } else {
      name = name + '-' + Math.floor(Math.random() * 9999 + 1);
    }
    return name;
  }

});
