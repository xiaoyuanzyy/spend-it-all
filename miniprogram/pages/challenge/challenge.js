// pages/challenge/challenge.js
const app = getApp();
const cloud = require('../../utils/cloud.js');
const { formatMoney, shortName } = require('../../utils/format.js');

Page({
  data: {
    statusBarHeight: 20,
    roomCode: '',    // 输入的房间号
    billionaire: {   // 当前抽取的富豪信息
      name: '',
      avatar: '',
      assetsDisplay: ''
    }
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight });

    // 读取全局数据中的富豪信息
    const b = app.globalData.currentBillionaire;
    if (b && b.name) {
      const dName = shortName(b.name);
      this.setData({
        billionaire: {
          name: dName,
          avatar: (dName || '?')[0],
          assetsDisplay: formatMoney(b.assets || 0)
        }
      });
    }
  },

  // 输入房间号
  onInputCode(e) {
    this.setData({ roomCode: e.detail.value.toUpperCase() });
  },

  // 创建房间
  onCreateRoom() {
    const userInfo = app.globalData.userInfo || {};
    const b = app.globalData.currentBillionaire;
    wx.showLoading({ title: '创建房间中…' });

    cloud.createRoom({
      host: {
        nickname: userInfo.nickname || userInfo.nickName || '玩家',
        avatar: userInfo.avatarUrl || ''
      },
      billionaire: b || null
    }).then(res => {
      wx.hideLoading();
      app.globalData.roomCode = res.code;
      app.globalData.currentMode = 'challenge';
      wx.redirectTo({ url: `/pages/room-wait/room-wait?code=${res.code}&host=1` });
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '创建失败，请重试', icon: 'none' });
    });
  },

  // 加入房间
  onJoinRoom() {
    const code = this.data.roomCode.trim();
    if (!code) {
      wx.showToast({ title: '请输入房间号', icon: 'none' });
      return;
    }

    const userInfo = app.globalData.userInfo || {};
    wx.showLoading({ title: '加入房间中…' });

    cloud.joinRoom({
      code: code,
      player: {
        nickname: userInfo.nickname || userInfo.nickName || '玩家',
        avatar: userInfo.avatarUrl || ''
      }
    }).then(() => {
      wx.hideLoading();
      app.globalData.roomCode = code;
      app.globalData.currentMode = 'challenge';
      wx.redirectTo({ url: `/pages/room-wait/room-wait?code=${code}` });
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '加入失败，请检查房间号', icon: 'none' });
    });
  },

  // 返回
  onBack() {
    wx.reLaunch({ url: '/pages/index/index' });
  }
});
