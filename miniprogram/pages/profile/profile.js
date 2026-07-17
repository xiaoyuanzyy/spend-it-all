// pages/profile/profile.js
const app = getApp();
const cloud = require('../../utils/cloud.js');
const { formatMoney, formatCNY } = require('../../utils/format.js');

Page({
  data: {
    user: {
      nickname: '富一代·布莱恩',
      vip: '0000420',
      avatar: '布',
      role: '首席挥霍官'
    },
    stats: { rescued: 3, spent: 88879000, badges: 5, spentDisplay: '0' },
    bills: [],
    expandedIndex: -1,
    statusBarHeight: 44
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight || 44 });
    this.loadBills();
  },

  onShow() {
    this.loadBills();
  },

  formatDate(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  async loadBills() {
    try {
      const res = await cloud.getBills();
      if (res && res.list) {
        const modeMap = { normal: '普通消费', timed: '限时挑战', challenge: '好友对战' };
        const list = res.list.map((b, idx) => {
          const products = b.products || [];
          const prog = b.budget > 0 ? Math.round(b.total / b.budget * 100) : 0;
          return {
            ...b,
            amountDisplay: formatCNY(b.total),
            topProducts: products.slice(0, 3),
            productCount: products.length,
            period: b.period || (res.list.length - idx),
            timeDisplay: this.formatDate(b.createdAt),
            progress: Math.min(prog, 100),
            isOver: b.over > 0,
            modeLabel: modeMap[b.mode] || '普通消费',
            modeKey: b.mode || 'normal'
          };
        });
        // 汇总：挥霍金额 = 所有账单总和
        const total = list.reduce((s, b) => s + (b.total || 0), 0);
        this.setData({
          bills: list,
          'stats.spent': total,
          'stats.spentDisplay': formatMoney(total).replace('$', '')
        });
      }
    } catch (e) {
      // 本地兜底
      this.setData({ bills: [] });
    }
  },

  onExpand(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ expandedIndex: this.data.expandedIndex === idx ? -1 : idx });
  },

  async onDelete(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const { confirm } = await new Promise(r => wx.showModal({
      title: '确认删除',
      content: '此操作不可恢复',
      success: r
    }));
    if (!confirm) return;
    try {
      const res = await cloud.deleteBill(id);
      console.log('[delete] res', JSON.stringify(res));
      if (res && res.ok) {
        wx.showToast({ title: '已删除', icon: 'success', duration: 1000 });
      } else {
        console.error('[delete] 云函数返回失败', res);
        wx.showToast({ title: (res && res.error) || '删除失败', icon: 'none' });
      }
    } catch (err) {
      console.error('[delete] 异常', err);
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
    this.loadBills();
  },

  onClear() {
    const that = this;
    wx.showModal({
      title: '清空所有账单',
      content: '此操作不可恢复',
      success: async (r) => {
        if (r.confirm) {
          try { await cloud.clearBills(); } catch (e) {}
          that.setData({ bills: [], 'stats.spent': 0, 'stats.spentDisplay': '0' });
        }
      }
    });
  },

  onEdit() {
    wx.showToast({ title: '修改昵称功能开发中', icon: 'none' });
  },

  onRetire() {
    wx.showModal({
      title: '提示',
      content: '确定要卸任富豪助理吗？',
      success: r => {
        if (r.confirm) wx.reLaunch({ url: '/pages/index/index' });
      }
    });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  }
});
