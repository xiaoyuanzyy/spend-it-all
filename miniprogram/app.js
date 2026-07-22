// app.js

const { getAvatarChar } = require('./utils/format.js');

// 花光富豪花名册 —— 三阶拼接，霸气狂拽（20×20×20=8000种组合）
const NAME_PARTS = {
  // 霸气前缀 —— 镇场开篇
  adj: [
    '至尊', '无极', '绝世', '万界', '九天', '混沌', '太古', '不灭', '盖世', '乾坤',
    '破天', '镇世', '洪荒', '无双', '永恒', '不朽', '太初', '开天', '葬神', '戮仙'
  ],
  // 挥霍动作 —— 核心行为
  act: [
    '散财', '败家', '挥金', '烧钱', '花光', '扫货', '豪掷', '狂买', '撒钱', '剁手',
    '焚金', '碎银', '吞富', '噬财', '毁奢', '湮钱', '葬豪', '斩贵', '诛俭', '灭吝'
  ],
  // 霸气称号 —— 压轴收尾
  title: [
    '大帝', '霸主', '战神', '魔尊', '圣君', '天尊', '神皇', '圣王', '天帝', '魔王',
    '仙君', '龙帝', '霸皇', '圣帝', '神主', '大君', '尊者', '武神', '剑圣', '皇帝'
  ]
};

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
        env: 'cloud1-d7gtho7lwbea60e4f',
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

  // 三阶拼接生成霸气花名：{adj}·{act}·{title}
  generateName() {
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const adj = pick(NAME_PARTS.adj);
    const act = pick(NAME_PARTS.act);
    const title = pick(NAME_PARTS.title);
    return `${adj}·${act}·${title}`;
  },

  // 递归尝试随机花名直到不重名（组合空间8000个，几乎不会重名）
  async generateUniqueName(retry) {
    retry = retry || 0;
    let name = this.generateName();

    if (retry < 50) {
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
