// pages/room-wait/room-wait.js
const app = getApp();
const cloud = require('../../utils/cloud.js');

Page({
  data: {
    code: '',
    isHost: false,
    players: [],
    pollTimer: null
  },

  onLoad(options) {
    this.setData({
      code: options.code || 'BTL-0000',
      isHost: options.host === '1'
    });
    this.loadPlayers();
    // 轮询
    this.data.pollTimer = setInterval(() => this.loadPlayers(), 2000);
  },

  onUnload() {
    if (this.data.pollTimer) clearInterval(this.data.pollTimer);
  },

  async loadPlayers() {
    try {
      const res = await cloud.getRoom({ code: this.data.code });
      if (res && res.players) {
        this.setData({ players: res.players });
        if (res.status === 'started') {
          this.goReady(res);
        }
      }
    } catch (e) {
      // 兜底本地玩家
      this.setData({
        players: [
          { openid: 'self', nickname: '富一代·布莱恩', avatar: '', isHost: true, slot: 'P1' },
          { openid: 'p2', nickname: '等待加入...', avatar: '', isHost: false, slot: 'P2' }
        ]
      });
    }
  },

  goReady(res) {
    if (this.data.pollTimer) clearInterval(this.data.pollTimer);
    wx.redirectTo({ url: `/pages/room-ready/room-ready?code=${this.data.code}` });
  },

  onCopy() {
    wx.setClipboardData({
      data: this.data.code,
      success: () => wx.showToast({ title: '已复制' })
    });
  },

  onInvite() {
    wx.showShareMenu({ withShareTicket: true });
  },

  onStart() {
    if (this.data.players.length < 2) {
      wx.showToast({ title: '至少需要 2 人', icon: 'none' });
      return;
    }
    cloud.startRoom({ code: this.data.code }).then(() => {
      if (this.data.pollTimer) clearInterval(this.data.pollTimer);
      wx.redirectTo({ url: `/pages/room-ready/room-ready?code=${this.data.code}&start=1` });
    }).catch(() => {
      wx.redirectTo({ url: `/pages/room-ready/room-ready?code=${this.data.code}&start=1` });
    });
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
