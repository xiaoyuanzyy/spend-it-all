// pages/bill/bill.js
const app = getApp();
const cloud = require('../../utils/cloud.js');
const { formatMoney, formatCNY, today } = require('../../utils/format.js');

Page({
  data: {
    items: [],
    totalDisplay: '$0',
    overDisplay: '$0',
    remainingDisplay: '$0',
    isOver: false,
    title: '',
    period: '',
    billionName: '',
    mode: 'normal',
    scrollHeight: 400,
    totalQty: 0,
    itemTypes: 0,
    progress: 0,
    stars: 1,
    starsText: '★☆☆☆☆',
    happy: false,
    moodEmoji: '😡',
    statusBarHeight: 44
  },

  onLoad() {
    const result = app.globalData.billResult || { products: [], total: 0, budget: 0, success: false, billionaire: null };
    const billionaire = result.billionaire || { name: '富豪' };
    const items = (result.products || []).map(p => ({
      ...p,
      unitPriceDisplay: formatMoney(p.price)
    }));
    const over = Math.max(0, result.total - result.budget);
    const remaining = Math.max(0, result.budget - result.total);
    // 花费进度百分比
    const progress = result.budget > 0 ? Math.min(100, Math.round(result.total / result.budget * 100)) : 0;
    // 星级：每20%一颗星，最低1星，超100%也是5星
    let stars = 1;
    if (progress >= 100) stars = 5;
    else if (progress >= 80) stars = 4;
    else if (progress >= 60) stars = 3;
    else if (progress >= 40) stars = 2;
    else if (progress >= 20) stars = 1;
    const happy = stars >= 3;
    // 生成星级字符串 ★☆☆☆☆
    let starsText = '';
    for (let i = 0; i < 5; i++) starsText += i < stars ? '★' : '☆';
    // 计算商品总件数和种类数
    let totalQty = 0;
    items.forEach(item => { totalQty += item.qty || 0; });
    this.setData({
      items,
      totalDisplay: formatCNY(result.total),
      overDisplay: formatCNY(over),
      remainingDisplay: formatCNY(remaining),
      isOver: over > 0,
      billionName: billionaire.name,
      title: result.success ? '预算暴表！富豪已报警' : '省钱失败！富豪表示不高兴',
      period: '加载中…',
      mode: result.mode || 'normal',
      totalQty,
      itemTypes: items.length,
      progress,
      stars,
      starsText,
      happy,
      moodEmoji: happy ? '😊' : '😡'
    });
    // 先上传账单，完成后查询期数
    this.uploadBillAndFetchPeriod(result);
  },

  async uploadBillAndFetchPeriod(result) {
    const saveRes = await this.uploadBill(result);
    // 使用云函数返回的固定期数，不受删除影响
    const period = (saveRes && saveRes.period) ? saveRes.period : 1;
    this.setData({ period: `2026财年 — 第${period}期` });
  },

  onReady() {
    // 获取状态栏高度用于自定义导航栏
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight || 44 });

    // 测量所有固定区域高度，计算商品表格滚动区可用高度
    const query = wx.createSelectorQuery();
    let headerH = 0, summaryH = 0, statusH = 0, bottomH = 0;
    query.select('#bill-header').boundingClientRect(rect => { if (rect) headerH = rect.height; });
    query.select('#bill-summary').boundingClientRect(rect => { if (rect) summaryH = rect.height; });
    query.select('#bill-status').boundingClientRect(rect => { if (rect) statusH = rect.height; });
    query.select('#bill-bottom').boundingClientRect(rect => { if (rect) bottomH = rect.height; });
    query.exec(() => {
      // 60rpx 为 summary 和 status-box 的上下间距留余，避免底部固定按钮遮挡
      const h = sys.windowHeight - headerH - summaryH - statusH - bottomH - 60;
      if (h > 0) this.setData({ scrollHeight: h });
    });
  },

  uploadBill(result) {
    return new Promise(async (resolve) => {
      // 等待 openid 就绪
      let retries = 0;
      while (!app.globalData.openid && retries < 60) {
        await new Promise(r => setTimeout(r, 500));
        retries++;
      }
      if (!app.globalData.openid) {
        console.warn('[bill] 账单上传失败：等待 openid 超时');
        resolve(null);
        return;
      }
      try {
        const res = await cloud.saveBill({
          billionaireId: (result.billionaire && result.billionaire.id) || 0,
          billionaireName: (result.billionaire && result.billionaire.name) || '富豪',
          products: result.products,
          total: result.total,
          budget: result.budget,
          over: Math.max(0, result.total - result.budget),
          success: result.success,
          mode: result.mode || 'normal',
          createdAt: Date.now()
        });
        resolve(res);
      } catch (e) {
        console.warn('[bill] 账单上传失败', e);
        resolve(null);
      }
    });
  },

  onReplay() {
    wx.reLaunch({ url: '/pages/index/index' });
  },

  onShare() {
    wx.showToast({ title: '请使用右上角分享', icon: 'none' });
  },

  onHistory() {
    wx.navigateTo({ url: '/pages/profile/profile' });
  },

  onBack() {
    wx.reLaunch({ url: '/pages/index/index' });
  }
});
