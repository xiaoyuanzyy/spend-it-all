// pages/shop-timed/shop-timed.js
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
    // 倒计时
    remain: 30,
    progress: 0,
    timer: null,
    // 挑战模式等待
    waiting: false,
    readyCount: 0,
    totalPlayers: 0
  },

  async onLoad() {
    const mode = app.globalData.currentMode;
    if (mode === 'challenge') {
      // 挑战模式：直接从云端房间拉取富豪数据，确保所有玩家完全一致
      await this.loadBillionaireFromRoom();
    }
    // 非挑战模式 或 云端取回失败时走本地兜底
    if (!this.data.billionaire || !this.data.billionaire.name) {
      const b = app.globalData.currentBillionaire || { name: '富豪', tags: [] };
      this.setData({ billionaire: b });
      this.loadProducts(b);
    }
    const budget = app.globalData.budget || 50000000;
    this.setData({
      budget: budget,
      remaining: budget,
      budgetDisplay: formatFull(budget),
      budgetPercent: 100
    });
    this.startCountdown();
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  // 挑战模式：直接从房间数据拉取富豪信息（最可靠的来源）
  async loadBillionaireFromRoom() {
    const roomCode = app.globalData.roomCode;
    if (!roomCode) return;

    try {
      const res = await cloud.getRoom({ code: roomCode });
      if (res && res.billionaire && res.billionaire.name) {
        const b = res.billionaire;
        // 同步到全局数据
        app.globalData.currentBillionaire = b;
        app.globalData.budget = b.assets || 50000000;
        this.setData({ billionaire: b });
        this.loadProducts(b);
      }
    } catch (e) {
      console.warn('[shop-timed] 从房间拉取富豪失败', e);
    }
  },

  onReady() {
    // 测量顶部固定区域高度，设置 padding-top 防止内容被遮挡
    const query = wx.createSelectorQuery();
    query.select('.top-fixed').boundingClientRect(rect => {
      if (rect) this.setData({ topHeight: rect.height });
    }).exec();
  },

  onUnload() {
    if (this.data.timer) clearInterval(this.data.timer);
    if (this.data.resultTimer) clearInterval(this.data.resultTimer);
  },

  // 倒计时
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

  async loadProducts(billionaire) {
    const id = (billionaire && billionaire.id != null) ? billionaire.id : 0;
    try {
      const res = await cloud.getProducts(id);
      console.log('[shop-timed] getProducts 返回', res && res.list && res.list.length, '件');
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
        console.log('[shop-timed] 首次展示', firstPage.length, '/', list.length, 'hasMore:', list.length > this.data.pageSize);
        return;
      }
    } catch (e) {
      console.warn('[shop-timed] 商品拉取失败', e);
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
      console.log('[shop-timed] loadMore 跳过 hasMore:', this.data.hasMore, 'loadingMore:', this.data.loadingMore);
      return;
    }
    console.log('[shop-timed] 加载更多...');
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
      console.log('[shop-timed] 已加载', merged.length, '/', this.data.allProducts.length);
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

    // 与富豪不匹配的商品点击时震动提示
    if (!matched) {
      wx.vibrateShort({ type: 'medium' });
    }

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
    // 挑战模式：提交结果，等待全员完成
    if (app.globalData.currentMode === 'challenge') {
      this.submitAndWait();
      return;
    }
    this.goToBill();
  },

  goToBill() {
    const total = app.globalData.spent || 0;
    const budget = this.data.budget;
    const success = total >= budget * 0.9;
    app.globalData.billResult = {
      total,
      budget,
      success,
      billionaire: this.data.billionaire,
      products: this.data.cart,
      mode: app.globalData.currentMode
    };
    wx.redirectTo({ url: '/pages/bill/bill' });
  },

  // 挑战模式：提交结果并等待全员
  async submitAndWait() {
    const total = app.globalData.spent || 0;
    const budget = this.data.budget;
    // 保存账单数据，供结果页「查看账单」跳转使用
    app.globalData.billResult = {
      total,
      budget,
      success: total >= budget * 0.9,
      billionaire: this.data.billionaire,
      products: this.data.cart,
      mode: 'challenge'
    };
    const roomCode = app.globalData.roomCode;

    if (!roomCode) {
      wx.showToast({ title: '房间异常，返回首页', icon: 'none' });
      setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 1500);
      return;
    }

    this.setData({ waiting: true, readyCount: 1, totalPlayers: '?' });

    try {
      const res = await cloud.submitRoomResult({ code: roomCode, amount: total });
      if (!res || !res.ok) {
        wx.showToast({ title: '提交失败', icon: 'none' });
        this.setData({ waiting: false });
        return;
      }

      if (res.allDone) {
        this.goToResult(res.players);
      } else {
        // 显示等待，轮询
        const doneCount = res.players.filter(p => p.amount > 0).length;
        this.setData({ readyCount: doneCount, totalPlayers: res.players.length });
        this.data.resultTimer = setInterval(() => this.pollResult(), 2000);
      }
    } catch (e) {
      console.warn('[shop-timed] 提交结果失败', e);
      wx.showToast({ title: '提交失败', icon: 'none' });
      this.setData({ waiting: false });
    }
  },

  async pollResult() {
    try {
      const res = await cloud.getRoom({ code: app.globalData.roomCode });
      if (!res || !res.players) return;

      const doneCount = res.players.filter(p => p.amount > 0).length;
      this.setData({ readyCount: doneCount, totalPlayers: res.players.length });

      if (res.status === 'finished' || doneCount >= res.players.length) {
        if (this.data.resultTimer) clearInterval(this.data.resultTimer);
        this.goToResult(res.players);
      }
    } catch (e) {
      // ignore
    }
  },

  goToResult(players) {
    if (this.data.resultTimer) clearInterval(this.data.resultTimer);
    app.globalData.challengeResult = { players };
    wx.redirectTo({ url: '/pages/result/result' });
  },

  onAutoConfirm() {
    if (this.data.timer) clearInterval(this.data.timer);
    // 挑战模式：提交结果，等待全员完成
    if (app.globalData.currentMode === 'challenge') {
      this.submitAndWait();
      return;
    }
    this.goToBill();
  },
});
