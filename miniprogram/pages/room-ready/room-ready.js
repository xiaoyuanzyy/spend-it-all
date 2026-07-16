// pages/room-ready/room-ready.js
const app = getApp();
const cloud = require('../../utils/cloud.js');

Page({
  data: {
    code: '',
    isHost: false,
    players: []
  },

  onLoad(options) {
    this.setData({
      code: options.code || 'BTL-0000',
      isHost: options.host === '1' || options.start === '1'
    });
    this.loadPlayers();
  },

  async loadPlayers() {
    try {
      const res = await cloud.getRoom({ code: this.data.code });
      if (res && res.players) this.setData({ players: res.players });
    } catch (e) {
      this.setData({
        players: [
          { openid: 'p1', nickname: '富一代·布莱恩', avatar: '', isHost: true, slot: 'P1' },
          { openid: 'p2', nickname: '铁公鸡·杰克', avatar: '', isHost: false, slot: 'P2' },
          { openid: 'p3', nickname: '小富婆·苏珊', avatar: '', isHost: false, slot: 'P3' }
        ]
      });
    }
  },

  onStart() {
    cloud.startRoom({ code: this.data.code }).then(() => {
      // 30 秒后跳到结果页（模拟计时）
      setTimeout(() => {
        const result = {
          winner: this.data.players[0],
          players: this.data.players.map((p, i) => ({
            ...p,
            amount: 52340000 - i * 14000000 - Math.floor(Math.random() * 5000000)
          }))
        };
        app.globalData.challengeResult = result;
        wx.redirectTo({ url: '/pages/result/result' });
      }, 30000);
      wx.showToast({ title: '挑战进行中… 30s', icon: 'none' });
    });
  },

  onExit() {
    wx.reLaunch({ url: '/pages/index/index' });
  }
});
