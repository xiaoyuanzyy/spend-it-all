// pages/rules/rules.js
Page({
  data: {
    statusBarHeight: 44
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight || 44 });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  }
});
