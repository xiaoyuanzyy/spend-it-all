// pages/room-ready/room-ready.js
const app = getApp();
const cloud = require('../../utils/cloud.js');

Page({
  data: {
    code: '',
    isHost: false,
    players: [],
    statusBarHeight: 0,
    pollTimer: null
  },

  onLoad(options) {
    const sys = wx.getSystemInfoSync();
    this.setData({
      code: options.code || 'BTL-0000',
      isHost: options.host === '1' || options.start === '1',
      statusBarHeight: sys.statusBarHeight || 44
    });
    this.loadPlayers();
    // 非房主轮询，等待房主发起挑战
    if (!this.data.isHost) {
      this.data.pollTimer = setInterval(() => this.checkGameStart(), 2000);
    }
  },

  onUnload() {
    if (this.data.pollTimer) clearInterval(this.data.pollTimer);
  },

  async checkGameStart() {
    try {
      const res = await cloud.getRoom({ code: this.data.code });
      if (res && res.status === 'started') {
        this.goToGame();
      }
    } catch (e) {
      // ignore
    }
  },

  async loadPlayers() {
    const userInfo = app.globalData.userInfo || {};
    const myNick = userInfo.nickname || userInfo.nickName || '我';
    const myAvatar = userInfo.avatarUrl || '';

    try {
      const res = await cloud.getRoom({ code: this.data.code });
      if (res && res.players) {
        // 使用房间中房主的富豪信息
        if (res.billionaire) {
          app.globalData.currentBillionaire = res.billionaire;
        }
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
      this.goToGame();
    }).catch(() => {
      wx.showToast({ title: '开始失败，请重试', icon: 'none' });
    });
  },

  async goToGame() {
    if (this.data.pollTimer) clearInterval(this.data.pollTimer);
    app.globalData.currentMode = 'challenge';
    app.globalData.roomCode = this.data.code;
    // 最后确认一次：从房间数据同步富豪（确保全员一致）
    await this.syncBillionaireFromRoom();
    const b = app.globalData.currentBillionaire;
    if (b && b.assets) {
      app.globalData.budget = b.assets;
    }
    app.globalData.spent = 0;
    wx.redirectTo({ url: '/pages/shop-normal/shop-normal' });
  },

  async syncBillionaireFromRoom() {
    try {
      const res = await cloud.getRoom({ code: this.data.code });
      if (res && res.billionaire && res.billionaire.name) {
        app.globalData.currentBillionaire = res.billionaire;
      }
    } catch (e) {
      // ignore
    }
  },

  onExit() {
    if (this.data.pollTimer) clearInterval(this.data.pollTimer);
    wx.showModal({
      title: '确认退出',
      content: '退出后房间将被销毁',
      success: r => {
        if (r.confirm) wx.reLaunch({ url: '/pages/index/index' });
      }
    });
  }
});
