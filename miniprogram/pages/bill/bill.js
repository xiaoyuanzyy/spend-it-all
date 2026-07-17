// pages/bill/bill.js
const app = getApp();
const cloud = require('../../utils/cloud.js');
const { formatMoney, formatCNY, shortName } = require('../../utils/format.js');

Page({
  data: {
    items: [],
    totalDisplay: '$0',
    overDisplay: '$0',
    remainingDisplay: '$0',
    isOver: false,
    period: '',
    billionName: '',
    billionAvatar: '',
    remainingAssetsDisplay: '',
    assetsLabel: '资产',
    billionTags: [],
    billionCatchphrase: '',
    mode: 'normal',
    modeLabel: '普通消费',
    scrollHeight: 400,
    totalQty: 0,
    itemTypes: 0,
    progress: 0,
    stars: 1,
    starsText: '★☆☆☆☆',
    moodEmoji: '😡',
    statusBarHeight: 44,
    showFireworks: false,
    confetti: [],
    conqueredText: '',
    conqueredSub: '',
    medalLabel: '获得挥霍大师勋章',
    showMedal: false,
    showChallengeMedal: false,
    conquered: false,
    conqueredMedalName: '',
    challengeMedalWon: false,
    showAchievements: false,
    showChallengeResult: false,
    challengeAllDone: false
  },

  onLoad() {
    const result = app.globalData.billResult || { products: [], total: 0, budget: 0, success: false, billionaire: null };
    console.log('[bill] onLoad result.mode:', result.mode);
    const billionaire = result.billionaire || { name: '富豪' };
    const items = (result.products || []).map(p => ({
      ...p,
      unitPriceDisplay: formatMoney(p.price)
    }));
    const over = Math.max(0, result.total - result.budget);
    const remaining = Math.max(0, result.budget - result.total);
    // 富豪剩余资产 = 预算 - 已花费（正数=没花完，负数/零=花完了）
    const remainingAssets = result.budget - result.total;
    const assetsLabel = '剩余资产';
    const remainingAssetsDisplay = remainingAssets >= 0
      ? formatCNY(remainingAssets)
      : '-' + formatCNY(Math.abs(remainingAssets));
    // 花费进度百分比
    const progress = result.budget > 0 ? Math.round(result.total / result.budget * 100) : 0;
    // 星级：每20%一颗星，最低1星，超100%也是5星
    let stars = 1;
    if (progress >= 100) stars = 5;
    else if (progress >= 80) stars = 4;
    else if (progress >= 60) stars = 3;
    else if (progress >= 40) stars = 2;
    else if (progress >= 20) stars = 1;
    // 生成星级字符串 ★☆☆☆☆
    let starsText = '';
    for (let i = 0; i < 5; i++) starsText += i < stars ? '★' : '☆';
    // 计算商品总件数和种类数
    let totalQty = 0;
    items.forEach(item => { totalQty += item.qty || 0; });
    // 模式映射
    const modeMap = { normal: '普通消费', timed: '限时消费', challenge: '好友挑战' };
    const modeLabel = modeMap[result.mode] || '普通消费';
    const isChallenge = result.mode === 'challenge';
    this.setData({
      items,
      totalDisplay: formatCNY(result.total),
      overDisplay: formatCNY(over),
      remainingDisplay: formatCNY(remaining),
      isOver: over > 0,
      billionName: billionaire.name,
      billionAvatar: billionaire.avatar || '',
      remainingAssetsDisplay,
      assetsLabel,
      billionTags: billionaire.tags || [],
      billionCatchphrase: billionaire.catchphrase || '',
      period: '加载中…',
      mode: result.mode || 'normal',
      modeLabel,
      totalQty,
      itemTypes: items.length,
      progress,
      starsText,
      moodEmoji: stars >= 3 ? '😊' : '😡'
    });
    // 花费达到 100%：征服富豪标记
    if (progress >= 100) {
      const medalName = isChallenge ? '获得征服富豪勋章' : '获得挥霍大师勋章';
      this.setData({ conquered: true, conqueredMedalName: medalName });
    }
    // 挑战模式胜利：标记
    if (isChallenge && result.success) {
      this.setData({ challengeMedalWon: true });
    }

    // 有成就的话，如果是历史账单直接显示，非历史的等动画结束再显示
    if (progress >= 100 || (isChallenge && result.success)) {
      if (result.fromHistory) {
        this.setData({ showAchievements: true });
      }
    }

    // 历史账单：跳过上传和礼花
    if (result.fromHistory) {
      this.setData({ period: `2026财年 — 第${result.period || '?'}期` });
      return;
    }
    // 先上传账单，完成后查询期数
    this.uploadBillAndFetchPeriod(result);

    // 花费达到 100%：征服富豪，触发礼花 + 征服勋章（所有模式通用）
    if (progress >= 100) {
      this.startFireworks(billionaire.name, result.mode);
    }
    // 挑战模式胜利：额外展示挑战胜利勋章
    if (isChallenge && result.success) {
      this.startChallengeWinMedal();
    }
  },

  async uploadBillAndFetchPeriod(result) {
    const saveRes = await this.uploadBill(result);
    // 使用云函数返回的固定期数，不受删除影响
    const period = (saveRes && saveRes.period) ? saveRes.period : 1;
    this.setData({ period: `2026财年 — 第${period}期` });

    // 挑战模式：保存账单后显示挑战结果入口
    if (result.mode === 'challenge') {
      const challengeRes = app.globalData.challengeResult;
      if (challengeRes && challengeRes.allDone) {
        this.setData({ showChallengeResult: true, challengeAllDone: true });
      } else {
        this.setData({ showChallengeResult: true, challengeAllDone: false });
      }
    }
  },

  onReady() {
    // 获取状态栏高度用于自定义导航栏
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight || 44 });
    // 缓存窗口尺寸给礼花用
    this._screenW = sys.windowWidth;
    this._screenH = sys.windowHeight;

    // 测量固定区域高度：header + 消费概览卡片 + 底部操作栏
    const query = wx.createSelectorQuery();
    let headerH = 0, cardH = 0, bottomH = 0;
    query.select('#bill-header').boundingClientRect(rect => { if (rect) headerH = rect.height; });
    query.select('.spend-hero').boundingClientRect(rect => { if (rect) cardH = rect.height + 24; });
    query.select('#bill-bottom').boundingClientRect(rect => { if (rect) bottomH = rect.height; });
    query.exec(() => {
      const h = sys.windowHeight - headerH - cardH - bottomH - 20;
      if (h > 0) this.setData({ scrollHeight: h });
    });
  },

  uploadBill(result) {
    return new Promise(async (resolve) => {
      // 等待 openid 就绪
      let retries = 0;
      while (!app.globalData.openid && retries < 60) {
        await new Promise(r => setTimeout(r, 500));
        retries++;
      }
      if (!app.globalData.openid) {
        console.warn('[bill] 账单上传失败：等待 openid 超时');
        resolve(null);
        return;
      }
      try {
        const res = await cloud.saveBill({
          billionaireId: (result.billionaire && result.billionaire.id) || 0,
          billionaireName: (result.billionaire && result.billionaire.name) || '富豪',
          products: result.products,
          total: result.total,
          budget: result.budget,
          over: Math.max(0, result.total - result.budget),
          success: result.success,
          mode: result.mode || 'normal',
          createdAt: Date.now()
        });
        resolve(res);
      } catch (e) {
        console.warn('[bill] 账单上传失败', e);
        resolve(null);
      }
    });
  },

  onReplay() {
    this.stopFireworks();
    wx.reLaunch({ url: '/pages/index/index' });
  },

  onViewChallengeResult() {
    this.stopFireworks();
    wx.redirectTo({ url: '/pages/result/result' });
  },

  onBack() {
    this.stopFireworks();
    wx.reLaunch({ url: '/pages/index/index' });
  },

  startFireworks(name, mode) {
    const colors = ['#d4af37', '#e74c3c', '#2ecc71', '#3498db', '#f39c12', '#9b59b6', '#1abc9c', '#e91e63'];
    const confetti = [];
    for (let i = 0; i < 60; i++) {
      confetti.push({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 2,
        duration: 2 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 8 + Math.random() * 14,
        rotation: Math.random() * 360,
        shape: Math.random() > 0.5 ? 'circle' : 'rect'
      });
    }
    const isChallenge = mode === 'challenge';
    const medalName = isChallenge ? '获得征服富豪勋章' : '获得挥霍大师勋章';
    this.setData({
      showFireworks: true,
      confetti,
      conqueredText: '恭喜你征服了' + (name || '富豪') + '！',
      conqueredSub: isChallenge
        ? '🎉 一边对战一边把钱花完了！🎉'
        : '🎉 挥霍大师！所有预算花得一干二净 🎉',
      medalLabel: medalName,
      conquered: true,
      conqueredMedalName: medalName
    });

    // 勋章延迟 1 秒出场
    this._medalTimer = setTimeout(() => {
      this.setData({ showMedal: true });
    }, 1000);

    // 5 秒后动画消失，成就徽章浮现
    this._fireworkTimer = setTimeout(() => {
      this.setData({ showFireworks: false, showMedal: false, showChallengeMedal: false, showAchievements: true });
    }, 5000);
  },

  // 挑战模式胜利勋章
  startChallengeWinMedal() {
    this.setData({ challengeMedalWon: true });
    this._challengeMedalTimer = setTimeout(() => {
      this.setData({ showChallengeMedal: true });
    }, 500);
    // 复用 fireworks 消失定时（如果征服勋章已触发则共享定时器，否则单独设）
    if (!this._fireworkTimer) {
      this._fireworkTimer = setTimeout(() => {
        this.setData({ showFireworks: false, showMedal: false, showChallengeMedal: false, showAchievements: true });
      }, 5000);
    }
  },

  stopFireworks() {
    if (this._fireworkTimer) {
      clearTimeout(this._fireworkTimer);
      this._fireworkTimer = null;
    }
    if (this._medalTimer) {
      clearTimeout(this._medalTimer);
      this._medalTimer = null;
    }
    if (this._challengeMedalTimer) {
      clearTimeout(this._challengeMedalTimer);
      this._challengeMedalTimer = null;
    }
  },

  onTapFireworks() {
    this.stopFireworks();
    this.setData({ showFireworks: false, showMedal: false, showChallengeMedal: false, showAchievements: true });
  },

  onShareAppMessage() {
    const { billionName, modeLabel, totalDisplay, progress, starsText } = this.data;
    return {
      title: `我${modeLabel === '好友挑战' ? '挑战' : ''}${billionName}${progress >= 100 ? '已征服' : '花了' + totalDisplay} | 挥霍大师`,
      path: '/pages/index/index'
    };
  },

  onHistory() {
    wx.navigateTo({ url: '/pages/profile/profile' });
  },
});
