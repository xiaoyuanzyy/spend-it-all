// pages/room-wait/room-wait.js
const app = getApp();
const cloud = require('../../utils/cloud.js');
const { getAvatarChar } = require('../../utils/format.js');

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
    // 非房主通过分享进入，需要先加入房间
    if (!this.data.isHost) {
      this.joinThenPoll();
    } else {
      this.loadPlayers();
      this.data.pollTimer = setInterval(() => this.loadPlayers(), 2000);
    }
  },

  onUnload() {
    if (this.data.pollTimer) clearInterval(this.data.pollTimer);
  },

  // 非房主先加入房间，再开始轮询
  async joinThenPoll() {
    // 等待花名初始化完成（新用户点击邀请链接时，app.initNickname 可能尚未完成）
    await this.waitForProfile();
    try {
      const userInfo = app.globalData.userInfo || {};
      await cloud.joinRoom({
        code: this.data.code,
        player: {
          nickname: userInfo.nickname || userInfo.nickName || '神秘富豪',
          avatar: userInfo.avatarUrl || ''
        }
      });
    } catch (e) {
      // 重名 openid 已存在时 joinRoom 会返回 already:true，不影响
    }
    this.loadPlayers();
    this.data.pollTimer = setInterval(() => this.loadPlayers(), 2000);
  },

  // 等待 app.initNickname() 完成，超时 10 秒后不再等待
  waitForProfile() {
    return new Promise(resolve => {
      if (app.globalData.profileReady) return resolve();
      let count = 0;
      const timer = setInterval(() => {
        count++;
        if (app.globalData.profileReady || count >= 50) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
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
          nickname: p.openid === openid ? myNick : p.nickname,
          avatar: getAvatarChar(p.openid === openid ? myNick : p.nickname)
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
