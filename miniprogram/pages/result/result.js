// pages/result/result.js
const app = getApp();
const { formatK, formatCNY } = require('../../utils/format.js');

Page({
  data: {
    winner: null,
    ranking: []
  },

  onLoad() {
    const result = app.globalData.challengeResult || { players: [] };
    // 排序
    const sorted = [...result.players].sort((a, b) => (b.amount || 0) - (a.amount || 0));
    this.setData({
      winner: sorted[0] || {},
      ranking: sorted.map((p, i) => ({
        ...p,
        rank: i + 1,
        amountDisplay: formatCNY(p.amount || 0),
        amountShort: formatK(p.amount || 0)
      }))
    });
  },

  onReplay() {
    wx.reLaunch({ url: '/pages/index/index' });
  }
});
