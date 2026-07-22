// pages/bill/bill.js
const app = getApp();
const cloud = require('../../utils/cloud.js');
const { formatCNY } = require('../../utils/format.js');

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
    challengeAllDone: false,
    challengePollTimer: null,
    shareId: ''
  },

  async onLoad(options = {}) {
    // 通过分享卡片进入：从云端拉取账单数据
    let result = app.globalData.billResult;
    if (options.shareId) {
      wx.showLoading({ title: '加载账单…' });
      result = await this.fetchSharedBill(options.shareId);
      wx.hideLoading();
      if (result) {
        app.globalData.billResult = result;
      } else {
        // 分享账单加载失败，跳回首页
        wx.showToast({ title: '账单加载失败，请重试', icon: 'none', duration: 2000 });
        setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 2000);
        return;
      }
    }
    if (!result || !result.total) {
      result = { products: [], total: 0, budget: 0, success: false, billionaire: null };
    }
    // 分享进入的不需要再保存（已经是别人保存的）
    const isShared = !!options.shareId;
    console.log('[bill] onLoad result.mode:', result.mode, 'isShared:', isShared);
    const billionaire = result.billionaire || { name: '富豪' };
    const items = (result.products || []).map(p => ({
      ...p,
      unitPriceDisplay: formatCNY(p.price)
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
    const modeMap = { normal: '普通消费', timed: '限时消费', challenge: '好友对战' };
    const modeLabel = modeMap[result.mode] || '普通消费';
    const isChallenge = result.mode === 'challenge';
    const isTimed = result.mode === 'timed';
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
      let medalName;
      if (isChallenge) medalName = '获得征服富豪勋章';
      else if (isTimed) medalName = '获得限时征服勋章';
      else medalName = '获得挥霍大师勋章';
      this.setData({ conquered: true, conqueredMedalName: medalName });
    }
    // 挑战模式胜利：标记
    if (isChallenge && result.success) {
      this.setData({ challengeMedalWon: true });
    }

    // 有成就的话，如果是历史账单或分享账单直接显示，非历史的等动画结束再显示
    if (progress >= 100 || (isChallenge && result.success)) {
      if (result.fromHistory || isShared) {
        this.setData({ showAchievements: true });
      }
    }

    // 非分享的原始账单：保存到云数据库供分享使用（必须 await，确保 shareId 就绪后才能分享）
    if (!isShared && !result.fromHistory && options.from !== 'result') {
      await this.saveSharedBill(result);
    }

    // 分享账单或历史账单：跳过上传和礼花
    if (isShared || result.fromHistory) {
      const periodText = result.period ? `2026财年 — 第${result.period}期` : (isShared ? '好友分享的账单' : '加载中…');
      this.setData({ period: periodText });
      return;
    }
    // 从结果页回来看账单：不重复上传、不启动挑战轮询（否则会自动跳回结果页）
    if (options.from === 'result') {
      this.setData({ period: `2026财年 — 第${result.period || '?'}期` });
      // 有成就时，跳过动画直接显示勋章（动画已在结果页展示过）
      if (progress >= 100 || (isChallenge && result.success)) {
        this.setData({ showAchievements: true });
      }
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
    // 存到全局数据，方便从结果页回来看账单时复用期号
    if (app.globalData.billResult) {
      app.globalData.billResult.period = period;
    }

    // 挑战模式：保存账单后显示挑战结果入口
    if (result.mode === 'challenge') {
      const challengeRes = app.globalData.challengeResult;
      if (challengeRes && challengeRes.allDone) {
        this.setData({ showChallengeResult: true, challengeAllDone: true });
        // 双方都已完成：账单已保存，展示 1.5s 后自动跳转结果页
        setTimeout(() => {
          this.onViewChallengeResult();
        }, 1500);
      } else {
        this.setData({ showChallengeResult: true, challengeAllDone: false });
        // 轮询等待对手提交
        this.startChallengePoll();
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
        const userInfo = app.globalData.userInfo || {};
        const res = await cloud.saveBill({
          billionaireId: (result.billionaire && result.billionaire.id) || 0,
          billionaireName: (result.billionaire && result.billionaire.name) || '富豪',
          products: result.products,
          total: result.total,
          budget: result.budget,
          over: Math.max(0, result.total - result.budget),
          success: result.success,
          mode: result.mode || 'normal',
          createdAt: Date.now(),
          // 带上当前花名，saveBill 会据此补建 profile（被邀请新用户兜底）
          nickname: userInfo.nickname || userInfo.nickName || ''
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
    this.stopChallengePoll();
    wx.reLaunch({ url: '/pages/index/index' });
  },

  onBack() {
    this.stopFireworks();
    this.stopChallengePoll();
    wx.reLaunch({ url: '/pages/index/index' });
  },

  onUnload() {
    this.stopFireworks();
    this.stopChallengePoll();
  },

  onViewChallengeResult() {
    this.stopFireworks();
    this.stopChallengePoll();
    wx.redirectTo({ url: '/pages/result/result' });
  },

  // 轮询等待对手提交结果
  startChallengePoll() {
    this.stopChallengePoll();
    const pollTimer = setInterval(async () => {
      try {
        const room = await cloud.getRoom({ code: app.globalData.roomCode });
        if (room && room.status === 'finished' && room.players && room.players.length >= 2) {
          // 对手已提交，更新全局数据并跳转
          const billResult = app.globalData.billResult || {};
          const total = billResult.total || 0;
          const players = room.players;
          const maxAmount = Math.max(...players.map(p => p.amount || 0));
          const success = total >= maxAmount;

          app.globalData.challengeResult = room;
          app.globalData.billResult = { ...billResult, success };

          this.stopChallengePoll();
          wx.redirectTo({ url: '/pages/result/result' });
        }
      } catch (e) {
        // 轮询失败，静默忽略
      }
    }, 2000);
    this.setData({ challengePollTimer: pollTimer });
  },

  stopChallengePoll() {
    if (this.data.challengePollTimer) {
      clearInterval(this.data.challengePollTimer);
      this.setData({ challengePollTimer: null });
    }
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
    const isTimed = mode === 'timed';
    let medalName;
    if (isChallenge) medalName = '获得征服富豪勋章';
    else if (isTimed) medalName = '获得限时征服勋章';
    else medalName = '获得挥霍大师勋章';
    this.setData({
      showFireworks: true,
      confetti,
      conqueredText: '恭喜你征服了' + (name || '富豪') + '！',
      conqueredSub: isChallenge
        ? '🎉 一边对战一边把钱花完了！🎉'
        : (isTimed ? '🎉 争分夺秒地把钱花完了！🎉' : '🎉 挥霍大师！所有预算花得一干二净 🎉'),
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
    const { billionName, totalDisplay, progress, shareId } = this.data;
    // shareId 未就绪时不提供分享路径，避免接收方跳转到首页
    if (!shareId) {
      wx.showToast({ title: '账单数据准备中，请稍后再分享', icon: 'none', duration: 2000 });
      return { title: '', path: '/pages/index/index' };
    }
    const done = progress >= 100;
    return {
      title: `我替${billionName}${done ? '花光了' : '花了'}${totalDisplay}${done ? '' : '，进度' + progress + '%'}|花不完不许走`,
      path: `/pages/bill/bill?shareId=${shareId}`
    };
  },

  // 保存账单到共享库，返回文档 ID 供分享使用
  async saveSharedBill(result) {
    try {
      const res = await cloud.saveSharedBill({
        total: result.total || 0,
        budget: result.budget || 0,
        billionaire: result.billionaire || {},
        products: result.products || [],
        mode: result.mode || 'normal',
        success: result.success
      });
      if (res && res.ok && res._id) {
        this.setData({ shareId: res._id });
        console.log('[bill] sharedBill saved:', res._id);
      }
    } catch (e) {
      console.error('[bill] saveSharedBill failed:', e);
    }
  },

  // 从共享库拉取他人分享的账单
  async fetchSharedBill(shareId) {
    try {
      const res = await cloud.getSharedBill(shareId);
      if (!res || !res.ok || !res.data) {
        wx.showToast({ title: '账单不存在或已过期', icon: 'none' });
        return null;
      }
      const data = res.data;
      return {
        products: data.products || [],
        total: data.total || 0,
        budget: data.budget || 0,
        success: data.success,
        billionaire: data.billionaire || { name: '富豪' },
        mode: data.mode || 'normal',
        fromHistory: true
      };
    } catch (e) {
      console.error('[bill] fetchSharedBill failed:', e);
      wx.showToast({ title: '账单加载失败', icon: 'none' });
      return null;
    }
  },

  onHistory() {
    wx.navigateTo({ url: '/pages/profile/profile' });
  },
});
