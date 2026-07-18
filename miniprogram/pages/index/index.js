// pages/index/index.js
const app = getApp();
const cloud = require('../../utils/cloud.js');
const { shortName, getAvatarChar } = require('../../utils/format.js');

// 20 色转盘调色板
const COLOR_PALETTE = [
  '#c0392b', '#d4a017', '#a82828', '#3a5f8a', '#e67e22',
  '#27ae60', '#8e44ad', '#2c5fc7', '#1abc9c', '#e74c3c',
  '#f39c12', '#2980b9', '#9b59b6', '#16a085', '#d35400',
  '#2ecc71', '#7f8c8d', '#e91e63', '#00bcd4', '#ff5722'
];

Page({
  data: {
    statusBarHeight: 20,
    sectors: [],        // [{name, color}] 从数据库构建
    tags: [],           // 去重后所有富豪标签
    rotateDeg: 0,
    spinning: false,
    selectedIndex: 0,
    billionaireList: [],  // 数据库原始数据
    wheelConicGradient: '',
    segmentAngle: 0,
    halfAngle: 0,
    // 欢迎弹窗（onLoad 时展示，onShow 从其他页面返回时不展示）
    showWelcome: false,
    nickname: '',
    // 富豪简介卡片
    showProfile: false,
    profileName: '',
    profileAvatar: '',
    profileNationality: '',
    profileCompanies: [],
    profileAssets: '',
    profileTags: [],
    profileMatchTags: [],
    profileCatchphrase: ''
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight });
    // 每次进入首页都展示欢迎弹窗（onShow 从其他页面返回时不触发）
    this.setData({ showWelcome: true });
    this.refreshNickname();
    this.loadBillionaires();
  },

  onShow() {
    // 返回页面时重新拉取，确保数据最新
    if (this.data.billionaireList.length === 0) {
      this.loadBillionaires();
    }
    // 每次返回刷新花名，确保与 profile 同步
    this.refreshNickname();
  },

  refreshNickname() {
    const userInfo = app.globalData.userInfo || {};
    const nickname = userInfo.nickname || userInfo.nickName || '神秘富豪';
    this.setData({ nickname });
  },

  async onPullDownRefresh() {
    await this.loadBillionaires();
    wx.stopPullDownRefresh();
  },

  async loadBillionaires() {
    let list = [];
    try {
      const res = await cloud.getBillionaire();
      if (res && res.list && res.list.length > 0) {
        list = res.list;
      }
    } catch (e) {
      console.warn('拉取富豪失败', e);
      wx.showToast({ title: '数据加载失败，请稍后重试', icon: 'none' });
      return;
    }

    if (list.length === 0) {
      wx.showToast({ title: '请先初始化数据库', icon: 'none' });
      return;
    }

    // 随机打乱取 8 位
    const shuffled = [...list].sort(() => Math.random() - 0.5);
    list = shuffled.slice(0, 8);

    const n = list.length;
    const segAngle = 360 / n;
    const halfAngle = segAngle / 2;
    const textR = 175;       // 文字距圆心距离
    const cx = 300;          // 转盘中心 x (600rpx / 2)
    const cy = 300;          // 转盘中心 y

    // 构建扇区：每个文字按 CSS 坐标系精确定位（0°=上方，顺时针，y 轴向下）
    const sectors = list.map((b, i) => {
      const centerAngle = i * segAngle + halfAngle;        // 扇区角平分线（CSS 角度）
      const rad = (centerAngle * Math.PI) / 180;
      const textLeft = Math.round(cx + textR * Math.sin(rad));   // CSS x = cx + r·sin(θ)
      const textTop  = Math.round(cy - textR * Math.cos(rad));    // CSS y = cy - r·cos(θ)
      const displayName = shortName(b.name);
      return {
        name: displayName,
        nationality: b.nationality || '',
        color: COLOR_PALETTE[i % COLOR_PALETTE.length],
        textLeft,
        textTop,
        textRotate: 0                    // 全部水平正向，不旋转
      };
    });

    // 构建 conic-gradient
    const gradientStops = sectors.map((s, i) => {
      const from = i * segAngle;
      const to = (i + 1) * segAngle;
      return `${s.color} ${from}deg ${to}deg`;
    }).join(', ');
    const wheelConicGradient = `background: conic-gradient(${gradientStops});`;

    // 收集所有标签（去重、打乱取前 8 个）
    const tagSet = new Set();
    list.forEach(b => (b.tags || []).forEach(t => tagSet.add(t)));
    const tags = [...tagSet].sort(() => Math.random() - 0.5).slice(0, 8);

    this.setData({
      billionaireList: list,
      sectors,
      tags,
      wheelConicGradient,
      segmentAngle: segAngle,
      halfAngle: halfAngle
    });
  },

  onTagTap(e) {
    const idx = e.currentTarget.dataset.idx;
    wx.showToast({ title: this.data.tags[idx], icon: 'none' });
  },

  onSpin() {
    if (this.data.spinning) return;
    const n = this.data.sectors.length;
    if (n === 0) return;
    this.setData({ spinning: true });

    const idx = Math.floor(Math.random() * n);
    const segDeg = 360 / n;
    // 基于当前角度累加，保证每次至少转 6 圈
    const currentDeg = this.data.rotateDeg;
    const fullSpins = Math.floor(currentDeg / 360) + 6;
    const baseDeg = fullSpins * 360;
    const target = baseDeg + (360 - idx * segDeg - segDeg / 2);

    this.setData({
      rotateDeg: target,
      selectedIndex: idx
    });

    setTimeout(() => {
      this.setData({ spinning: false });

      const billionaire = this.data.billionaireList[idx];
      const sel = this.data.sectors[idx];
      if (!billionaire) return;

      const matchTags = (billionaire.matchTags && billionaire.matchTags.length) ? billionaire.matchTags : (billionaire.tags || []);
      app.globalData.currentBillionaire = {
        id: billionaire._id,  // 云数据库 _id 是字符串，不能 parseInt
        name: billionaire.name,
        nationality: billionaire.nationality,
        companies: billionaire.companies,
        assets: billionaire.assets,
        tags: billionaire.tags,
        matchTags: matchTags,
        catchphrase: billionaire.catchphrase,
        avatar: billionaire.avatar
      };

      // 弹出内联富豪简介卡片
      const formattedAssets = '$' + ((billionaire.assets || 0)).toLocaleString('en-US');
      this.setData({
        showProfile: true,
        profileName: billionaire.name || '',
        profileAvatar: getAvatarChar(billionaire.name),
        profileNationality: billionaire.nationality || '',
        profileCompanies: billionaire.companies || [],
        profileAssets: formattedAssets,
        profileTags: billionaire.tags || [],
        profileMatchTags: matchTags || [],
        profileCatchphrase: billionaire.catchphrase || ''
      });
    }, 4000);
  },

  onShowProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' });
  },

  onShowLeaderboard() {
    wx.navigateTo({ url: '/pages/leaderboard/leaderboard' });
  },

  onFeedback() {
    wx.navigateTo({ url: '/pages/feedback/feedback' });
  },

  // 关闭富豪简介卡片
  onCloseProfile() {
    this.setData({ showProfile: false });
  },

  // 从简介卡片 → 限时消费
  onStartTimed() {
    app.globalData.currentMode = 'timed';
    app.globalData.budget = app.globalData.currentBillionaire.assets;
    app.globalData.spent = 0;
    wx.redirectTo({ url: '/pages/shop-normal/shop-normal' });
  },

  // 从简介卡片 → 好友对战
  onStartChallenge() {
    app.globalData.currentMode = 'challenge';
    wx.redirectTo({ url: '/pages/challenge/challenge' });
  },

  // 从简介卡片 → 普通消费
  onStartNormal() {
    app.globalData.currentMode = 'normal';
    app.globalData.budget = app.globalData.currentBillionaire.assets;
    app.globalData.spent = 0;
    wx.redirectTo({ url: '/pages/shop-normal/shop-normal' });
  },

  // 点击欢迎弹窗按钮 → 关闭弹窗并自动抽取
  onWelcomeTap() {
    this.setData({ showWelcome: false });
    // 延迟一下让弹窗消失动画播放，然后自动触发转盘
    setTimeout(() => {
      if (!this.data.spinning && this.data.sectors.length > 0) {
        this.onSpin();
      }
    }, 400);
  },

  // 点击✕关闭弹窗 → 仅关闭，不自动抽取
  onWelcomeClose() {
    this.setData({ showWelcome: false });
  },

  noop() {}
});
