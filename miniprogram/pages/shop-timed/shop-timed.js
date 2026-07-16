// pages/shop-timed/shop-timed.js
const app = getApp();
const cloud = require('../../utils/cloud.js');
const { formatMoney } = require('../../utils/format.js');

Page({
  data: {
    budget: 0,
    budgetDisplay: '$0',
    totalDisplay: '$0',
    products: [],
    cart: [],
    remain: 30,
    progress: 0,
    showReaction: false,
    reaction: '',
    reactionType: '',
    timer: null
  },

  onLoad() {
    const id = app.globalData.currentBillionaire
      ? (app.globalData.currentBillionaire.id || 0)
      : 0;
    this.loadProducts(id);
    this.setData({
      budget: app.globalData.budget || 50000000,
      budgetDisplay: formatMoney(app.globalData.budget || 50000000)
    });
    this.startCountdown();
  },

  async loadProducts(billionaireId) {
    try {
      const res = await cloud.getProducts(billionaireId);
      if (res && res.list && res.list.length > 0) {
        const list = res.list.map(p => ({
          ...p,
          priceDisplay: formatMoney(p.price),
          purchased: 0
        }));
        this.setData({ products: list });
        return;
      }
    } catch (e) {
      console.warn('商品拉取失败', e);
    }
    this.setData({ products: [] });
  },

  onUnload() {
    if (this.data.timer) clearInterval(this.data.timer);
  },

  startCountdown() {
    let remain = 30;
    const t = setInterval(() => {
      remain -= 1;
      this.setData({
        remain,
        progress: ((30 - remain) / 30) * 100
      });
      if (remain <= 0) {
        clearInterval(t);
        this.onAutoConfirm();
      }
    }, 1000);
    this.setData({ timer: t });
  },

  onQtyChange(e) {
    const id = e.currentTarget.dataset.id;
    const val = parseInt(e.detail.value, 10) || 0;
    this.updateQty(id, val);
  },

  onBuy(e) {
    const id = e.currentTarget.dataset.id;
    const target = this.data.products.find(p => p.id === id);
    if (target) this.updateQty(id, (target.purchased || 0) + 1, true);
  },

  updateQty(id, qty, withReaction = false) {
    const products = this.data.products.map(p =>
      p.id === id ? { ...p, purchased: qty } : p
    );
    let total = 0;
    const cart = [];
    products.forEach(p => {
      if (p.purchased > 0) {
        const sub = p.purchased * p.price;
        total += sub;
        cart.push({ id: p.id, name: p.name, price: p.price, qty: p.purchased, subtotalDisplay: formatMoney(sub) });
      }
    });
    app.globalData.cart = cart;
    app.globalData.spent = total;
    this.setData({ products, cart, totalDisplay: formatMoney(total) });
    if (withReaction) {
      this.giveReaction(id, products);
    }
  },

  giveReaction(productId, products) {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    const b = app.globalData.currentBillionaire || { tags: [] };
    const match = p.tags.some(t => b.tags && b.tags.includes(t));
    const positive = match;
    const reactions = positive
      ? ['👌 好品味！', '👍 不错！', '🤩 继续！']
      : ['🙄 这啥？', '😒 不行', '😑 一般'];
    const react = reactions[Math.floor(Math.random() * reactions.length)];
    app.vibrateShort();
    this.setData({ showReaction: true, reaction: react, reactionType: positive ? 'positive' : 'negative' });
    setTimeout(() => this.setData({ showReaction: false }), 1500);
  },

  onAutoConfirm() {
    const total = app.globalData.spent || 0;
    const budget = this.data.budget;
    const success = total >= budget * 0.9;
    app.globalData.billResult = { total, budget, success, mode: 'timed', products: this.data.cart };
    wx.redirectTo({ url: '/pages/bill/bill' });
  }
});
