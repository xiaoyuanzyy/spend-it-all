// pages/room-wait/room-wait.js
const app = getApp();
const cloud = require('../../utils/cloud.js');

Page({
  data: {
    code: '',
    isHost: false,
    players: [],
    pollTimer: null,
    statusBarHeight: 0
  },

  onLoad(options) {
    const sys = wx.getSystemInfoSync();
    this.setData({
      code: options.code || 'BTL-0000',
      isHost: options.host === '1',
      statusBarHeight: sys.statusBarHeight || 44
    });
    this.loadPlayers();
    // 轮询
    this.data.pollTimer = setInterval(() => this.loadPlayers(), 2000);
  },

  onUnload() {
    if (this.data.pollTimer) clearInterval(this.data.pollTimer);
  },

  async loadPlayers() {
    // 当前用户信息
    const userInfo = app.globalData.userInfo || {};
    const myNick = userInfo.nickname || userInfo.nickName || '我';
    const myAvatar = userInfo.avatarUrl || '';

    try {
      const res = await cloud.getRoom({ code: this.data.code });
      if (res && res.players) {
        // 使用房间中房主的富豪信息，确保所有玩家一致
        if (res.billionaire) {
          app.globalData.currentBillionaire = res.billionaire;
        }
        // 标记当前用户
        const openid = app.globalData.openid;
        const players = res.players.map(p => ({
          ...p,
          isMe: p.openid === openid,
          nickname: p.openid === openid ? myNick : p.nickname
        }));
        this.setData({ players });
        if (res.status === 'started') {
          this.goToGame();
          return;
        }
      }
    } catch (e) {
      // 兜底本地玩家
      this.setData({
        players: [
          { openid: 'self', nickname: myNick, avatar: myAvatar, isHost: true, slot: 'P1', isMe: true },
          { openid: 'p2', nickname: '等待加入...', avatar: '', isHost: false, slot: 'P2', isMe: false }
        ]
      });
    }
  },

  onCopy() {
    wx.setClipboardData({
      data: this.data.code,
      success: () => wx.showToast({ title: '已复制' })
    });
  },

  onShareAppMessage() {
    return {
      title: `来对战吧！房间号 ${this.data.code}`,
      path: `/pages/room-wait/room-wait?code=${this.data.code}`,
      imageUrl: ''
    };
  },

  onStart() {
    if (this.data.players.length < 2) {
      wx.showToast({ title: '至少需要 2 人', icon: 'none' });
      return;
    }
    cloud.startRoom({ code: this.data.code }).then(() => {
      if (this.data.pollTimer) clearInterval(this.data.pollTimer);
      this.goToGame();
    }).catch(() => {
      this.goToGame();
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
