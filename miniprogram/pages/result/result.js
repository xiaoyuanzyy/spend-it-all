// pages/result/result.js
const app = getApp();
const { formatCNY, formatK, getAvatarChar } = require('../../utils/format.js');

Page({
  data: {
    winner: null,
    ranking: [],
    // 动画状态
    showFireworks: false,
    confetti: [],
    showMedal1: false,
    showMedal2: false,
    medal1Label: '',
    medal2Label: '',
    heroText: '',
    heroSub: '',
    isWinner: false,
    isOverspent: false,
    showContent: false,
    // 征服信息
    billionaireName: '',
    spentDisplay: '',
    budgetDisplay: '',
    progress: 0,
    conquered: false,
    // 勋章列表（页面常驻展示）
    medals: [],
    earnedMedal1: '',
    earnedMedal2: ''
  },

  onLoad() {
    const challengeResult = app.globalData.challengeResult || { players: [] };
    const billResult = app.globalData.billResult || {};
    const billionaire = billResult.billionaire || {};
    const isWinner = billResult.success === true;
    const progress = billResult.budget > 0 ? Math.round((billResult.total || 0) / billResult.budget * 100) : 0;
    const isOverspent = progress >= 100;
    const conquered = progress >= 100;

    // 当前用户 openid
    let myOpenid = '';
    try { myOpenid = wx.getStorageSync('openid') || ''; } catch (e) { /* ignore */ }

    // 排行榜（按挥霍金额降序）
    const sorted = [...challengeResult.players].sort((a, b) => (b.amount || 0) - (a.amount || 0));

    const ranking = sorted.map((p, i) => ({
      ...p,
      rank: i + 1,
      avatar: getAvatarChar(p.nickname),
      amountDisplay: formatCNY(p.amount || 0),
      amountShort: formatK(p.amount || 0),
      isSelf: myOpenid && p.openid ? p.openid === myOpenid : (i === 0 ? isWinner : false)
    }));

    // 构建勋章列表
    const earnedMedal1 = conquered ? '征服富豪勋章' : '';
    const earnedMedal2 = isWinner ? '挑战王者勋章' : '';
    const medals = [];
    if (earnedMedal1) medals.push({ icon: '🏅', label: earnedMedal1, cls: '' });
    if (earnedMedal2) medals.push({ icon: '👑', label: earnedMedal2, cls: 'challenge' });

    this.setData({
      winner: sorted[0] || {},
      ranking,
      podiumCount: Math.max(0, sorted.length - 1),
      isWinner,
      isOverspent,
      conquered,
      progress,
      billionaireName: billionaire.name || '富豪',
      spentDisplay: formatCNY(billResult.total || 0),
      budgetDisplay: formatCNY(billResult.budget || 0),
      earnedMedal1,
      earnedMedal2,
      medals
    });

    // 触发动画
    if (isWinner) {
      this.startWinnerCelebration(isOverspent);
    } else if (isOverspent) {
      // 失败但钱花完了
      this.startLoserSpentAllCelebration();
    } else {
      // 直接显示内容
      this.setData({ showContent: true });
    }
  },

  // ========== 胜利者礼花 + 勋章 ==========
  startWinnerCelebration(isOverspent) {
    const heroText = isOverspent
      ? '🏆 挑战胜利！还征服了富豪！🏆'
      : '🏆 挑战胜利！';
    const heroSub = isOverspent
      ? '不仅赢了对手，还把预算花得一干二净'
      : '你比对手更懂得花钱的艺术';
    const medal1Label = isOverspent ? '征服富豪勋章' : '';
    const medal2Label = '挑战王者勋章';

    this.setData({
      heroText,
      heroSub,
      medal1Label,
      medal2Label,
      showContent: true
    });
    this.startFireworks();

    // 有征服勋章时才展示勋章1
    if (isOverspent) {
      this._medal1Timer = setTimeout(() => {
        this.setData({ showMedal1: true });
      }, 1000);
      // 勋章2：延迟 1.8s
      this._medal2Timer = setTimeout(() => {
        this.setData({ showMedal2: true });
      }, 1800);
    } else {
      // 只有挑战王者勋章，1s 后展示
      this._medal1Timer = setTimeout(() => {
        this.setData({ showMedal2: true });
      }, 1000);
    }

    // 5.5s 后收起动画
    this._endTimer = setTimeout(() => {
      this.setData({ showFireworks: false, showMedal1: false, showMedal2: false });
    }, 5500);
  },

  // ========== 失败但花完了 = 礼花 + 1个勋章 ==========
  startLoserSpentAllCelebration() {
    this.setData({
      heroText: '💸 挥霍一空！',
      heroSub: '虽然挑战失败，但钱花完了也是一种本事',
      medal1Label: '征服富豪勋章',
      medal2Label: '',
      showContent: true
    });
    this.startFireworks();

    // 勋章：延迟 1s
    this._medal1Timer = setTimeout(() => {
      this.setData({ showMedal1: true });
    }, 1000);

    // 5s 后收起
    this._endTimer = setTimeout(() => {
      this.setData({ showFireworks: false, showMedal1: false });
    }, 5000);
  },

  // ========== 礼花粒子 ==========
  startFireworks() {
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
    this.setData({ showFireworks: true, confetti });
  },

  // ========== 清理 ==========
  onUnload() {
    if (this._medal1Timer) clearTimeout(this._medal1Timer);
    if (this._medal2Timer) clearTimeout(this._medal2Timer);
    if (this._endTimer) clearTimeout(this._endTimer);
  },

  onBack() {
    wx.navigateBack();
  },

  onTapOverlay() {
    if (this._medal1Timer) clearTimeout(this._medal1Timer);
    if (this._medal2Timer) clearTimeout(this._medal2Timer);
    if (this._endTimer) clearTimeout(this._endTimer);
    this.setData({ showFireworks: false, showMedal1: false, showMedal2: false });
  },

  onReplay() {
    app.globalData.currentMode = 'challenge';
    wx.redirectTo({ url: '/pages/challenge/challenge' });
  },

  onViewBill() {
    wx.navigateTo({ url: '/pages/bill/bill?from=result' });
  }
});
