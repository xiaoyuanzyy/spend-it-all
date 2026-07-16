// pages/room-ready/room-ready.js
const app = getApp();
const cloud = require('../../utils/cloud.js');

Page({
  data: {
    code: '',
    isHost: false,
    players: [],
    statusBarHeight: 0
  },

  onLoad(options) {
    const sys = wx.getSystemInfoSync();
    this.setData({
      code: options.code || 'BTL-0000',
      isHost: options.host === '1' || options.start === '1',
      statusBarHeight: sys.statusBarHeight || 44
    });
    this.loadPlayers();
  },

  async loadPlayers() {
    const userInfo = app.globalData.userInfo || {};
    const myNick = userInfo.nickname || userInfo.nickName || '我';
    const myAvatar = userInfo.avatarUrl || '';

    try {
      const res = await cloud.getRoom({ code: this.data.code });
      if (res && res.players) {
        const openid = app.globalData.openid;
        const players = res.players.map(p => ({
          ...p,
          isMe: p.openid === openid,
          nickname: p.openid === openid ? myNick : p.nickname
        }));
        this.setData({ players });
      }
    } catch (e) {
      this.setData({
        players: [
          { openid: 'p1', nickname: myNick, avatar: myAvatar, isHost: true, slot: 'P1', isMe: true },
          { openid: 'p2', nickname: '铁公鸡·杰克', avatar: '', isHost: false, slot: 'P2', isMe: false },
          { openid: 'p3', nickname: '小富婆·苏珊', avatar: '', isHost: false, slot: 'P3', isMe: false }
        ]
      });
    }
  },

  onShareAppMessage() {
    return {
      title: `来对战吧！房间号 ${this.data.code}`,
      path: `/pages/room-wait/room-wait?code=${this.data.code}`,
      imageUrl: ''
    };
  },

  onStart() {
    cloud.startRoom({ code: this.data.code }).then(() => {
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
    wx.showModal({
      title: '确认退出',
      content: '退出后房间将被销毁',
      success: r => {
        if (r.confirm) wx.reLaunch({ url: '/pages/index/index' });
      }
    });
  }
});
