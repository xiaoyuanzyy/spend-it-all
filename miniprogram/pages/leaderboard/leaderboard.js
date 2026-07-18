// pages/leaderboard/leaderboard.js
const app = getApp();
const cloud = require('../../utils/cloud.js');

// 将 ISO 时间差渲染为"霸榜时长"文字
function formatReign(isoStart) {
  if (!isoStart) return '';
  const start = new Date(isoStart).getTime();
  const diff = Date.now() - start;
  if (diff < 0) return '刚刚登顶';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return minutes <= 1 ? '刚刚登顶' : `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  if (hours < 24) return remainMin > 0 ? `${hours}小时${remainMin}分钟` : `${hours}小时`;
  const days = Math.floor(hours / 24);
  const remainHr = hours % 24;
  if (days < 30) return remainHr > 0 ? `${days}天${remainHr}小时` : `${days}天`;
  const months = Math.floor(days / 30);
  return `${months}个月`;
}

Page({
  data: {
    list: [],
    loading: true,
    statusBarHeight: 44,
    myIndex: -1,
    reignDuration: ''
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight || 44 });
    this.loadRankings();
  },

  async loadRankings() {
    this.setData({ loading: true });
    try {
      const res = await cloud.getLeaderboard();
      if (res && res.ok && res.list) {
        const myOpenid = app.globalData.openid;
        let myIndex = -1;
        const list = res.list.map((item, i) => {
          if (item.openid === myOpenid) myIndex = i;
          return {
            ...item,
            rank: i + 1,
            rankMedal: i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : '')),
            roleClass: item.role === '挥霍之神' ? 'god' :
                       item.role === '传奇挥霍官' ? 'legend' :
                       item.role === '首席挥霍官' ? 'chief' :
                       item.role === '资深挥霍官' ? 'senior' : 'junior'
          };
        });
        this.setData({ list, loading: false, myIndex, reignDuration: formatReign(res.reignStart) });
      } else {
        this.setData({ loading: false, list: [] });
      }
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onGoRules() {
    wx.navigateTo({ url: '/pages/rules/rules' });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  }
});
