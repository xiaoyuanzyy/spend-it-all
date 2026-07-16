// app.js
const cloud = require('./utils/cloud.js');

App({
  globalData: {
    userInfo: null,
    openid: null,
    currentBillionaire: null,
    currentMode: 'normal', // normal | timed | challenge
    cart: [], // [{ productId, qty, price, name }]
    budget: 50000000,
    spent: 0,
    selectedBillionaireId: null,
    roomCode: null
  },

  onLaunch() {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('当前微信版本过低，请升级到最新微信');
    } else {
      wx.cloud.init({
        env: 'cloud1-d2g5khfkv2a660d00',
        traceUser: true
      });
    }

    // 获取用户信息
    this.getUserProfile();
  },

  getUserProfile() {
    const that = this;
    wx.getStorage({
      key: 'userInfo',
      success(res) {
        that.globalData.userInfo = res.data;
      }
    });
    wx.getStorage({
      key: 'openid',
      success(res) {
        that.globalData.openid = res.data;
        // 登录云函数换取 openid
        wx.cloud.callFunction({
          name: 'login',
          data: {},
          success(loginRes) {
            that.globalData.openid = loginRes.result.openid;
            wx.setStorage({ key: 'openid', data: loginRes.result.openid });
          }
        });
      },
      fail() {
        wx.cloud.callFunction({
          name: 'login',
          data: {},
          success(loginRes) {
            that.globalData.openid = loginRes.result.openid;
            wx.setStorage({ key: 'openid', data: loginRes.result.openid });
          }
        });
      }
    });
  },

  // 震动反馈
  vibrateShort() {
    wx.vibrateShort({ type: 'medium' });
  }
});
