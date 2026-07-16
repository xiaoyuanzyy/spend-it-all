// pages/shop-normal/shop-normal.js
const app = getApp();
const cloud = require('../../utils/cloud.js');
const { formatMoney, formatFull, formatM } = require('../../utils/format.js');

Page({
  data: {
    topHeight: 160,
    budget: 0,
    remaining: 0,
    spent: 0,
    budgetDisplay: '$0',
    budgetPercent: 100,
    products: [],
    allProducts: [],       // 全量商品（缓存）
    cart: [],
    totalDisplay: '$0',
    totalQty: 0,
    itemTypes: 0,
    reaction: '',
    reactionType: '',
    showReaction: false,
    billionaire: null,
    pageSize: 8,
    hasMore: false,
    loadingMore: false,
    loadedCount: 0,
    totalCount: 0,
    // 限时模式
    isTimed: false,
    remain: 30,
    progress: 100,
    timer: null
  },

  onLoad() {
    const b = app.globalData.currentBillionaire || { name: '富豪', tags: [] };
    const isTimed = app.globalData.currentMode === 'timed';
    this.setData({ billionaire: b, isTimed });
    this.loadProducts(b);
    const budget = app.globalData.budget || 50000000;
    this.setData({
      budget: budget,
      remaining: budget,
      budgetDisplay: formatFull(budget),
      budgetPercent: 100
    });
    if (isTimed) this.startCountdown();
  },

  onUnload() {
    if (this.data.timer) clearInterval(this.data.timer);
  },

  onReady() {
    // 测量顶部固定区域高度，设置 padding-top 防止内容被遮挡
    const query = wx.createSelectorQuery();
    query.select('.top-fixed').boundingClientRect(rect => {
      if (rect) this.setData({ topHeight: rect.height });
    }).exec();
  },

  async loadProducts(billionaire) {
    const id = (billionaire && billionaire.id != null) ? billionaire.id : 0;
    try {
      const res = await cloud.getProducts(id);
      console.log('[shop-normal] getProducts 返回', res && res.list && res.list.length, '件');
      if (res && res.list && res.list.length > 0) {
        // 统一 _id → id，确保置办按钮能匹配
        let list = res.list.map(p => {
          const pid = p._id || p.id;
          return {
            ...p,
            id: pid,
            image: p.image || '',
            priceDisplay: formatMoney(p.price),
            purchased: 0
          };
        });
        const firstPage = list.slice(0, this.data.pageSize);
        this.setData({
          allProducts: list,
          products: firstPage,
          hasMore: list.length > this.data.pageSize,
          loadedCount: firstPage.length,
          totalCount: list.length
        });
        console.log('[shop-normal] 首次展示', firstPage.length, '/', list.length, 'hasMore:', list.length > this.data.pageSize);
        return;
      }
    } catch (e) {
      console.warn('[shop-normal] 商品拉取失败', e);
    }
    this.setData({ products: [], allProducts: [], hasMore: false, loadedCount: 0, totalCount: 0 });
  },

  // 页面触底自动加载
  onReachBottom() {
    this.loadMore();
  },

  // 点击手动加载（比滚动触底更可靠）
  onTapLoadMore() {
    this.loadMore();
  },

  loadMore() {
    if (!this.data.hasMore || this.data.loadingMore) {
      console.log('[shop-normal] loadMore 跳过 hasMore:', this.data.hasMore, 'loadingMore:', this.data.loadingMore);
      return;
    }
    console.log('[shop-normal] 加载更多...');
    this.setData({ loadingMore: true });

    setTimeout(() => {
      // 保存当前已展示商品中的购买状态，避免加载更多时丢失
      const purchaseMap = {};
      this.data.products.forEach(p => {
        if (p.purchased > 0) {
          purchaseMap[p.id] = p.purchased;
        }
      });

      const currentLen = this.data.products.length;
      const nextLen = currentLen + this.data.pageSize;
      const moreProducts = this.data.allProducts.slice(0, nextLen);

      // 将购买状态合并到新切片中
      const merged = moreProducts.map(p => {
        const purchased = purchaseMap[p.id];
        if (purchased != null) {
          return { ...p, purchased };
        }
        return p;
      });

      this.setData({
        products: merged,
        hasMore: nextLen < this.data.allProducts.length,
        loadingMore: false,
        loadedCount: merged.length
      });
      console.log('[shop-normal] 已加载', merged.length, '/', this.data.allProducts.length);
    }, 300);
  },

  // 出售：数量归零
  onSell(e) {
    const id = e.currentTarget.dataset.id;
    const products = this.data.products.map(p =>
      String(p.id) === String(id) ? { ...p, purchased: 0 } : p
    );
    this.recalcCart(products);
  },

  recalcCart(products) {
    let total = 0;
    const cart = [];
    products.forEach(p => {
      if (p.purchased > 0) {
        const sub = p.purchased * p.price;
        total += sub;
        cart.push({
          id: p.id, name: p.name, price: p.price,
          qty: p.purchased, subtotalDisplay: formatMoney(sub)
        });
      }
    });
    const remaining = Math.max(0, this.data.budget - total);
    const percent = this.data.budget > 0 ? Math.round(remaining / this.data.budget * 100) : 0;
    app.globalData.cart = cart;
    app.globalData.spent = total;
    let totalQty = 0;
    cart.forEach(c => { totalQty += c.qty; });
    this.setData({
      products, cart,
      totalDisplay: formatM(total),
      totalQty,
      itemTypes: cart.length,
      remaining: remaining,
      budgetDisplay: formatFull(remaining),
      budgetPercent: percent
    });
  },

  onBuy(e) {
    const id = e.currentTarget.dataset.id;
    const product = this.data.products.find(p => String(p.id) === String(id));
    if (!product) return;

    const b = this.data.billionaire;
    const matchTags = (b && b.matchTags) || [];
    const matched = (product.tags || []).some(pt => matchTags.includes(pt));

    // 只有符合品味才买入
    if (matched) {
      const products = this.data.products.map(p =>
        String(p.id) === String(id)
          ? { ...p, purchased: (p.purchased || 0) + 1 }
          : p
      );
      this.recalcCart(products);
    }

    // 弹反应气泡
    this.showReaction(product, matched);
  },

  showReaction(product, matched) {
    const catchphrases = this.data.billionaire && this.data.billionaire.catchphrase
      ? [this.data.billionaire.catchphrase] : ['不错不错！'];
    const reactions = matched
      ? [`"${catchphrases[0]}"`, '👍 好眼光！', '👌 这品味可以！', '🤩 继续挥霍！']
      : ['😒', '🙄', '😑', '😐'];
    const suffix = matched ? '' : '与富豪气质不符不能购买';
    const react = reactions[Math.floor(Math.random() * reactions.length)] + suffix;
    this.setData({ showReaction: true, reaction: react, reactionType: matched ? 'positive' : 'negative' });
    setTimeout(() => this.setData({ showReaction: false }), 1800);
  },

  onConfirm() {
    if (this.data.timer) clearInterval(this.data.timer);
    const total = app.globalData.spent || 0;
    const budget = this.data.budget;
    const success = total >= budget * 0.9;
    // 用页面 data 而非 globalData，避免生命周期中的竞态
    const mode = this.data.isTimed ? 'timed' : 'normal';
    app.globalData.billResult = {
      total,
      budget,
      success,
      billionaire: this.data.billionaire,
      products: this.data.cart,
      mode
    };
    wx.redirectTo({ url: '/pages/bill/bill' });
  },

  // 倒计时
  startCountdown() {
    let remain = 30;
    const t = setInterval(() => {
      remain -= 1;
      this.setData({
        remain,
        progress: (remain / 30) * 100
      });
      if (remain <= 0) {
        clearInterval(t);
        this.onAutoConfirm();
      }
    }, 1000);
    this.setData({ timer: t });
  },

  onAutoConfirm() {
    const total = app.globalData.spent || 0;
    const budget = this.data.budget;
    const success = total >= budget * 0.9;
    // 用页面 data 而非 globalData，避免生命周期中的竞态
    const mode = this.data.isTimed ? 'timed' : 'normal';
    app.globalData.billResult = {
      total,
      budget,
      success,
      billionaire: this.data.billionaire,
      products: this.data.cart,
      mode
    };
    wx.redirectTo({ url: '/pages/bill/bill' });
  }
});
