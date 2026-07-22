// pages/shop-normal/shop-normal.js
const app = getApp();
const cloud = require('../../utils/cloud.js');
const { formatCNY } = require('../../utils/format.js');

Page({
  data: {
    topHeight: 160,
    budget: 0,
    remaining: 0,
    spent: 0,
    budgetDisplay: '¥0',
    budgetPercent: 100,
    products: [],
    allProducts: [],       // 全量商品（缓存）
    cart: [],
    totalDisplay: '¥0',
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
    timerLabel: '⏱ 限时消费',
    remain: 30,
    progress: 100,
    timer: null,
    // 挑战等待
    waiting: false,
    waitingText: '⏳ 等待对手完成…',
    challengePollTimer: null
  },

  onLoad() {
    const b = app.globalData.currentBillionaire || { name: '富豪', tags: [] };
    const currentMode = app.globalData.currentMode || 'normal';
    const isTimed = currentMode === 'timed' || currentMode === 'challenge';
    const timerLabel = currentMode === 'challenge' ? '⏱ 对战限时' : '⏱ 限时消费';
    this.setData({ billionaire: { ...b, name: b.name, matchTags: b.matchTags || b.tags || [] }, isTimed, timerLabel });
    this.loadProducts(b);
    const budget = app.globalData.budget || 50000000;
    this.setData({
      budget: budget,
      remaining: budget,
      budgetDisplay: formatCNY(budget),
      budgetPercent: 100
    });
    if (isTimed) this.startCountdown();
  },

  onBack() {
    if (this.data.timer) clearInterval(this.data.timer);
    this.stopChallengePoll();
    wx.reLaunch({ url: '/pages/index/index' });
  },

  onUnload() {
    if (this.data.timer) clearInterval(this.data.timer);
    this.stopChallengePoll();
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
    // 获取富豪匹配标签
    const matchTags = (billionaire && billionaire.matchTags && billionaire.matchTags.length)
      ? billionaire.matchTags
      : ((billionaire && billionaire.tags) || []);
    try {
      const res = await cloud.getProducts(id);
      if (res && res.list && res.list.length > 0) {
        // 统一 _id → id，确保置办按钮能匹配
        let list = res.list.map(p => {
          const pid = p._id || p.id;
          const productTags = p.tags || [];
          const matched = productTags.some(pt => matchTags.includes(pt));
          return {
            ...p,
            id: pid,
            image: p.image || '',
            priceDisplay: formatCNY(p.price),
            purchased: 0,
            productTags,
            matched
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
      return;
    }
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
    }, 300);
  },

  // 出售：数量归零
  onSell(e) {
    if (this.data.waiting) return;
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
          qty: p.purchased, subtotalDisplay: formatCNY(sub)
        });
      }
    });
    const remaining = this.data.budget - total;
    const percent = this.data.budget > 0 ? Math.round(remaining / this.data.budget * 100) : 0;
    app.globalData.cart = cart;
    app.globalData.spent = total;
    // 单个商品数量跌回 30 以下时清除该商品的震动标记
    if (!this._vibratedProducts) this._vibratedProducts = {};
    products.forEach(p => {
      if ((p.purchased || 0) < 30) delete this._vibratedProducts[String(p.id)];
    });
    let totalQty = 0;
    cart.forEach(c => { totalQty += c.qty; });
    this.setData({
      products, cart,
      totalDisplay: formatCNY(total),
      totalQty,
      itemTypes: cart.length,
      remaining: remaining,
      budgetDisplay: formatCNY(remaining),
      budgetPercent: percent
    });
  },

  onBuy(e) {
    if (this.data.waiting) return;
    const id = e.currentTarget.dataset.id;
    const product = this.data.products.find(p => String(p.id) === String(id));
    if (!product) return;

    const b = this.data.billionaire;
    const matchTags = (b && b.matchTags && b.matchTags.length) ? b.matchTags : ((b && b.tags) || []);
    const matched = (product.tags || []).some(pt => matchTags.includes(pt));

    // 与富豪不匹配的商品点击时震动提示（vibrateLong 兼容 iOS/Android）
    if (!matched) {
      wx.vibrateLong();
    }

    // 只有符合品味才买入
    if (matched) {
      // 单商品限购 30 件
      if ((product.purchased || 0) >= 30) {
        wx.showToast({ title: '一个商品最多买30件', icon: 'none', duration: 1500 });
        return;
      }
      const products = this.data.products.map(p =>
        String(p.id) === String(id)
          ? { ...p, purchased: (p.purchased || 0) + 1 }
          : p
      );
      this.recalcCart(products);

      // 单个商品达到 30 件时震动提示（每商品仅震一次，iOS/Android 通用）
      if (!this._vibratedProducts) this._vibratedProducts = {};
      const newQty = (product.purchased || 0) + 1;
      if (newQty >= 30 && !this._vibratedProducts[String(id)]) {
        this._vibratedProducts[String(id)] = true;
        wx.vibrateLong();
      }
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
    if (this.data.waiting) return;
    // 普通模式下，没有选择任何商品时提示
    if (!this.data.isTimed && this.data.totalQty === 0) {
      wx.showToast({ title: '还没置办商品，快去逛逛吧', icon: 'none', duration: 2000 });
      return;
    }
    if (this.data.timer) clearInterval(this.data.timer);
    const total = app.globalData.spent || 0;
    const budget = this.data.budget;
    const currentMode = app.globalData.currentMode || 'normal';
    const mode = currentMode === 'challenge' ? 'challenge' : (this.data.isTimed ? 'timed' : 'normal');

    // 挑战模式：先提交房间结果，云函数会判定胜负并写入数据库
    if (currentMode === 'challenge') {
      this.submitChallengeAndGo(total, budget, mode);
      return;
    }

    // normal/timed：success 为空（不适用）
    app.globalData.billResult = {
      total,
      budget,
      success: null,
      billionaire: this.data.billionaire,
      products: this.data.cart,
      mode
    };
    wx.redirectTo({ url: '/pages/bill/bill' });
  },

  // 挑战模式：提交结果 → 云函数判定胜负 → 等待对手或直接跳结果
  async submitChallengeAndGo(total, budget, mode) {
    wx.showLoading({ title: '提交结果中…' });
    try {
      const userInfo = app.globalData.userInfo || {};
      const myNickname = userInfo.nickname || userInfo.nickName || '';

      // 1. 先保存账单到数据库（submitRoomResult 后需更新账单的 success 字段）
      await cloud.saveBill({
        billionaireId: (this.data.billionaire && this.data.billionaire.id) || 0,
        billionaireName: (this.data.billionaire && this.data.billionaire.name) || '富豪',
        products: this.data.cart,
        total: total,
        budget: budget,
        over: Math.max(0, total - budget),
        success: null,
        mode: 'challenge',
        createdAt: Date.now(),
        nickname: myNickname
      });

      // 2. 提交房间结果
      const res = await cloud.submitRoomResult({
        code: app.globalData.roomCode,
        amount: total,
        nickname: myNickname
      });

      wx.hideLoading();

      // 3. 存储结果数据供 result 页面使用
      app.globalData.challengeResult = res;

      const players = res.players || [];
      const maxAmount = res.allDone ? Math.max(...players.map(p => p.amount || 0)) : 0;
      app.globalData.billResult = {
        total,
        budget,
        success: res.allDone ? (total >= maxAmount) : null,
        billionaire: this.data.billionaire,
        products: this.data.cart,
        mode: 'challenge'
      };

      if (res.allDone) {
        // 双方都已提交 → 直接跳结果页
        wx.redirectTo({ url: '/pages/result/result' });
      } else {
        // 等待对手 → 停止计时器，显示等待遮罩
        if (this.data.timer) clearInterval(this.data.timer);
        this.setData({ waiting: true, waitingText: '⏳ 等待对手完成…' });
        this.startChallengePoll();
      }
    } catch (e) {
      wx.hideLoading();
      console.error('[submitChallengeAndGo]', e);
      wx.showToast({ title: '提交失败，请重试', icon: 'none' });
    }
  },

  // 轮询等待对手提交
  startChallengePoll() {
    this.stopChallengePoll();
    const pollTimer = setInterval(async () => {
      try {
        const room = await cloud.getRoom({ code: app.globalData.roomCode });
        if (room && room.status === 'finished' && room.players && room.players.length >= 2) {
          this.stopChallengePoll();

          // 更新胜负结果
          const billResult = app.globalData.billResult || {};
          const maxAmount = Math.max(...room.players.map(p => p.amount || 0));
          app.globalData.challengeResult = room;
          app.globalData.billResult = { ...billResult, success: (billResult.total || 0) >= maxAmount };

          wx.redirectTo({ url: '/pages/result/result' });
        }
      } catch (e) {
        // 轮询失败，静默忽略
      }
    }, 2000);
    this.setData({ challengePollTimer: pollTimer });
  },

  stopChallengePoll() {
    if (this.data.challengePollTimer) {
      clearInterval(this.data.challengePollTimer);
      this.setData({ challengePollTimer: null });
    }
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
    const currentMode = app.globalData.currentMode || 'normal';
    const mode = currentMode === 'challenge' ? 'challenge' : (this.data.isTimed ? 'timed' : 'normal');

    // 挑战模式：提交房间结果
    if (currentMode === 'challenge') {
      this.submitChallengeAndGo(total, budget, mode);
      return;
    }

    const success = null;
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
